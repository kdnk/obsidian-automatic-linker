import {
	App,
	getFrontMatterInfo,
	Notice,
	parseFrontMatterAliases,
	Plugin,
	PluginManifest,
	request,
} from "obsidian";
import { excludeLinks } from "./exclude-links";
import { PathAndAliases } from "./path-and-aliases.types";
import { replaceLinks } from "./replace-links/replace-links";
import { replaceUrlWithTitle } from "./replace-url-with-title";
import { getTitleFromHtml } from "./replace-url-with-title/utils/get-title-from-html";
import { listupAllUrls } from "./replace-url-with-title/utils/list-up-all-urls";
import { formatGitHubURL } from "./replace-urls/github";
import { formatJiraURL } from "./replace-urls/jira";
import { formatLinearURL } from "./replace-urls/linear";
import { replaceURLs } from "./replace-urls/replace-urls";
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
	private originalSaveCallback: (checking: boolean) => boolean | void;
	private urlTitleMap: Map<string, string> = new Map();

	constructor(app: App, pluginManifest: PluginManifest) {
		super(app, pluginManifest);
	}

	async modifyLinks() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return;
		}

		const metadata =
			this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
		const disabled = metadata?.["automatic-linker-disabled"] === true;
		if (disabled) {
			return;
		}

		try {
			if (this.settings.formatGitHubURLs) {
				await this.app.vault.process(activeFile, (fileContent) => {
					return replaceURLs(
						fileContent,
						this.settings,
						formatGitHubURL,
					);
				});
			}

			if (this.settings.formatJiraURLs) {
				await this.app.vault.process(activeFile, (fileContent) => {
					return replaceURLs(
						fileContent,
						this.settings,
						formatJiraURL,
					);
				});
			}

			if (this.settings.formatLinearURLs) {
				await this.app.vault.process(activeFile, (fileContent) => {
					return replaceURLs(
						fileContent,
						this.settings,
						formatLinearURL,
					);
				});
			}

			if (this.settings.replaceUrlWithTitle) {
				const fileContent = await this.app.vault.read(activeFile);
				const { contentStart } = getFrontMatterInfo(fileContent);
				const body = fileContent.slice(contentStart);

				const urls = listupAllUrls(
					body,
					this.settings.replaceUrlWithTitleIgnoreDomains,
				);
				for (const url of urls) {
					const response = await request(url);
					const title = getTitleFromHtml(response);
					this.urlTitleMap.set(url, title);
				}

				await this.app.vault.process(activeFile, (fileContent) => {
					const { contentStart } = getFrontMatterInfo(fileContent);
					const frontmatter = fileContent.slice(0, contentStart);
					const body = fileContent.slice(contentStart);
					const updatedBody = replaceUrlWithTitle({
						body,
						urlTitleMap: this.urlTitleMap,
					});
					return frontmatter + updatedBody;
				});
			}

			await this.app.vault.process(activeFile, (fileContent) => {
				if (!this.trie || !this.candidateMap) {
					return fileContent;
				}

				if (this.settings.debug) {
					console.log("this.trie: ", this.trie);
					console.log("this.candidateMap: ", this.candidateMap);
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
						ignoreCase: this.settings.ignoreCase,
						preventSelfLinking: this.settings.preventSelfLinking,
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

	async formatOnSave() {
		if (!this.settings.formatOnSave) {
			return;
		}
		await this.modifyLinks();
	}

	async mofifyLinksSelection() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return;
		}
		const editor = this.app.workspace.activeEditor;
		if (!editor) {
			return;
		}
		const cm = editor.editor;
		if (!cm) {
			return;
		}

		const selectedText = cm.getSelection();

		if (!this.trie || !this.candidateMap) {
			return;
		}

		const updatedText = replaceLinks({
			body: selectedText,
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
				ignoreCase: this.settings.ignoreCase,
				preventSelfLinking: this.settings.preventSelfLinking,
			},
		});
		cm.replaceSelection(updatedText);
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(
			new AutomaticLinkerPluginSettingsTab(this.app, this),
		);

		const refreshFileDataAndTrie = () => {
			const allMarkdownFiles = this.app.vault.getMarkdownFiles();
			const allFiles: PathAndAliases[] = allMarkdownFiles
				.filter((file) => {
					// Filter out files in excluded directories
					const path = file.path.replace(/\.md$/, "");
					return !this.settings.excludeDirsFromAutoLinking.some(
						(excludeDir) => {
							return (
								path.startsWith(excludeDir + "/") ||
								path === excludeDir
							);
						},
					);
				})
				.map((file) => {
					// Remove the .md extension
					const path = file.path.replace(/\.md$/, "");
					const metadata =
						this.app.metadataCache.getFileCache(file)?.frontmatter;
					const restrictNamespace =
						metadata?.["automatic-linker-restrict-namespace"] ===
							true ||
						metadata?.["automatic-linker-limited-namespace"] ===
							true;

					// if this property exists, prevent this file from being linked from other files
					const preventLinking =
						metadata?.["automatic-linker-prevent-linking"] === true;

					const aliases = (() => {
						if (this.settings.considerAliases) {
							const frontmatter =
								this.app.metadataCache.getFileCache(
									file,
								)?.frontmatter;
							const aliases =
								parseFrontMatterAliases(frontmatter);
							return aliases;
						} else {
							return null;
						}
					})();
					return {
						path,
						aliases,
						restrictNamespace,
						preventLinking,
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
			id: "link-current-file",
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
			id: "rebuild-all-files",
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

		this.addCommand({
			id: "link-selection",
			name: "Link selection",
			editorCallback: async () => {
				try {
					await this.mofifyLinksSelection();
				} catch (error) {
					console.error(error);
				}
			},
		});

		this.addCommand({
			id: "copy-file-content-without-links",
			name: "Copy file content without links",
			editorCallback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					return;
				}
				const fileContent = await this.app.vault.read(activeFile);
				const { contentStart } = getFrontMatterInfo(fileContent);
				const body = fileContent.slice(contentStart);
				const bodyWithoutLinks = excludeLinks(body);
				navigator.clipboard.writeText(bodyWithoutLinks);
			},
		});

		// Optionally, override the default save command to run modifyLinks (throttled).
		const saveCommandDefinition =
			// @ts-expect-error
			this.app?.commands?.commands?.["editor:save-file"];
		const saveCallback = saveCommandDefinition?.checkCallback;
		if (typeof saveCallback === "function") {
			// Preserve the original save callback to call it after modifying links.
			this.originalSaveCallback = saveCallback;
		}

		saveCommandDefinition.checkCallback = async (checking: boolean) => {
			if (checking) {
				return saveCallback?.(checking);
			} else {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					return;
				}
				const editor = this.app.workspace.activeEditor;
				if (!editor) {
					return;
				}
				const cm = editor.editor;
				if (!cm) {
					return;
				}
				const currentCuror = cm.getCursor();
				await this.formatOnSave();
				await saveCallback?.(checking);

				cm.setCursor({
					line: currentCuror.line,
					ch: currentCuror.ch,
				});
			}
		};
	}

	async onunload() {
		// Restore original save command callback
		const saveCommandDefinition =
			// @ts-expect-error
			this.app?.commands?.commands?.["editor:save-file"];
		if (saveCommandDefinition && this.originalSaveCallback) {
			saveCommandDefinition.checkCallback = this.originalSaveCallback;
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
