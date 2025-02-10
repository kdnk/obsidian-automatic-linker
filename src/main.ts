import {
	App,
	getFrontMatterInfo,
	Notice,
	Plugin,
	PluginManifest,
} from "obsidian";
import AsyncLock from "async-lock";
import { replaceLinks } from "./replace-links";
import {
	AutomaticLinkerPluginSettingsTab,
	AutomaticLinkerSettings,
	DEFAULT_SETTINGS,
} from "./settings";
import PCancelable from "p-cancelable";
import throttle from "just-throttle";
import { buildCandidateTrie, CandidateData, TrieNode } from "./trie";
import { getAliases } from "./get-aliases";
import { PathAndAliases } from "./path-and-aliases.types";

export default class AutomaticLinkerPlugin extends Plugin {
	settings: AutomaticLinkerSettings;
	// List of markdown file paths (without the ".md" extension)
	private allFiles: PathAndAliases[] = [];
	// Pre-built Trie for link candidate lookup
	private trie: TrieNode | null = null;
	private candidateMap: Map<string, CandidateData> | null = null;
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
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return;
		}

		try {
			// Read the current file content
			const fileContent = (
				await this.app.vault.read(activeFile)
			).normalize("NFC");
			// Save a backup before making any modifications
			this.backupContent.set(activeFile.path, fileContent);

			console.log(new Date().toISOString(), "modifyLinks started");

			// Use the pre-built trie and candidateMap to replace links.
			// Fallback to an empty trie if not built.
			const { contentStart } = getFrontMatterInfo(fileContent);
			const updatedContent = await replaceLinks({
				body: fileContent.slice(contentStart),
				frontmatter: fileContent.slice(0, contentStart),
				linkResolverContext: {
					filePath: activeFile.path.replace(/\.md$/, ""),
					trie: this.trie ?? buildCandidateTrie([]).trie,
					candidateMap: this.candidateMap ?? new Map(),
				},
				settings: {
					minCharCount: this.settings.minCharCount,
					namespaceResolution: this.settings.namespaceResolution,
				},
			});

			console.log(new Date().toISOString(), "modifyLinks finished");

			// Overwrite the file with the updated content.
			await this.app.vault.modify(activeFile, updatedContent);
		} catch (error) {
			// noop
		}
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(
			new AutomaticLinkerPluginSettingsTab(this.app, this),
		);

		const refreshFileDataAndTrie = () => {
			const allMarkdownFiles = this.app.vault.getMarkdownFiles();
			const allFiles: PathAndAliases[] = allMarkdownFiles.map((file) => {
				// Remove the .md extension
				const path = file.path.replace(/\.md$/, "");
				const metadata =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				const restrictNamespace =
					metadata?.["automatic-linker-restrict-namespace"] === true;
				return {
					path,
					aliases: getAliases(this.app, file, this.settings),
					restrictNamespace,
				};
			});
			// Sort filenames in descending order (longer paths first)
			allFiles.sort((a, b) => b.path.length - a.path.length);
			this.allFiles = allFiles;

			// Build candidateMap and Trie using the helper function.
			const { candidateMap, trie } = buildCandidateTrie(
				allFiles,
				this.settings.baseDir,
			);
			this.candidateMap = candidateMap;
			this.trie = trie;

			if (this.settings.showNotice) {
				new Notice(
					`Automatic Linker: Loaded all markdown files. (${allFiles.length} files)`,
				);
			}
		};

		// Load file data and build the Trie when the layout is ready.
		this.app.workspace.onLayoutReady(() => {
			refreshFileDataAndTrie();
			console.log("Automatic Linker: Loaded all markdown files.");

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

		const lock = new AsyncLock();
		const safeWrite = (
			key: string,
			writeOperation: () => Promise<void>,
		): Promise<void> => {
			return lock.acquire(key, writeOperation);
		};

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
				safeWrite("save", async () => {
					await throttledModifyLinks();
				});
				safeWrite("save", async () => {
					await save?.();
				});
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
