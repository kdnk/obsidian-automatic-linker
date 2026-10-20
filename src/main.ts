import {
    App,
    Editor,
    getFrontMatterInfo,
    MarkdownView,
    Notice,
    parseFrontMatterAliases,
    parseYaml,
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
import { runAsyncSafely } from "./plugin-compat"

interface FormattingTarget {
    file: TFile
    path: string
    editor: Editor
}

interface FormattingRequest {
    target: FormattingTarget
    normalizeExistingWikilinks: boolean
}

interface ModifyLinksOptions {
    normalizeExistingWikilinks?: boolean
    urlTitleMap?: Map<string, string>
}

export default class AutomaticLinkerPlugin extends Plugin {
    settings: AutomaticLinkerSettings
    // Pre-built Trie for link candidate lookup
    private trie: TrieNode | null = null
    private candidateMap: Map<string, CandidateData> | null = null
    // Preserved callback for the original save command
    private originalSaveCallback: (checking: boolean) => boolean | void
    private saveCallback: (checking: boolean) => boolean | void
    private urlTitleMap: Map<string, string> = new Map()
    // Cache of frontmatter values that affect the Trie
    private frontmatterCache: Map<string, string> = new Map()
    private formattingTask: Promise<void> | null = null
    private pendingFormattingRequest: FormattingRequest | null = null
    private unloaded = false

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
            subpath,
            originalLink,
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
                    const link = this.app.fileManager.generateMarkdownLink(targetFile, sourcePath, subpath ?? "", displayAlias)
                    const escapedLink = escapeLinkForMarkdownTable(link, isInTable)
                    const isShortenedTarget = targetPath !== linkPath
                        && targetPath?.toLowerCase().endsWith(`/${linkPath.toLowerCase()}`)
                    if (link.startsWith("[[") && isShortenedTarget) {
                        try {
                            const shortenedTarget = this.app.metadataCache?.getFirstLinkpathDest(linkPath, sourcePath)
                            if (shortenedTarget === targetFile) {
                                return defaultLinkGenerator({ linkPath, subpath, sourcePath, alias, isInTable })
                            }
                        }
                        catch {
                            return escapedLink
                        }
                    }
                    return escapedLink
                }
                catch (error) {
                    // Fall back to default format if API fails
                    console.warn("Failed to generate link using Obsidian API:", error)
                }
            }

            return originalLink ?? defaultLinkGenerator({ linkPath, subpath, sourcePath, alias, isInTable })
        }
    }

    modifyLinks(
        fileContent: string,
        filePath: string,
        frontmatter?: Record<string, unknown>,
        { normalizeExistingWikilinks = true, urlTitleMap = this.urlTitleMap }: ModifyLinksOptions = {},
    ): string {
        if (!this.trie || !this.candidateMap) {
            return formatMarkdownDocument({
                content: fileContent,
                filePath,
                contentStart: getFrontMatterInfo(fileContent).contentStart,
                frontmatter,
                settings: this.settings,
                urlTitleMap,
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
            urlTitleMap,
            linkGenerator: candidateIndex ? this.createLinkGenerator(filePath) : undefined,
            normalizeExistingWikilinks,
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
        return !this.unloaded
            && this.app.workspace.getActiveFile() === target.file
            && target.file.path === target.path
            && this.getEditor() === target.editor
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

    isFormatOnSaveEnabled(): boolean {
        return !this.unloaded && this.settings?.formatOnSave === true
    }

    async formatText(
        text: string,
        file: TFile,
        options: Pick<ModifyLinksOptions, "normalizeExistingWikilinks"> = {},
    ): Promise<string> {
        const { frontmatter: yaml, contentStart } = getFrontMatterInfo(text)
        const parsed: unknown = yaml ? parseYaml(yaml) : undefined
        const frontmatter = parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : undefined
        if (isLinkingOff(frontmatter) || this.settings.excludeDirsFromAutoLinking.some(
            directory => file.path === directory || file.path.startsWith(directory + "/"),
        )) return text

        const urlTitleMap = new Map(this.urlTitleMap)
        if (this.settings.replaceUrlWithTitle && !isUrlTitleReplacementOff(frontmatter)) {
            const body = text.slice(contentStart)
            const urls = listupAllUrls(body, this.settings.replaceUrlWithTitleIgnoreDomains)
            for (const url of urls) {
                if (urlTitleMap.has(url)) continue
                try {
                    const title = getTitleFromHtml(await request(url))
                    if (title) {
                        urlTitleMap.set(url, title)
                        this.urlTitleMap.set(url, title)
                    }
                }
                catch (error) {
                    if (this.settings.debug) {
                        console.warn(`Automatic Linker: Failed to fetch URL title for: ${url}`, error)
                    }
                }
            }
        }
        return this.modifyLinks(text, file.path, frontmatter, { ...options, urlTitleMap })
    }

    async formatActiveFile(
        target = this.captureFormattingTarget(),
        { normalizeExistingWikilinks = true }: ModifyLinksOptions = {},
    ) {
        if (!target || !this.canFormatTarget(target)) return
        const pendingRequest = this.pendingFormattingRequest
        const samePendingTarget = pendingRequest
            && pendingRequest.target.file === target.file
            && pendingRequest.target.path === target.path
            && pendingRequest.target.editor === target.editor
        this.pendingFormattingRequest = {
            target,
            normalizeExistingWikilinks: normalizeExistingWikilinks
                || !!(samePendingTarget && pendingRequest.normalizeExistingWikilinks),
        }
        if (!this.formattingTask) {
            this.formattingTask = Promise.resolve().then(async () => {
                try {
                    while (this.pendingFormattingRequest && !this.unloaded) {
                        const next = this.pendingFormattingRequest
                        this.pendingFormattingRequest = null
                        await this.formatTarget(next)
                    }
                }
                catch (error) {
                    new Notice(`Automatic Linker: ${error instanceof Error ? error.message : "Formatting failed."}`)
                    throw error
                }
                finally {
                    this.formattingTask = null
                    this.pendingFormattingRequest = null
                }
            })
        }
        await this.formattingTask
    }

    private async formatTarget({ target, normalizeExistingWikilinks }: FormattingRequest) {
        if (!this.canFormatTarget(target)) return
        const oldText = target.editor.getValue()
        let newText = await this.formatText(oldText, target.file, { normalizeExistingWikilinks })
        if (!this.canFormatTarget(target)) return
        const currentText = target.editor.getValue()
        if (currentText !== oldText) {
            const { frontmatter: yaml } = getFrontMatterInfo(currentText)
            const parsed: unknown = yaml ? parseYaml(yaml) : undefined
            const frontmatter = parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : undefined
            if (this.settings.excludeDirsFromAutoLinking.some(
                directory => target.path === directory || target.path.startsWith(directory + "/"),
            )) return
            newText = this.modifyLinks(currentText, target.path, frontmatter, { normalizeExistingWikilinks })
        }
        if (newText !== currentText) updateEditor(currentText, newText, target.editor)
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
            if (this.unloaded) return
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
                    await this.formatActiveFile(undefined, {
                        normalizeExistingWikilinks: true,
                    })
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

        const saveCommandDefinition = this.app?.commands?.commands?.["editor:save-file"]
        const saveCallback = saveCommandDefinition?.checkCallback
        if (!saveCommandDefinition || typeof saveCallback !== "function") return
        this.originalSaveCallback = saveCallback

        this.saveCallback = (checking: boolean) => {
            if (checking || this.unloaded || !this.isFormatOnSaveEnabled() || this.isBulletEnabled()) {
                return saveCallback(checking)
            }
            const target = this.captureFormattingTarget()
            const sourceView = this.app.workspace.getActiveViewOfType(MarkdownView)
            if (!target || !sourceView) return saveCallback(checking)
            runAsyncSafely(async () => {
                try {
                    await this.formatActiveFile(target, {
                        normalizeExistingWikilinks: this.settings.normalizeExistingWikilinks,
                    })
                }
                finally {
                    if (sourceView.file === target.file
                        && sourceView.editor === target.editor
                        && sourceView.containerEl.isConnected) {
                        try {
                            if (this.app.workspace.getActiveViewOfType(MarkdownView) === sourceView) {
                                saveCallback(false)
                            }
                            else if ("save" in sourceView && typeof sourceView.save === "function") {
                                await sourceView.save()
                            }
                        }
                        catch (error) {
                            new Notice(`Automatic Linker could not save ${target.file.path}. ${error instanceof Error ? error.message : String(error)}`)
                        }
                    }
                }
            })
            return true
        }
        saveCommandDefinition.checkCallback = this.saveCallback
    }

    private isBulletEnabled(): boolean {
        const registry = (this.app as unknown as {
            plugins?: { plugins?: Record<string, unknown> }
        }).plugins?.plugins
        const bullet = registry?.bullet
        return !!bullet && typeof bullet === "object"
    }

    onunload() {
        this.unloaded = true
        this.pendingFormattingRequest = null
        // Leave later wrappers installed; our inactive wrapper delegates through.
        const saveCommandDefinition = this.app?.commands?.commands?.["editor:save-file"]
        if (saveCommandDefinition?.checkCallback === this.saveCallback && this.originalSaveCallback) {
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
