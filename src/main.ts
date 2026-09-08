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
} from "obsidian"
import { excludeLinks } from "./exclude-links"
import {
    formatMarkdownDocument,
    formatMarkdownSelection,
} from "./formatting-run"
import {
    isLinkingOff,
    isLinkingExcluded,
    isNamespaceScoped,
    isUrlTitleReplacementOff,
} from "./frontmatter-utils"
import { PathAndAliases } from "./path-and-aliases.types"
import { removeMinimalIndent } from "./remove-minimal-indent"
import {
    defaultLinkGenerator,
    escapeLinkForMarkdownTable,
    LinkGenerator,
    LinkGeneratorParams,
} from "./replace-links/replace-links"
import { getTitleFromHtml } from "./replace-url-with-title/utils/get-title-from-html"
import { listupAllUrls } from "./replace-url-with-title/utils/list-up-all-urls"
import { AutomaticLinkerPluginSettingsTab } from "./settings/settings"
import {
    AutomaticLinkerSettings,
    DEFAULT_SETTINGS,
} from "./settings/settings-info"
import { buildCandidateTrie, CandidateData, TrieNode } from "./trie"
import { updateEditor } from "./update-editor"
import { runAsyncSafely, sleep } from "./plugin-compat"

interface FormattingTarget {
    file: TFile
    path: string
    editor: Editor
}

export default class AutomaticLinkerPlugin extends Plugin {
    settings: AutomaticLinkerSettings
    // Pre-built Trie for link candidate lookup
    private trie: TrieNode | null = null
    private candidateMap: Map<string, CandidateData> | null = null
    // Preserved callback for the original save command
    private originalSaveCallback: (checking: boolean) => boolean | void
    private urlTitleMap: Map<string, string> = new Map()
    // Cache of frontmatter values that affect the Trie
    private frontmatterCache: Map<string, string> = new Map()

    constructor(app: App, pluginManifest: PluginManifest) {
        super(app, pluginManifest)
    }

