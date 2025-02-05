import {
	App,
	getFrontMatterInfo,
	Notice,
	Plugin,
	PluginManifest,
} from "obsidian";
import { replaceLinks } from "./replace-links";
import {
	AutomaticLinkerPluginSettingsTab,
	AutomaticLinkerSettings,
	DEFAULT_SETTINGS,
} from "./settings";
import PCancelable from "p-cancelable";
import throttle from "just-throttle";
import { buildCandidateTrie, TrieNode } from "./trie";

export default class AutomaticLinkerPlugin extends Plugin {
	settings: AutomaticLinkerSettings;
	// List of markdown file paths (without the ".md" extension)
	private allFileNames: string[] = [];
	// Pre-built Trie for link candidate lookup
	private trie: TrieNode | null = null;
	// Mapping from candidate string to its canonical replacement
	private candidateMap: Map<string, string> | null = null;
	// Holds the currently running modifyLinks task (cancelable)
	private currentModifyLinks: PCancelable<void> | null = null;
	// Backup storage to hold original file content before modification (keyed by file path)
	private backupContent: Map<string, string> = new Map();
	// Preserved callback for the original save command
	private originalSaveCallback: (() => Promise<void>) | undefined;

	constructor(app: App, pluginManifest: PluginManifest) {
		super(app, pluginManifest);
	}

	// Cancelable function to modify links in the active file
	async modifyLinks() {
		// If a previous task is running, cancel it first.
		if (this.currentModifyLinks) {
			this.currentModifyLinks.cancel();
		}

		const cancelableTask = new PCancelable<void>(
			async (resolve, reject, onCancel) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					resolve();
					return;
				}

				let canceled = false;
				onCancel(() => {
					canceled = true;
				});

				try {
					// Read the current file content
					const fileContent = await this.app.vault.read(activeFile);
					// Save a backup before making any modifications
					this.backupContent.set(activeFile.path, fileContent);

					if (canceled) {
						return reject(new PCancelable.CancelError());
					}
					console.log(
						new Date().toISOString(),
						"modifyLinks started",
					);

					// Use the pre-built trie and candidateMap to replace links.
					// Fallback to an empty trie if not built.
					const updatedContent = await replaceLinks({
						fileContent,
						trie: this.trie ?? buildCandidateTrie([]).trie,
						candidateMap: this.candidateMap ?? new Map(),
						minCharCount: this.settings.minCharCount,
						getFrontMatterInfo,
					});

					console.log(
						new Date().toISOString(),
						"modifyLinks finished",
					);

					if (canceled) {
						return reject(new PCancelable.CancelError());
					}
					// Overwrite the file with the updated content.
					await this.app.vault.modify(activeFile, updatedContent);
					resolve();
				} catch (error) {
					reject(error);
				}
			},
		);

		this.currentModifyLinks = cancelableTask;
		return cancelableTask;
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(
			new AutomaticLinkerPluginSettingsTab(this.app, this),
		);

		// Function to load file data and build the Trie.
		const refreshFileDataAndTrie = () => {
			const allMarkdownFiles = this.app.vault.getMarkdownFiles();
			const allFileNames = allMarkdownFiles.map((file) =>
				file.path.replace(/\.md$/, ""),
			);
			// Sort filenames in descending order (longer paths first)
			allFileNames.sort((a, b) => b.length - a.length);
			this.allFileNames = allFileNames;

			// Build candidateMap and Trie using the helper function from trie.ts.
			const { candidateMap, trie } = buildCandidateTrie(
				allFileNames,
				this.settings.baseDirs ?? ["pages"],
			);
			this.candidateMap = candidateMap;
			this.trie = trie;

			if (this.settings.showNotice) {
				new Notice(
					`Automatic Linker: Loaded all markdown files. (${allFileNames.length} files)`,
				);
			}
		};

		// Load file data and build the Trie when the layout is ready.
		this.app.workspace.onLayoutReady(() => {
			refreshFileDataAndTrie();
			console.log("Automatic Linker: Loaded all markdown files.");
			console.log("this.allFileNames.length", this.allFileNames.length);

			this.registerEvent(
				this.app.vault.on("delete", () => refreshFileDataAndTrie()),
			);
			this.registerEvent(
				this.app.vault.on("create", () => refreshFileDataAndTrie()),
			);
			this.registerEvent(
				this.app.vault.on("rename", () => refreshFileDataAndTrie()),
			);
		});

		// Command: Manually trigger link replacement for the current file.
		this.addCommand({
			id: "automatic-linker:link-current-file",
			name: "Link current file",
			editorCallback: async () => {
				try {
					await this.modifyLinks();
				} catch (error) {
					if (error instanceof PCancelable.CancelError) {
						console.log("modifyLinks was canceled");
					} else {
						console.error(error);
					}
				}
			},
		});

		// Command: Rollback the last change using the backup.
		this.addCommand({
			id: "automatic-linker:rollback-last-change",
			name: "Rollback Last Change",
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice(
						"Automatic Linker: No active file found for rollback.",
					);
					return;
				}
				// Check if a backup exists for this file.
				const backup = this.backupContent.get(activeFile.path);
				if (!backup) {
					new Notice(
						"Automatic Linker: No backup available for rollback.",
					);
					return;
				}
				try {
					// Overwrite the file with the backup content.
					await this.app.vault.modify(activeFile, backup);
					new Notice(
						"Automatic Linker: Rollback successful. Changes have been reverted.",
					);
					// Remove the backup after a successful rollback.
					this.backupContent.delete(activeFile.path);
				} catch (error) {
					new Notice(
						"Automatic Linker: Rollback failed. Unable to revert changes.",
					);
					console.error(error);
				}
			},
		});

		// Optionally, override the default save command to run modifyLinks (throttled).
		const saveCommandDefinition =
			// @ts-expect-error
			this.app?.commands?.commands?.["editor:save-file"];
		const save = saveCommandDefinition?.callback;
		if (typeof save === "function") {
			// Preserve the original save callback to call it after modifying links.
			this.originalSaveCallback = save;

			const throttledModifyLinks = throttle(
				async () => {
					if (this.settings.formatOnSave) {
						try {
							await this.modifyLinks();
						} catch (error) {
							if (!(error instanceof PCancelable.CancelError)) {
								console.error(error);
							}
						}
					}
				},
				300,
				{ leading: true },
			);
			saveCommandDefinition.callback = async () => {
				await throttledModifyLinks();
				await save?.();
			};
		}
	}

	async onunload() {
		this.removeCommand("automatic-linker:link-current-file");
		this.removeCommand("automatic-linker:rollback-last-change");
		// Restore original save command callback
		const saveCommandDefinition =
			// @ts-expect-error
			this.app?.commands?.commands?.["editor:save-file"];
		if (saveCommandDefinition && this.originalSaveCallback) {
			saveCommandDefinition.callback = this.originalSaveCallback;
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
