import {
	App,
	getFrontMatterInfo,
	Notice,
	parseFrontMatterAliases,
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
import throttle from "just-throttle";
import { buildCandidateTrie, CandidateData, TrieNode } from "./trie";
import { PathAndAliases } from "./path-and-aliases.types";

export default class AutomaticLinkerPlugin extends Plugin {
	settings: AutomaticLinkerSettings;
	// Pre-built Trie for link candidate lookup
	private trie: TrieNode | null = null;
	private candidateMap: Map<string, CandidateData> | null = null;
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

			console.log(new Date().toISOString(), "modifyLinks started");

			// Use the pre-built trie and candidateMap to replace links.
			// Fallback to an empty trie if not built.
			const { contentStart } = getFrontMatterInfo(fileContent);

			const frontmatter = fileContent.slice(0, contentStart);
			const updatedBody = await replaceLinks({
				body: fileContent.slice(contentStart),
				linkResolverContext: {
					filePath: activeFile.path.replace(/\.md$/, ""),
					trie: this.trie ?? buildCandidateTrie([]).trie,
					candidateMap: this.candidateMap ?? new Map(),
				},
				settings: {
					minCharCount: this.settings.minCharCount,
					namespaceResolution: this.settings.namespaceResolution,
					baseDir: this.settings.baseDir,
					ignoreDateFormats: this.settings.ignoreDateFormats,
				},
			});

			console.log(new Date().toISOString(), "modifyLinks finished");

			// Overwrite the file with the updated content.
			await this.app.vault.modify(activeFile, frontmatter + updatedBody);
		} catch (error) {
			console.error(error);
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
				const aliases = (() => {
					if (this.settings.considerAliases) {
						const frontmatter =
							this.app.metadataCache.getFileCache(
								file,
							)?.frontmatter;
						const aliases = parseFrontMatterAliases(frontmatter);
						return aliases;
					} else {
						return null;
					}
				})();
				return {
					path,
					aliases,
					restrictNamespace,
				};
			});
			// Sort filenames in descending order (longer paths first)
			allFiles.sort((a, b) => b.path.length - a.path.length);

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
							console.error(error);
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
