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
	TFile,
} from "obsidian";
import { excludeLinks } from "./exclude-links";
import { PathAndAliases } from "./path-and-aliases.types";
import { removeMinimalIndent } from "./remove-minimal-indent";
import {
	LinkGenerator,
	LinkGeneratorParams,
	replaceLinks,
} from "./replace-links/replace-links";
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

	/**
	 * Creates a LinkGenerator that uses Obsidian's generateMarkdownLink API.
	 * Falls back to default wikilink format if the file cannot be resolved.
	 */
	private createLinkGenerator(sourcePath: string): LinkGenerator {
		return ({
			linkPath,
			alias,
			isInTable,
		}: LinkGeneratorParams): string => {
			// Try to get the TFile for the link path
			const targetFile = this.app.vault.getAbstractFileByPath(
				linkPath + ".md",
			);

			if (targetFile instanceof TFile) {
				// File exists, use Obsidian's generateMarkdownLink API
				try {
					const link = this.app.fileManager.generateMarkdownLink(
						targetFile,
						sourcePath,
						"",
						alias || "",
					);
					return link;
				} catch (error) {
					// Fall back to default format if API fails
					console.warn(
						"Failed to generate link using Obsidian API:",
						error,
					);
				}
			}

			// Fallback: use default wikilink format
			let linkContent = linkPath;
			if (alias) {
				linkContent = `${linkPath}|${alias}`;
			}
			if (isInTable && linkContent.includes("|")) {
				linkContent = linkContent.replace(/\|/g, "\\|");
			}
			return `[[${linkContent}]]`;
		};
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
		const linkGenerator = this.createLinkGenerator(filePath);
		const baseDir = this.settings.respectNewFileFolderPath
			? this.app.vault.getConfig("newFileFolderPath")
			: undefined;
		const updatedBody = replaceLinks({
			body: fileContent.slice(contentStart),
			linkResolverContext: {
				filePath: filePath.replace(/\.md$/, ""),
				trie: this.trie,
				candidateMap: this.candidateMap,
			},
			settings: {
				namespaceResolution: this.settings.namespaceResolution,
				baseDir,
				ignoreDateFormats: this.settings.ignoreDateFormats,
				ignoreCase: this.settings.ignoreCase,
				preventSelfLinking: this.settings.preventSelfLinking,
				removeAliasInDirs: this.settings.removeAliasInDirs,
			},
			linkGenerator,
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
		const off =
			metadata?.["automatic-linker-disabled"] === true ||
			metadata?.["automatic-linker-off"] === true;
		if (off) {
			return;
		}

		const editor = this.getEditor();
		if (!editor) return;

		const fileContent = editor.getValue();
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

	async formatThenRunPrettierAndLinter() {
		await this.buildUrlTitleMap();
		await this.modifyLinksForActiveFile();

		if (this.settings.runPrettierAfterFormatting) {
			await sleep(this.settings.formatDelayMs ?? 100);
			//@ts-expect-error
			await this.app?.commands?.executeCommandById(
				"prettier-format:format-file",
			);
		}
		if (this.settings.runLinterAfterFormatting) {
			await sleep(this.settings.formatDelayMs ?? 100);
			//@ts-expect-error
			await this.app?.commands?.executeCommandById(
				"obsidian-linter:lint-file",
			);
		}
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

		const linkGenerator = this.createLinkGenerator(activeFile.path);
		const baseDir = this.settings.respectNewFileFolderPath
			? this.app.vault.getConfig("newFileFolderPath")
			: undefined;
		const updatedText = replaceLinks({
			body: selectedText,
			linkResolverContext: {
				filePath: activeFile.path.replace(/\.md$/, ""),
				trie: this.trie,
				candidateMap: this.candidateMap,
			},
			settings: {
				namespaceResolution: this.settings.namespaceResolution,
				baseDir,
				ignoreDateFormats: this.settings.ignoreDateFormats,
				ignoreCase: this.settings.ignoreCase,
				preventSelfLinking: this.settings.preventSelfLinking,
				removeAliasInDirs: this.settings.removeAliasInDirs,
			},
			linkGenerator,
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
				const scoped =
					metadata?.["automatic-linker-restrict-namespace"] ===
						true ||
					metadata?.["automatic-linker-limited-namespace"] === true ||
					metadata?.["automatic-linker-scoped"] === true;

				// if this property exists, prevent this file from being linked from other files
				const exclude =
					metadata?.["automatic-linker-prevent-linking"] === true ||
					metadata?.["automatic-linker-exclude"] === true;

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
					scoped,
					exclude,
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
		const baseDir = this.settings.respectNewFileFolderPath
			? this.app.vault.getConfig("newFileFolderPath")
			: undefined;
		const { candidateMap, trie } = buildCandidateTrie(
			allFiles,
			baseDir,
			this.settings.ignoreCase ?? false,
		);
		this.candidateMap = candidateMap;
		this.trie = trie;

		if (this.settings.showNotice) {
			new Notice(
				`Automatic Linker: Loaded all markdown files. (${allFiles.length} files)`,
			);
		}
		if (this.settings.debug) {
			console.log(
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
			id: "format-file",
			name: "Format file",
			icon: "wand-sparkles",
			editorCallback: async () => {
				try {
					await this.formatThenRunPrettierAndLinter();
				} catch (error) {
					console.error(error);
				}
			},
		});

		this.addCommand({
			id: "format-vault",
			name: "Format vault",
			icon: "drill",
			editorCallback: async () => {
				try {
					await this.modifyLinksForVault();
				} catch (error) {
					console.error(error);
				}
			},
		});

		this.addCommand({
			id: "rebuild-index",
			name: "Rebuild index",
			icon: "refresh-ccw",
			editorCallback: async () => {
				try {
					this.refreshFileDataAndTrie();
				} catch (error) {
					console.error(error);
				}
			},
		});

		this.addCommand({
			id: "format-selection",
			name: "Format selection",
			editorCallback: async () => {
				try {
					await this.mofifyLinksSelection();
				} catch (error) {
					console.error(error);
				}
			},
		});

		this.addCommand({
			id: "copy-file-without-links",
			name: "Copy file without links",
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

		this.addCommand({
			id: "copy-selection-without-links",
			name: "Copy selection without links",
			editorCallback: async (editor: Editor) => {
				// Get the start and end positions of the selection
				const from = editor.getCursor("from");
				const to = editor.getCursor("to");

				// Get the full lines that contain the selection
				const selectedText = editor.getRange(
					{ line: from.line, ch: 0 },
					{ line: to.line, ch: editor.getLine(to.line).length },
				);

				if (!selectedText) {
					return;
				}

				// Remove minimal indent
				const textWithMinimalIndent = removeMinimalIndent(selectedText);
				// Remove wikilinks
				const textWithoutLinks = excludeLinks(textWithMinimalIndent);

				await navigator.clipboard.writeText(textWithoutLinks);
			},
		});

		// Optionally, override the default save command to run modifyLinks (throttled).
		const saveCommandDefinition =
			// @ts-ignore
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
				if (!this.settings.formatOnSave) {
					return;
				}
				await sleep(this.settings.formatDelayMs ?? 100);
				await this.formatThenRunPrettierAndLinter();
			}
		};
	}

	async onunload() {
		// Restore original save command callback
		const saveCommandDefinition =
			// @ts-ignore
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
