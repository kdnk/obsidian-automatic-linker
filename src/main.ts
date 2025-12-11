import {
	App,
	Editor,
	getFrontMatterInfo,
	MarkdownView,
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
import { updateEditor } from "./update-editor";

const sleep = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

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

	private getEditor(): Editor | null {
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeLeaf) return null;
		return activeLeaf.editor;
	}

	modifyLinks(fileContent: string, filePath: string): string {
		if (this.settings.formatGitHubURLs) {
			fileContent = replaceURLs(
				fileContent,
				this.settings,
				formatGitHubURL,
			);
		}

		if (this.settings.formatJiraURLs) {
			fileContent = replaceURLs(
				fileContent,
				this.settings,
				formatJiraURL,
			);
		}

		if (this.settings.formatLinearURLs) {
			fileContent = replaceURLs(
				fileContent,
				this.settings,
				formatLinearURL,
			);
		}

		if (this.settings.replaceUrlWithTitle) {
			const { contentStart } = getFrontMatterInfo(fileContent);
			const frontmatter = fileContent.slice(0, contentStart);
			const body = fileContent.slice(contentStart);
			const updatedBody = replaceUrlWithTitle({
				body,
				urlTitleMap: this.urlTitleMap,
			});
			fileContent = frontmatter + updatedBody;
		}

		if (!this.trie || !this.candidateMap) {
			return fileContent;
		}

		if (this.settings.debug) {
			console.log("this.trie: ", this.trie);
			console.log("this.candidateMap: ", this.candidateMap);
			console.log(new Date().toISOString(), "modifyLinks started");
			new Notice(
				`Automatic Linker: ${new Date().toISOString()} modifyLinks started.`,
			);
		}

		const { contentStart } = getFrontMatterInfo(fileContent);
		const frontmatter = fileContent.slice(0, contentStart);
		const updatedBody = replaceLinks({
			body: fileContent.slice(contentStart),
			linkResolverContext: {
				filePath: filePath.replace(/\.md$/, ""),
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
				removeAliasInDirs: this.settings.removeAliasInDirs,
			},
		});
		fileContent = frontmatter + updatedBody;

		if (this.settings.debug) {
			console.log(new Date().toISOString(), "modifyLinks finished");
			new Notice(
				`Automatic Linker: ${new Date().toISOString()} modifyLinks finished.`,
			);
		}
		return fileContent;
	}

	async modifyLinksForActiveFile() {
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

		const editor = this.getEditor();
		if (!editor) return;

		let fileContent = editor.getValue();
		const oldText = fileContent;
		const newText = this.modifyLinks(fileContent, activeFile.path);
		updateEditor(oldText, newText, editor);
	}

	async modifyLinksForVault() {
		this.refreshFileDataAndTrie();
		const allMarkdownFiles = this.app.vault.getMarkdownFiles();
		for (const file of allMarkdownFiles) {
			await this.app.vault.process(file, (fileContent) => {
				return this.modifyLinks(fileContent, file.path);
			});
		}
	}

	async buildUrlTitleMap() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return;
		}
		const fileContent = await this.app.vault.read(activeFile);
		const { contentStart } = getFrontMatterInfo(fileContent);
		const body = fileContent.slice(contentStart);

		const urls = listupAllUrls(
			body,
			this.settings.replaceUrlWithTitleIgnoreDomains,
		);
		for (const url of urls) {
			if (this.urlTitleMap.has(url)) {
				continue;
			}
			const response = await request(url);
			const title = getTitleFromHtml(response);
			this.urlTitleMap.set(url, title);
		}
	}

	async formatOnSave() {
		if (!this.settings.formatOnSave) {
			return;
		}

		await this.buildUrlTitleMap();
		await this.modifyLinksForActiveFile();
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
				removeAliasInDirs: this.settings.removeAliasInDirs,
			},
		});
		cm.replaceSelection(updatedText);
	}

	refreshFileDataAndTrie() {
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
					metadata?.["automatic-linker-limited-namespace"] === true;

				// if this property exists, prevent this file from being linked from other files
				const preventLinking =
					metadata?.["automatic-linker-prevent-linking"] === true;

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
					preventLinking,
				};
			});
		// Sort filenames in descending order (longer paths first)
		allFiles.sort((a, b) => b.path.length - a.path.length);

		if (this.settings.debug) {
			console.log(
				"Automatic Linker: allFiles for Trie building: ",
				allFiles,
			);
		}

		// Build candidateMap and Trie using the helper function.
		const { candidateMap, trie } = buildCandidateTrie(
			allFiles,
			this.settings.baseDir,
			this.settings.ignoreCase ?? false,
		);
		this.candidateMap = candidateMap;
		this.trie = trie;

		if (this.settings.showNotice) {
			new Notice(
				`Automatic Linker: Loaded all markdown files. (${allFiles.length} files)`,
			);
		}
	}
	async onload() {
		await this.loadSettings();
		this.addSettingTab(
			new AutomaticLinkerPluginSettingsTab(this.app, this),
		);

		// Load file data and build the Trie when the layout is ready.
		this.app.workspace.onLayoutReady(() => {
			this.refreshFileDataAndTrie();
			if (this.settings.debug) {
				console.log("Automatic Linker: Built all markdown files.");
				new Notice("Automatic Linker: Built all markdown files.");
			}

			this.registerEvent(
				this.app.vault.on("delete", () =>
					this.refreshFileDataAndTrie(),
				),
			);
			this.registerEvent(
				this.app.vault.on("create", () =>
					this.refreshFileDataAndTrie(),
				),
			);
			this.registerEvent(
				this.app.vault.on("rename", () =>
					this.refreshFileDataAndTrie(),
				),
			);
		});

		// Command: Manually trigger link replacement for the current file.
		this.addCommand({
			id: "link-current-file",
			name: "Link current file",
			editorCallback: async () => {
				try {
					await this.modifyLinksForActiveFile();
				} catch (error) {
					console.error(error);
				}
			},
		});

		this.addCommand({
			id: "link-entire-vault",
			name: "Link entire vault",
			editorCallback: async () => {
				try {
					await this.modifyLinksForVault();
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
					this.refreshFileDataAndTrie();
					if (this.settings.debug) {
						console.log(
							"Automatic Linker: Built all markdown files.",
						);
						new Notice(
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
				await sleep(this.settings.formatDelayMs ?? 100);
				await this.formatOnSave();

				// Run Obsidian Linter after formatting if enabled
				if (this.settings.runLinterAfterFormatting) {
					await sleep(this.settings.formatDelayMs ?? 100);
					//@ts-expect-error
					await this.app?.commands?.executeCommandById(
						"obsidian-linter:lint-file",
					);
				}

				if (this.settings.runPrettierAfterFormatting) {
					await sleep(this.settings.formatDelayMs ?? 100);
					//@ts-expect-error
					await this.app?.commands?.executeCommandById(
						"prettier-format:format-file",
					);
				}
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
