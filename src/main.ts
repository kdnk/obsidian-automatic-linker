import AsyncLock from "async-lock";
import throttle from "just-throttle";
import {
	App,
	getFrontMatterInfo,
	Notice,
	parseFrontMatterAliases,
	Plugin,
	PluginManifest,
} from "obsidian";
import { PathAndAliases } from "./path-and-aliases.types";
import { replaceLinks } from "./replace-links";
import { formatGitHubURL } from "./replace-urls/github";
import { formatJiraURL } from "./replace-urls/jira";
import { AutomaticLinkerPluginSettingsTab } from "./settings/settings";
import {
	AutomaticLinkerSettings,
	DEFAULT_SETTINGS,
} from "./settings/settings-info";
import { buildCandidateTrie, CandidateData, TrieNode } from "./trie";

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

	async modifyLinks() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return;
		}

		try {
			await this.app.vault.process(activeFile, (fileContent) => {
				if (this.settings.formatGitHubURLs) {
					// Find GitHub URLs using a regex pattern
					const githubUrlPattern = /(https?:\/\/[^\s\]]+)/g;
					fileContent = fileContent.replace(
						githubUrlPattern,
						(match) => {
							return formatGitHubURL(match, this.settings);
						},
					);
				}
				return fileContent;
			});

			await this.app.vault.process(activeFile, (fileContent) => {
				// Format Jira URLs if enabled
				if (this.settings.formatJiraURLs) {
					// Find URLs using a regex pattern
					const urlPattern = /(https?:\/\/[^\s\]]+)/g;
					fileContent = fileContent.replace(urlPattern, (match) => {
						return formatJiraURL(match, this.settings);
					});
				}
				return fileContent;
			});

			await this.app.vault.process(activeFile, (fileContent) => {
				if (!this.trie || !this.candidateMap) {
					return fileContent;
				}

				if (this.settings.debug) {
					console.log(
						new Date().toISOString(),
						"modifyLinks started",
					);
				}

				const { contentStart } = getFrontMatterInfo(fileContent);
				const frontmatter = fileContent.slice(0, contentStart);

				const updatedBody = replaceLinks({
					body: fileContent.slice(contentStart),
					linkResolverContext: {
						filePath: activeFile.path.replace(/\.md$/, ""),
						trie: this.trie,
						candidateMap: this.candidateMap,
					},
					settings: {
						minCharCount: this.settings.minCharCount,
						namespaceResolution: this.settings.namespaceResolution,
						baseDir: this.settings.baseDir,
						ignoreDateFormats: this.settings.ignoreDateFormats,
					},
				});

				if (this.settings.debug) {
					console.log(
						new Date().toISOString(),
						"modifyLinks finished",
					);
				}

				return frontmatter + updatedBody;
			});
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
			if (this.settings.debug) {
				console.log("Automatic Linker: Built all markdown files.");
			}

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

		this.addCommand({
			id: "automatic-linker:rebuild-all-files",
			name: "rebuild all files",
			editorCallback: async () => {
				try {
					refreshFileDataAndTrie();
					if (this.settings.debug) {
						console.log(
							"Automatic Linker: Built all markdown files.",
						);
					}
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
