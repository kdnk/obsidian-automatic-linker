import { describe, it, expect } from "vitest"
import { escapeLinkForMarkdownTable, replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("table", () => {
    it("escapes link separators only when rendering inside a markdown table", () => {
        expect(escapeLinkForMarkdownTable("[[ns/note1|note1]]", true)).toBe("[[ns/note1\\|note1]]")
        expect(escapeLinkForMarkdownTable("[[ns/note1|note1]]", false)).toBe("[[ns/note1|note1]]")
    })

    it("escape pipe inside table", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
            proximityBasedLinking: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "ns/note1" }, { path: "ns/note2" }],
            settings,
        })
        const result = replaceLinks({
            body: `
| Test Item                         | |
| --------------------------------- | --- |
| note1                             | |
| note2                             | |
`,
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result).toBe(`
| Test Item                         | |
| --------------------------------- | --- |
| [[ns/note1\\|note1]]                             | |
| [[ns/note2\\|note2]]                             | |
`)
    })

    it("does not replace links inside tables when ignoreMarkdownTables is enabled", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
            proximityBasedLinking: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "ns/note1" }],
            settings,
        })
        const result = replaceLinks({
            body: `
note1
| Test Item | |
| --- | --- |
| note1 | |
`,
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings: {
                ...settings,
                ignoreMarkdownTables: true,
            },
        })
        expect(result).toBe(`
[[ns/note1|note1]]
| Test Item | |
| --- | --- |
| note1 | |
`)
    })

    it("does not replace existing links inside tables when ignoreMarkdownTables is enabled", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
            proximityBasedLinking: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "ns/note1" }],
            settings,
        })
        const result = replaceLinks({
            body: `
[[note1]]
| Test Item | |
| --- | --- |
| [[note1]] | |
`,
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings: {
                ...settings,
                ignoreMarkdownTables: true,
            },
            resolvedAmbiguities: new Map([["[[note1]]", "ns/note1|note1"]]),
        })
        expect(result).toBe(`
[[ns/note1|note1]]
| Test Item | |
| --- | --- |
| [[note1]] | |
`)
    })

    it("escapes table aliases after earlier resolved wikilinks change segment offsets", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
            proximityBasedLinking: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "ns/note1" }],
            settings,
        })
        const result = replaceLinks({
            body: `[[note1]]
| note1 | |
`,
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
            resolvedAmbiguities: new Map([
                ["[[note1]]", "very/long/path/note1|note1"],
            ]),
        })
        expect(result).toBe(`[[very/long/path/note1|note1]]
| [[ns/note1\\|note1]] | |
`)
    })
})
