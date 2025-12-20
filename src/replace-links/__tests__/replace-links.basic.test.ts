import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("replaceLinks", () => {
    describe("basic", () => {
        it("replaces links", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }],
                settings,
            })
            const result = replaceLinks({
                body: "hello",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[hello]]")
        })

        it("replaces links with space", () => {
            const settings = {
                scoped: false,
                baseDir: "pages",
                proximityBasedLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "pages/tidy first" }],
                settings,
            })
            console.log(candidateMap)
            const result = replaceLinks({
                body: "tidy first",
                linkResolverContext: {
                    filePath: "pages/Books",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[tidy first]]")
        })

        it("replaces links with bullet", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }],
                settings,
            })
            const result = replaceLinks({
                body: "- hello",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("- [[hello]]")
        })

        it("replaces links with number", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }],
                settings,
            })
            const result = replaceLinks({
                body: "1. hello",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("1. [[hello]]")
        })

        it("does not replace links in code blocks", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }],
                settings,
            })
            const result = replaceLinks({
                body: "```\nhello\n```",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("```\nhello\n```")
        })

        it("does not replace links in inline code", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }],
                settings,
            })
            const result = replaceLinks({
                body: "`hello`",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("`hello`")
        })

        it("does not replace existing wikilinks", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }],
                settings,
            })
            const result = replaceLinks({
                body: "[[hello]]",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[hello]]")
        })

        it("does not replace existing markdown links", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }],
                settings,
            })
            const result = replaceLinks({
                body: "[hello](world)",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[hello](world)")
        })

        it("does not replace text in single brackets", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }, { path: "world" }],
                settings,
            })
            const result = replaceLinks({
                body: "[hello]",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[hello]")
        })

        it("does not replace consecutive single brackets", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }, { path: "world" }],
                settings,
            })
            const result = replaceLinks({
                body: "[hello][world]",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[hello][world]")
        })
    })

    describe("with space", () => {
        it("space without namespace", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "automatic linker" }, { path: "automatic" }],
                settings,
            })
            const result = replaceLinks({
                body: "automatic linker",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[automatic linker]]")
        })
        it("space with namespace", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [
                    { path: "obsidian/automatic linker" },
                    { path: "obsidian" },
                ],
                settings,
            })
            const result = replaceLinks({
                body: "obsidian/automatic linker",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe(
                "[[obsidian/automatic linker|automatic linker]]",
            )
        })
    })

    describe("multiple links", () => {
        it("replaces multiple links in the same line", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }, { path: "world" }],
                settings,
            })
            const result = replaceLinks({
                body: "hello world",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[hello]] [[world]]")
        })

        it("replaces multiple links in different lines", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "hello" }, { path: "world" }],
                settings,
            })
            const result = replaceLinks({
                body: "hello\nworld",
                linkResolverContext: {
                    filePath: "journals/2022-01-01",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[hello]]\n[[world]]")
        })
    })
})
