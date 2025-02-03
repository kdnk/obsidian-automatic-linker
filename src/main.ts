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
					// Read the content of the active file.
					const fileContent = await this.app.vault.read(activeFile);
					if (canceled) {
						return reject(new PCancelable.CancelError());
					}
					console.log(
						new Date().toISOString(),
						"modifyLinks started",
					);

					// Use the pre-built trie and candidateMap to replace links.
					// If trie is not built, use an empty one as a fallback.
					const updatedContent = await replaceLinks({
						fileContent,
						trie: this.trie ?? buildCandidateTrie([]).trie,
						candidateMap: this.candidateMap ?? new Map(),
						getFrontMatterInfo,
					});

					console.log(
						new Date().toISOString(),
						"modifyLinks finished",
					);

					if (canceled) {
						return reject(new PCancelable.CancelError());
					}
					// Modify the active file with the updated content.
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

		// Function to load file data and build the candidate map and Trie.
		const refreshFileDataAndTrie = () => {
			const allMarkdownFiles = this.app.vault.getMarkdownFiles();
			const allFileNames = allMarkdownFiles.map((file) =>
				file.path.replace(/\.md$/, ""),
			);
			// Sort file names in descending order by length (longer paths first)
			allFileNames.sort((a, b) => b.length - a.length);
			this.allFileNames = allFileNames;

			// Build candidate map and Trie using the helper from trie.ts.
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

		// Optionally, override the default save command to run modifyLinks (with throttling).
		const saveCommandDefinition =
			// @ts-expect-error
			this.app?.commands?.commands?.["editor:save-file"];
		const save = saveCommandDefinition?.callback;
		if (typeof save === "function") {
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
				save?.();
				throttledModifyLinks();
			};
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
