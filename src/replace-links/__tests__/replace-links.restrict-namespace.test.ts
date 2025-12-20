import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("replaceLinks - restrict namespace", () => {
    describe("automatic-linker-scoped with baseDir", () => {
        it("should respect scoped with baseDir", () => {
            const settings = {
                scoped: true,
                baseDir: "pages",
                namespaceResolution: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [
                    { path: "pages/set/tag", aliases: [] },
                    { path: "pages/other/current" },
                ],
                settings,
            })
            const result = replaceLinks({
                body: "tag",
                linkResolverContext: {
                    filePath: "pages/set/current",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[set/tag|tag]]")
        })

        it("should not replace when namespace does not match with baseDir", () => {
            const settings = {
                scoped: true,
                baseDir: "pages",
                namespaceResolution: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [
                    { path: "pages/set/tag" },
                    { path: "pages/other/current" },
                ],
                settings,
            })
            const result = replaceLinks({
                body: "tag",
                linkResolverContext: {
                    filePath: "pages/other/current",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("tag")
        })

        it("should handle multiple namespaces with scoped", () => {
            const settings = {
                scoped: true,
                baseDir: "pages",
                namespaceResolution: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [
                    { path: "pages/set1/tag1" },
                    { path: "pages/set2/tag2" },
                    { path: "pages/other/current" },
                ],
                settings,
            })
            const result = replaceLinks({
                body: "tag1 tag2",
                linkResolverContext: {
                    filePath: "pages/set1/current",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("[[set1/tag1|tag1]] tag2")
        })
    })
})
