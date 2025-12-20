import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("replaceLinks with prevent-linking", () => {
    it("does not link to files with exclude: true", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "private-note", exclude: true },
                { path: "public-note", exclude: false },
            ],
            settings,
        })

        const result = replaceLinks({
            body: "private-note and public-note",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })

        // private-note should NOT be linked, but public-note should be linked
        expect(result).toBe("private-note and [[public-note]]")
    })

    it("does not link to files with exclude: true even with aliases", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                {
                    path: "private-note",
                    aliases: ["secret"],
                    exclude: true,
                },
                {
                    path: "public-note",
                    aliases: ["open"],
                    exclude: false,
                },
            ],
            settings,
        })

        const result = replaceLinks({
            body: "secret and open",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })

        // "secret" should NOT be linked, but "open" should be linked
        expect(result).toBe("secret and [[public-note|open]]")
    })

    it("does not link to files with exclude: true in namespace context", () => {
        const settings = {
            scoped: false,
            baseDir: "pages",
            proximityBasedLinking: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "pages/private-doc", exclude: true },
                { path: "pages/public-doc", exclude: false },
            ],
            settings,
        })

        const result = replaceLinks({
            body: "private-doc and public-doc",
            linkResolverContext: {
                filePath: "pages/index",
                trie,
                candidateMap,
            },
            settings,
        })

        // private-doc should NOT be linked, but public-doc should be linked
        expect(result).toBe("private-doc and [[public-doc]]")
    })

    it("handles exclude with mixed content", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "private", exclude: true },
                { path: "public", exclude: false },
                { path: "another-public" },
            ],
            settings,
        })

        const result = replaceLinks({
            body: "private public another-public",
            linkResolverContext: {
                filePath: "test",
                trie,
                candidateMap,
            },
            settings,
        })

        expect(result).toBe("private [[public]] [[another-public]]")
    })

    it("does not link to exclude files in bullet points", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "private-note", exclude: true },
                { path: "public-note", exclude: false },
            ],
            settings,
        })

        const result = replaceLinks({
            body: "- private-note\n- public-note",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })

        expect(result).toBe("- private-note\n- [[public-note]]")
    })
})
