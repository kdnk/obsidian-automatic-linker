import { describe, expect, it, vi } from "vitest"
import { buildCandidateTrieForTest } from "../replace-links/__tests__/test-helpers"
import { DEFAULT_SETTINGS } from "../settings/settings-info"

class MockTFile {
    path: string

    constructor(path: string) {
        this.path = path
    }
}

vi.mock("obsidian", () => ({
    App: class {},
    Editor: class {},
    getFrontMatterInfo: () => ({ contentStart: 0 }),
    MarkdownView: class {},
    Notice: class {},
    parseFrontMatterAliases: () => [],
    Plugin: class {
        app: unknown

        constructor(app: unknown) {
            this.app = app
        }
    },
    PluginSettingTab: class {},
    request: async () => ({}),
    Setting: class {
        setName() { return this }
        setDesc() { return this }
        setHeading() { return this }
        addToggle() { return this }
        addTextArea() { return this }
    },
    TFile: MockTFile,
}))

describe("AutomaticLinkerPlugin link generator", () => {
    it.each([
        { name: "exact-case link", body: "Topic", resolution: "target", expected: "[[Topic]]" },
        { name: "case-insensitive link", body: "topic", resolution: "target", expected: "[[topic]]" },
        { name: "conflicting shortened link", body: "Topic", resolution: "other", expected: "[[pages/Topic]]" },
        { name: "failed resolution check", body: "Topic", resolution: "error", expected: "[[pages/Topic]]" },
    ])("omits the configured new-note folder for a $name only when it resolves to the target", async ({ body, resolution, expected }) => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "pages/Topic" }],
            settings: { scoped: false, baseDir: "pages", ignoreCase: true },
        })
        const targetFile = new MockTFile("pages/Topic.md")
        const otherFile = new MockTFile("Topic.md")
        const app = {
            fileManager: {
                generateMarkdownLink: vi.fn(() => "[[pages/Topic]]"),
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn((linkPath: string, sourcePath: string) => {
                    if (resolution === "error") throw new Error("resolution failed")
                    if (linkPath !== body || sourcePath !== "current-file.md") return null
                    return resolution === "target" ? targetFile : otherFile
                }),
            },
            vault: {
                getAbstractFileByPath: vi.fn((filePath: string) => {
                    if (filePath === targetFile.path) return targetFile
                    return null
                }),
                getConfig: vi.fn(() => "pages"),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            ignoreCase: true,
            respectNewFileFolderPath: true,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        expect(plugin.modifyLinks(body, "current-file.md")).toBe(expected)
    })

    it.each([
        { input: "[[pages/1on1]]", expected: "[[1on1]]" },
        { input: "[[pages/1on1|1on1]]", expected: "[[1on1]]" },
        { input: "[[pages/1on1|meeting]]", expected: "[[1on1|meeting]]" },
        { input: "[[pages/1on1#Agenda]]", expected: "[[1on1#Agenda]]" },
        { input: "[[pages/1on1#^next-actions]]", expected: "[[1on1#^next-actions]]" },
        { input: "| [[pages/1on1\\|meeting]] |", expected: "| [[1on1\\|meeting]] |" },
        { input: "`[[pages/1on1]]`", expected: "`[[pages/1on1]]`" },
    ])("normalizes an existing base-directory wikilink: $input", async ({ input, expected }) => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "pages/1on1" }],
            settings: { scoped: false, baseDir: "pages", ignoreCase: true },
        })
        const targetFile = new MockTFile("pages/1on1.md")
        const app = {
            fileManager: {
                generateMarkdownLink: vi.fn((_file: MockTFile, _sourcePath: string, subpath: string, alias: string) =>
                    `[[pages/1on1${subpath}${alias ? `|${alias}` : ""}]]`),
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn(() => targetFile),
            },
            vault: {
                getAbstractFileByPath: vi.fn(() => targetFile),
                getConfig: vi.fn(() => "pages"),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            ignoreCase: true,
            respectNewFileFolderPath: true,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        const result = plugin.modifyLinks(input, "journals/2026-09-16.md")

        expect(result).toBe(expected)
        expect(plugin.modifyLinks(result, "journals/2026-09-16.md")).toBe(expected)
    })

    it("leaves existing wikilinks unchanged when normalization is disabled", async () => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "pages/1on1" }],
            settings: { scoped: false, baseDir: "pages", ignoreCase: true },
        })
        const targetFile = new MockTFile("pages/1on1.md")
        const app = {
            fileManager: { generateMarkdownLink: vi.fn(() => "[[pages/1on1]]") },
            metadataCache: { getFirstLinkpathDest: vi.fn(() => targetFile) },
            vault: {
                getAbstractFileByPath: vi.fn(() => targetFile),
                getConfig: vi.fn(() => "pages"),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            ignoreCase: true,
            respectNewFileFolderPath: true,
            normalizeExistingWikilinks: false,
        } as typeof plugin.settings
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        expect(plugin.modifyLinks(
            "[[pages/1on1]]",
            "current-file.md",
            undefined,
            { normalizeExistingWikilinks: true },
        ))
            .toBe("[[pages/1on1]]")
    })

    it("keeps the canonical path when a shortened existing wikilink would resolve to another file", async () => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "pages/Topic" }],
            settings: { scoped: false, baseDir: "pages", ignoreCase: true },
        })
        const targetFile = new MockTFile("pages/Topic.md")
        const otherFile = new MockTFile("Topic.md")
        const app = {
            fileManager: {
                generateMarkdownLink: vi.fn(() => "[[pages/Topic]]"),
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn(() => otherFile),
            },
            vault: {
                getAbstractFileByPath: vi.fn(() => targetFile),
                getConfig: vi.fn(() => "pages"),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            ignoreCase: true,
            respectNewFileFolderPath: true,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        expect(plugin.modifyLinks(
            "[[pages/Topic]]",
            "current-file.md",
            undefined,
            { normalizeExistingWikilinks: true },
        ))
            .toBe("[[pages/Topic]]")
    })

    it("keeps an unresolved existing base-directory wikilink unchanged", async () => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "pages/Missing" }],
            settings: { scoped: false, baseDir: "pages", ignoreCase: true },
        })
        const app = {
            fileManager: {
                generateMarkdownLink: vi.fn(),
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn(() => null),
            },
            vault: {
                getAbstractFileByPath: vi.fn(() => null),
                getConfig: vi.fn(() => "pages"),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            ignoreCase: true,
            respectNewFileFolderPath: true,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        expect(plugin.modifyLinks(
            "[[pages/Missing]]",
            "journals/2026-09-16.md",
            undefined,
            { normalizeExistingWikilinks: true },
        ))
            .toBe("[[pages/Missing]]")
    })

    it("preserves aliases and table escaping when omitting the new-note folder", async () => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "pages/Topic", aliases: ["subject"] }],
            settings: { scoped: false, baseDir: "pages", ignoreCase: true },
        })
        const targetFile = new MockTFile("pages/Topic.md")
        const app = {
            fileManager: {
                generateMarkdownLink: vi.fn(() => "[[pages/Topic|subject]]"),
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn(() => targetFile),
            },
            vault: {
                getAbstractFileByPath: vi.fn(() => targetFile),
                getConfig: vi.fn(() => "pages"),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            ignoreCase: true,
            respectNewFileFolderPath: true,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        expect(plugin.modifyLinks("| subject |", "current-file.md"))
            .toBe("| [[Topic\\|subject]] |")
    })

    it.each([
        { name: "base-directory file", path: "pages/Topic", body: "Topic", baseDir: "pages", aliases: [], duplicate: false },
        { name: "base-directory file with a root duplicate", path: "pages/Topic", body: "pages/Topic", baseDir: "pages", aliases: [], duplicate: true },
        { name: "case-insensitive root file", path: "TypeScript", body: "typescript", baseDir: undefined, aliases: [], duplicate: false },
        { name: "base-directory alias", path: "pages/Topic", body: "subject", baseDir: "pages", aliases: ["subject"], duplicate: true },
        { name: "alias equal to the short path", path: "pages/Topic", body: "Topic", baseDir: "pages", aliases: ["Topic"], duplicate: false },
    ])("uses the canonical target for a $name", async ({ path, body, baseDir, aliases, duplicate }) => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const files = [{ path, aliases }]
        if (duplicate) files.push({ path: "Topic", aliases: [] })
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files,
            settings: { scoped: false, baseDir, ignoreCase: true },
        })
        const targetFile = new MockTFile(`${path}.md`)
        const rootFile = new MockTFile("Topic.md")
        const app = {
            fileManager: {
                generateMarkdownLink: vi.fn((file: MockTFile, _sourcePath: string, _subpath: string, alias: string) => {
                    const displayText = alias || file.path.slice(0, -3).split("/").pop()
                    return `[${displayText}](${file.path})`
                }),
            },
            vault: {
                getAbstractFileByPath: vi.fn((filePath: string) => {
                    if (filePath === targetFile.path) return targetFile
                    if (duplicate && filePath === rootFile.path) return rootFile
                    return null
                }),
                getConfig: vi.fn(() => baseDir),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            ignoreCase: true,
            respectNewFileFolderPath: !!baseDir,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        expect(plugin.modifyLinks(body, "current-file.md")).toBe(`[${body}](${path}.md)`)
        expect(app.fileManager.generateMarkdownLink).toHaveBeenCalledWith(targetFile, "current-file.md", "", expect.any(String))
    })

    it("escapes alias separators generated by Obsidian inside markdown tables", async () => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const settings = {
            scoped: false,
            baseDir: undefined,
            ignoreCase: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/foo", aliases: ["bar"] }],
            settings,
        })
        const targetFile = new MockTFile("notes/foo.md")
        const app = {
            fileManager: {
                generateMarkdownLink: vi.fn(() => "[[notes/foo|bar]]"),
            },
            vault: {
                getAbstractFileByPath: vi.fn((path: string) => {
                    if (path === "notes/foo.md") return targetFile
                    return null
                }),
                getConfig: vi.fn(),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            formatGitHubURLs: false,
            formatJiraURLs: false,
            replaceUrlWithTitle: false,
            respectNewFileFolderPath: false,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        const result = plugin.modifyLinks("| bar | x |\n| --- | --- |\n", "current-file.md")

        expect(result).toBe("| [[notes/foo\\|bar]] | x |\n| --- | --- |\n")
    })

    it("keeps selection formatting to link replacement only", async () => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const settings = {
            scoped: false,
            baseDir: undefined,
            ignoreCase: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }, { path: "pages/Existing" }],
            settings,
        })
        const replaceSelection = vi.fn()
        const typeScriptFile = new MockTFile("notes/TypeScript.md")
        const existingFile = new MockTFile("pages/Existing.md")
        const app = {
            metadataCache: {
                getFileCache: () => ({ frontmatter: {} }),
                getFirstLinkpathDest: vi.fn((linkPath: string) =>
                    linkPath === "Existing" ? existingFile : typeScriptFile),
            },
            workspace: {
                getActiveFile: vi.fn(() => ({ path: "current-file.md" })),
                activeEditor: {
                    editor: {
                        getValue: vi.fn(() => "TypeScript [[pages/Existing]] https://github.com/openai/openai/issues/1"),
                        getSelection: vi.fn(() => "TypeScript [[pages/Existing]] https://github.com/openai/openai/issues/1"),
                        getCursor: vi.fn(() => ({ line: 0, ch: 0 })),
                        posToOffset: vi.fn(() => 0),
                        replaceSelection,
                    },
                },
            },
            vault: {
                getConfig: vi.fn(() => "pages"),
                getAbstractFileByPath: vi.fn((path: string) => {
                    if (path === typeScriptFile.path) return typeScriptFile
                    if (path === existingFile.path) return existingFile
                    return null
                }),
            },
            fileManager: {
                generateMarkdownLink: vi.fn((file: MockTFile, _source: string, _subpath: string, alias: string) =>
                    `[[${file.path.slice(0, -3)}${alias ? `|${alias}` : ""}]]`),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            formatGitHubURLs: true,
            formatJiraURLs: true,
            formatLinearURLs: true,
            replaceUrlWithTitle: true,
            respectNewFileFolderPath: true,
        }
        ;(plugin as unknown as { trie: typeof trie }).trie = trie
        ;(plugin as unknown as { candidateMap: typeof candidateMap }).candidateMap = candidateMap

        await plugin.mofifyLinksSelection()

        expect(replaceSelection).toHaveBeenCalledWith(
            "[[notes/TypeScript|TypeScript]] [[Existing]] https://github.com/openai/openai/issues/1",
        )
    })
})
