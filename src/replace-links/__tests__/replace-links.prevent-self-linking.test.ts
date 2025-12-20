import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("replaceLinks - prevent self-linking", () => {
    describe("when preventSelfLinking is true", () => {
        it("should not link text to its own file", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                preventSelfLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "VPN" }, { path: "Welcome" }],
                settings,
            })

            // In VPN.md file, "VPN" should not be linked
            const result = replaceLinks({
                body: "This is a note about VPN",
                linkResolverContext: {
                    filePath: "VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("This is a note about VPN")
        })

        it("should link text in other files", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                preventSelfLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "VPN" }, { path: "Welcome" }],
                settings,
            })

            // In Welcome.md file, "VPN" should be linked
            const result = replaceLinks({
                body: "Here is my VPN Note",
                linkResolverContext: {
                    filePath: "Welcome",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("Here is my [[VPN]] Note")
        })

        it("should handle files with namespaces", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                preventSelfLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "docs/VPN" }, { path: "docs/Welcome" }],
                settings,
            })

            // In docs/VPN.md file, "VPN" should not be linked
            const result = replaceLinks({
                body: "This is about VPN",
                linkResolverContext: {
                    filePath: "docs/VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("This is about VPN")
        })

        it("should handle files with baseDir", () => {
            const settings = {
                scoped: false,
                baseDir: "pages",
                preventSelfLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "pages/VPN" }, { path: "pages/Welcome" }],
                settings,
            })

            // In pages/VPN.md file, "VPN" should not be linked
            const result = replaceLinks({
                body: "This is about VPN",
                linkResolverContext: {
                    filePath: "pages/VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("This is about VPN")
        })

        it("should handle multiple occurrences in the same file", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                preventSelfLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "VPN" }],
                settings,
            })

            const result = replaceLinks({
                body: "VPN is important. Always use VPN when connecting.",
                linkResolverContext: {
                    filePath: "VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("VPN is important. Always use VPN when connecting.")
        })
    })

    describe("when preventSelfLinking is false", () => {
        it("should link text to its own file (default behavior)", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                preventSelfLinking: false,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "VPN" }],
                settings,
            })

            const result = replaceLinks({
                body: "This is about VPN",
                linkResolverContext: {
                    filePath: "VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("This is about [[VPN]]")
        })

        it("should link text to its own file when setting is undefined", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "VPN" }],
                settings,
            })

            const result = replaceLinks({
                body: "This is about VPN",
                linkResolverContext: {
                    filePath: "VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("This is about [[VPN]]")
        })
    })

    describe("edge cases", () => {
        it("should work with case-insensitive matching", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
                preventSelfLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "VPN" }],
                settings,
            })

            const result = replaceLinks({
                body: "This is about vpn",
                linkResolverContext: {
                    filePath: "VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("This is about vpn")
        })

        it("should only prevent self-links, not other links", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                preventSelfLinking: true,
            }
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files: [{ path: "VPN" }, { path: "SSH" }, { path: "Networking" }],
                settings,
            })

            const result = replaceLinks({
                body: "VPN and SSH are both important for Networking",
                linkResolverContext: {
                    filePath: "VPN",
                    trie,
                    candidateMap,
                },
                settings,
            })
            expect(result).toBe("VPN and [[SSH]] are both important for [[Networking]]")
        })
    })
})
