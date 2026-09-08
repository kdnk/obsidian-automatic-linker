import { describe, expect, it } from "vitest"
import {
    formatMarkdownBody,
    formatMarkdownDocument,
    formatMarkdownSelection,
    toReplaceLinksSettings,
} from "../formatting-run"
import { buildCandidateTrieForTest } from "../replace-links/__tests__/test-helpers"
import { DEFAULT_SETTINGS } from "../settings/settings-info"

describe("toReplaceLinksSettings", () => {
    it("projects only replacement settings and applies baseDir", () => {
        expect(toReplaceLinksSettings({
            ...DEFAULT_SETTINGS,
            proximityBasedLinking: false,
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        }, "pages")).toEqual({
            proximityBasedLinking: false,
            baseDir: "pages",
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        })
    })
})

describe("formatMarkdownDocument", () => {
    it("preserves frontmatter and respects URL title opt-out", () => {
        const result = formatMarkdownDocument({
            content: "---\nautomatic-linker-disable-url-title: true\n---\nhttps://example.com",
            filePath: "current-file.md",
            frontmatter: { "automatic-linker-disable-url-title": true },
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: false,
                formatJiraURLs: false,
                formatLinearURLs: false,
                replaceUrlWithTitle: true,
            },
            urlTitleMap: new Map([["https://example.com", "Example Title"]]),
        })

        expect(result).toBe(
            "---\nautomatic-linker-disable-url-title: true\n---\nhttps://example.com",
        )
    })

    it("preserves GitHub URLs and text in frontmatter byte-for-byte", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const result = formatMarkdownDocument({
            content:
                "---\nautomatic-linker-disable-url-title: true\nreference: https://github.com/openai/openai/issues/1\nterm: TypeScript\n---\nTypeScript https://example.com",
            filePath: "current-file.md",
            frontmatter: {
                "automatic-linker-disable-url-title": true,
            },
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: true,
                formatJiraURLs: false,
                formatLinearURLs: false,
                replaceUrlWithTitle: true,
                ignoreCase: true,
            },
            candidateIndex: { candidateMap, trie },
        })

        expect(result).toBe(
            "---\nautomatic-linker-disable-url-title: true\nreference: https://github.com/openai/openai/issues/1\nterm: TypeScript\n---\n[[notes/TypeScript|TypeScript]] https://example.com",
        )
    })

    it("runs URL formatting, URL titles, and link replacement in order", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const result = formatMarkdownDocument({
            content: "Read TypeScript at https://example.com",
            filePath: "current-file.md",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: false,
                formatJiraURLs: false,
                formatLinearURLs: false,
                replaceUrlWithTitle: true,
                ignoreCase: true,
            },
            candidateIndex: { candidateMap, trie },
            urlTitleMap: new Map([["https://example.com", "Example Title"]]),
        })

        expect(result).toBe("Read [[notes/TypeScript|TypeScript]] at [Example Title](https://example.com)")
    })
})

describe("formatMarkdownBody", () => {
    it("formats selected body text without frontmatter splitting", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const result = formatMarkdownBody({
            body: "TypeScript",
            filePath: "current-file.md",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: false,
                formatJiraURLs: false,
                formatLinearURLs: false,
                replaceUrlWithTitle: false,
                ignoreCase: true,
            },
            candidateIndex: { candidateMap, trie },
        })

        expect(result).toBe("[[notes/TypeScript|TypeScript]]")
    })
})

describe("formatMarkdownSelection", () => {
    it("escapes aliases when only a table cell is selected", () => {
        const candidateIndex = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }],
            settings: { scoped: false, baseDir: undefined, ignoreCase: true },
        })
        expect(formatMarkdownSelection({
            body: "| TypeScript | other |\nTypeScript",
            selection: { start: 2, end: 12 },
            filePath: "current.md",
            settings: DEFAULT_SETTINGS,
            candidateIndex,
        })).toBe("[[notes/TypeScript\\|TypeScript]]")
    })

    it("keeps selection formatting to link replacement only", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const result = formatMarkdownSelection({
            body: "TypeScript https://github.com/openai/openai/issues/1",
            filePath: "current-file.md",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: true,
                formatJiraURLs: true,
                formatLinearURLs: true,
                replaceUrlWithTitle: true,
                ignoreCase: true,
            },
            candidateIndex: { candidateMap, trie },
        })

        expect(result).toBe(
            "[[notes/TypeScript|TypeScript]] https://github.com/openai/openai/issues/1",
        )
    })

    it("leaves linear URLs unchanged when a linear note exists", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "notes/linear" },
                { path: "notes/TypeScript" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const result = formatMarkdownSelection({
            body: "linear://workspace/issue/ACME-123",
            filePath: "current-file.md",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: true,
                formatJiraURLs: true,
                formatLinearURLs: true,
                replaceUrlWithTitle: true,
                ignoreCase: true,
            },
            candidateIndex: { candidateMap, trie },
        })

        expect(result).toBe("linear://workspace/issue/ACME-123")
    })
})

describe("formatting safety", () => {
    it("preserves CRLF frontmatter while formatting the body", () => {
        const header = "---\r\nreference: https://github.com/a/b/issues/1\r\n---\r\n"
        expect(formatMarkdownDocument({
            content: header + "https://github.com/a/b/issues/1",
            filePath: "note.md",
            settings: DEFAULT_SETTINGS,
        })).toBe(header + "[[github/a/b/issues/1]] [🔗](https://github.com/a/b/issues/1)")
    })

    it.each(["automatic-linker-off", "automatic-linker-disabled"])("skips all document formatting with %s", (key) => {
        const content = "https://github.com/a/b/issues/1"
        expect(formatMarkdownDocument({
            content,
            filePath: "note.md",
            frontmatter: { [key]: true },
            settings: DEFAULT_SETTINGS,
        })).toBe(content)
    })
})