    private getEditor(): Editor | null {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)
        if (!activeLeaf) return null
        return activeLeaf.editor
    }

    /**
     * Creates a LinkGenerator that uses Obsidian's generateMarkdownLink API.
     * Falls back to default wikilink format if the file cannot be resolved.
     */
    private createLinkGenerator(sourcePath: string): LinkGenerator {
        return ({
            linkPath,
            targetPath,
            alias,
            isInTable,
        }: LinkGeneratorParams): string => {
            // Try to get the TFile for the link path
            const targetFile = this.app.vault.getAbstractFileByPath((targetPath ?? linkPath) + ".md")

            if (targetFile instanceof TFile) {
                // File exists, use Obsidian's generateMarkdownLink API
                try {
                    const targetBasename = (targetPath ?? linkPath).split("/").pop()
                    const displayAlias = alias ?? (
                        !linkPath.includes("/") && targetBasename !== linkPath ? linkPath : ""
                    )
                    const link = this.app.fileManager.generateMarkdownLink(targetFile, sourcePath, "", displayAlias)
                    return escapeLinkForMarkdownTable(link, isInTable)
                }
                catch (error) {
                    // Fall back to default format if API fails
                    console.warn("Failed to generate link using Obsidian API:", error)
                }
            }

            return defaultLinkGenerator({ linkPath, sourcePath, alias, isInTable })
        }
    }

    modifyLinks(
        fileContent: string,
        filePath: string,
        frontmatter?: Record<string, unknown>,
    ): string {
        if (!this.trie || !this.candidateMap) {
            return formatMarkdownDocument({
                content: fileContent,
                filePath,
                contentStart: getFrontMatterInfo(fileContent).contentStart,
                frontmatter,
                settings: this.settings,
                urlTitleMap: this.urlTitleMap,
            })
        }

        if (this.settings.debug) {
            console.log("this.trie: ", this.trie)
            console.log("this.candidateMap: ", this.candidateMap)
            console.log(new Date().toISOString(), "modifyLinks started")
            new Notice(`Automatic Linker: ${new Date().toISOString()} modifyLinks started.`)
        }

        const baseDir = this.settings.respectNewFileFolderPath ? this.app.vault.getConfig("newFileFolderPath") : undefined
        const candidateIndex = this.trie && this.candidateMap
            ? { trie: this.trie, candidateMap: this.candidateMap }
            : undefined
        fileContent = formatMarkdownDocument({
            content: fileContent,
            filePath,
            contentStart: getFrontMatterInfo(fileContent).contentStart,
            frontmatter,
            settings: this.settings,
            baseDir,
            candidateIndex,
            urlTitleMap: this.urlTitleMap,
            linkGenerator: candidateIndex ? this.createLinkGenerator(filePath) : undefined,
        })

        if (this.settings.debug) {
            console.log(new Date().toISOString(), "modifyLinks finished")
            new Notice(`Automatic Linker: ${new Date().toISOString()} modifyLinks finished.`)
        }
        return fileContent
    }

    private captureFormattingTarget(): FormattingTarget | null {
        const file = this.app.workspace.getActiveFile()
        const editor = this.getEditor()
        return file && editor ? { file, path: file.path, editor } : null
    }

    private canFormatTarget(target: FormattingTarget): boolean {
        return this.app.workspace.getActiveFile() === target.file
            && target.file.path === target.path
            && this.getEditor() === target.editor
            && !isLinkingOff(this.app.metadataCache.getFileCache(target.file)?.frontmatter)
    }

    private modifyLinksForTarget(target: FormattingTarget) {
        if (!this.canFormatTarget(target)) return
        const metadata = this.app.metadataCache.getFileCache(target.file)?.frontmatter
        const oldText = target.editor.getValue()
        const newText = this.modifyLinks(oldText, target.path, metadata)
        updateEditor(oldText, newText, target.editor)
    }

    modifyLinksForActiveFile() {
        const target = this.captureFormattingTarget()
        if (target) this.modifyLinksForTarget(target)
    }

    async modifyLinksForVault() {
        this.refreshFileDataAndTrie()
        const allMarkdownFiles = this.app.vault.getMarkdownFiles()
        for (const file of allMarkdownFiles) {
            const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter
            await this.app.vault.process(file, (fileContent) => {
                return this.modifyLinks(fileContent, file.path, metadata)
            })
        }
    }

    async buildUrlTitleMap(target?: FormattingTarget) {
        const activeFile = target?.file ?? this.app.workspace.getActiveFile()
        if (!activeFile) return
        const metadata = this.app.metadataCache.getFileCache(activeFile)?.frontmatter
        if (isLinkingOff(metadata) || isUrlTitleReplacementOff(metadata)) return

        const fileContent = target
            ? target.editor.getValue()
            : await this.app.vault.read(activeFile)
        const { contentStart } = getFrontMatterInfo(fileContent)
        const body = fileContent.slice(contentStart)

        const urls = listupAllUrls(body, this.settings.replaceUrlWithTitleIgnoreDomains)
        for (const url of urls) {
            if (target && !this.canFormatTarget(target)) return
            if (this.urlTitleMap.has(url)) continue

            try {
                const response = await request(url)
                const title = getTitleFromHtml(response)

                if (title) {
                    this.urlTitleMap.set(url, title)
                }
                else {
                    if (this.settings.debug) {
                        console.warn(`Automatic Linker: No title found for URL: ${url}`)
                    }
                }
            }
            catch (error) {
                if (this.settings.debug) {
                    console.warn(`Automatic Linker: Failed to fetch URL title for: ${url}`, error)
                }
            }
        }
    }

    async formatThenRunPrettierAndLinter(target = this.captureFormattingTarget()) {
        if (!target || !this.canFormatTarget(target)) return
        if (this.settings.replaceUrlWithTitle) {
            await this.buildUrlTitleMap(target)
        }
        if (!this.canFormatTarget(target)) return
        this.modifyLinksForTarget(target)

        if (this.settings.runPrettierAfterFormatting) {
            await sleep(this.settings.formatDelayMs ?? 100)
            if (!this.canFormatTarget(target)) return
            // @ts-expect-error
            await this.app?.commands?.executeCommandById("prettier-format:format-file")
        }
        if (this.settings.runLinterAfterFormatting) {
            await sleep(this.settings.formatDelayMs ?? 100)
            if (!this.canFormatTarget(target)) return
            // @ts-expect-error
            await this.app?.commands?.executeCommandById("obsidian-linter:lint-file")
        }
    }

    async mofifyLinksSelection() {
        const activeFile = this.app.workspace.getActiveFile()
        if (!activeFile) return
        const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter
        if (isLinkingOff(frontmatter)) return
        const editor = this.app.workspace.activeEditor
        if (!editor) return
        const cm = editor.editor
        if (!cm) return

        const selectedText = cm.getSelection()
        const content = cm.getValue()
        const { contentStart } = getFrontMatterInfo(content)
        const selectionStart = cm.posToOffset(cm.getCursor("from"))
        const protectedLength = Math.max(0, contentStart - selectionStart)
        if (protectedLength >= selectedText.length) return

        if (!this.trie || !this.candidateMap) return

        const linkGenerator = this.createLinkGenerator(activeFile.path)
        const baseDir = this.settings.respectNewFileFolderPath ? this.app.vault.getConfig("newFileFolderPath") : undefined
        const updatedText = formatMarkdownSelection({
            body: content.slice(contentStart),
            selection: {
                start: Math.max(0, selectionStart - contentStart),
                end: selectionStart + selectedText.length - contentStart,
            },
            frontmatter,
            filePath: activeFile.path,
            settings: this.settings,
            baseDir,
            candidateIndex: {
                trie: this.trie,
                candidateMap: this.candidateMap,
            },
            linkGenerator,
        })
        const replacement = selectedText.slice(0, protectedLength) + updatedText
        if (replacement !== selectedText) cm.replaceSelection(replacement)
    }

    private getIndexMetadata(file: TFile): Pick<PathAndAliases, "aliases" | "scoped" | "exclude"> {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
        return {
            aliases: this.settings.includeAliases ? parseFrontMatterAliases(frontmatter) : null,
            scoped: isNamespaceScoped(frontmatter),
            exclude: isLinkingExcluded(frontmatter),
        }
    }

    refreshFileDataAndTrie() {
        const allMarkdownFiles = this.app.vault.getMarkdownFiles()
        const frontmatterCache = new Map<string, string>()
        const allFiles: PathAndAliases[] = allMarkdownFiles
            .map((file) => {
                const metadata = this.getIndexMetadata(file)
                frontmatterCache.set(file.path, JSON.stringify(metadata))
                return { path: file.path.replace(/\.md$/, ""), ...metadata }
            })
            .filter((file) => {
                // Filter out files in excluded directories
                return !this.settings.excludeDirsFromAutoLinking.some((excludeDir) => {
                    return (file.path.startsWith(excludeDir + "/") || file.path === excludeDir)
                })
            })
        // Sort filenames in descending order (longer paths first)
        allFiles.sort((a, b) => b.path.length - a.path.length)

        if (this.settings.debug) {
            console.log("Automatic Linker: allFiles for Trie building: ", allFiles)
        }

        // Build candidateMap and Trie using the helper function.
        const baseDir = this.settings.respectNewFileFolderPath ? this.app.vault.getConfig("newFileFolderPath") : undefined
        const { candidateMap, trie } = buildCandidateTrie(allFiles, baseDir, this.settings.ignoreCase ?? false)
        this.candidateMap = candidateMap
        this.trie = trie
        this.frontmatterCache = frontmatterCache

        if (this.settings.showNotice) {
            new Notice(`Automatic Linker: Loaded all markdown files. (${allFiles.length} files)`)
        }
        if (this.settings.debug) {
            console.log(`Automatic Linker: Loaded all markdown files. (${allFiles.length} files)`)
        }
    }

    private refreshFileDataAndTrieOnFrontmatterChange(file: TFile) {
        const currentHash = JSON.stringify(this.getIndexMetadata(file))
        const cachedHash = this.frontmatterCache.get(file.path)

        // If the hash has changed, refresh the Trie
        if (currentHash !== cachedHash) {
            this.refreshFileDataAndTrie()

            if (this.settings.debug) {
                console.log(`Automatic Linker: Refreshing Trie due to frontmatter change in ${file.path}`)
            }
        }
    }

    onload() {
        runAsyncSafely(async () => {
            await this.loadSettings()
            this.initializePlugin()
        })
    }

    private initializePlugin() {
        this.addSettingTab(new AutomaticLinkerPluginSettingsTab(this.app, this))

        // Load file data and build the Trie when the layout is ready.
        this.app.workspace.onLayoutReady(() => {
            this.refreshFileDataAndTrie()

            this.registerEvent(
                this.app.vault.on("delete", () => this.refreshFileDataAndTrie()),
            )
            this.registerEvent(
                this.app.vault.on("create", () => this.refreshFileDataAndTrie()),
            )
            this.registerEvent(
                this.app.vault.on("rename", () =>
                    this.refreshFileDataAndTrie(),
                ),
            )
            this.registerEvent(
                this.app.metadataCache.on("changed", file => this.refreshFileDataAndTrieOnFrontmatterChange(file)),
            )
        })

        // Command: Manually trigger link replacement for the current file.
        this.addCommand({
            id: "format-file",
            name: "Format file",
            icon: "wand-sparkles",
            editorCallback: async () => {
                try {
                    await this.formatThenRunPrettierAndLinter()
                }
                catch (error) {
                    console.error(error)
                }
            },
        })

        this.addCommand({
            id: "format-vault",
            name: "Format vault",
            icon: "drill",
            editorCallback: async () => {
                try {
                    await this.modifyLinksForVault()
                }
                catch (error) {
                    console.error(error)
                }
            },
        })

        this.addCommand({
            id: "rebuild-index",
            name: "Rebuild index",
            icon: "refresh-ccw",
            editorCallback: async () => {
                try {
                    this.refreshFileDataAndTrie()
                }
                catch (error) {
                    console.error(error)
                }
            },
        })

        this.addCommand({
            id: "format-selection",
            name: "Format selection",
            editorCallback: async () => {
                try {
                    await this.mofifyLinksSelection()
                }
                catch (error) {
                    console.error(error)
                }
            },
        })

        this.addCommand({
            id: "copy-file-without-links",
            name: "Copy file without links",
            editorCallback: async () => {
                const activeFile = this.app.workspace.getActiveFile()
                if (!activeFile) return
                const fileContent = await this.app.vault.read(activeFile)
                const { contentStart } = getFrontMatterInfo(fileContent)
                const body = fileContent.slice(contentStart)
                const bodyWithoutLinks = excludeLinks(body)
                await navigator.clipboard.writeText(bodyWithoutLinks)
            },
        })

        this.addCommand({
            id: "copy-selection-without-links",
            name: "Copy selection without links",
            editorCallback: async (editor: Editor) => {
                // Get the start and end positions of the selection
                const from = editor.getCursor("from")
                const to = editor.getCursor("to")

                // Get the full lines that contain the selection
                const selectedText = editor.getRange(
                    { line: from.line, ch: 0 },
                    { line: to.line, ch: editor.getLine(to.line).length },
                )

                if (!selectedText) return

                // Remove minimal indent
                const textWithMinimalIndent = removeMinimalIndent(selectedText)
                // Remove wikilinks
                const textWithoutLinks = excludeLinks(textWithMinimalIndent)

                await navigator.clipboard.writeText(textWithoutLinks)
            },
        })

        // Optionally, override the default save command to run modifyLinks (throttled).
        const saveCommandDefinition = this.app?.commands?.commands?.["editor:save-file"]
        const saveCallback = saveCommandDefinition?.checkCallback
        if (typeof saveCallback === "function") {
            // Preserve the original save callback to call it after modifying links.
            this.originalSaveCallback = saveCallback
        }

        saveCommandDefinition.checkCallback = (checking: boolean) => {
            if (checking) {
                return saveCallback?.(checking)
            }
            else {
                if (!this.settings.formatOnSave) return
                const target = this.captureFormattingTarget()
                if (!target) return
                runAsyncSafely(async () => {
                    await sleep(this.settings.formatDelayMs ?? 100)
                    await this.formatThenRunPrettierAndLinter(target)
                })
            }
        }
    }

    onunload() {
        // Restore original save command callback
        const saveCommandDefinition = this.app?.commands?.commands?.["editor:save-file"]
        if (saveCommandDefinition && this.originalSaveCallback) {
            saveCommandDefinition.checkCallback = this.originalSaveCallback
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }
}
