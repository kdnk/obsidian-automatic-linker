import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("replaceLinks - excludeDirsFromAutoLinking", () => {
    it("excludes files from specified directories", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "Templates/meeting-notes" },
                { path: "project" },
            ],
            settings,
            excludeDirs: ["Templates"],
        })

        // "meeting-notes" should not be linked because it's in the Templates directory
        const result1 = replaceLinks({
            body: "meeting-notes",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result1).toBe("meeting-notes")

        // "project" should be linked because it's not in an excluded directory
        const result2 = replaceLinks({
            body: "project",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result2).toBe("[[project]]")
    })

    it("excludes multiple directories", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "Templates/daily" },
                { path: "Archive/old-note" },
                { path: "active-note" },
            ],
            settings,
            excludeDirs: ["Templates", "Archive"],
        })

        // Files in excluded directories should not be linked
        const result1 = replaceLinks({
            body: "daily",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result1).toBe("daily")

        const result2 = replaceLinks({
            body: "old-note",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result2).toBe("old-note")

        // Files in non-excluded directories should be linked
        const result3 = replaceLinks({
            body: "active-note",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result3).toBe("[[active-note]]")
    })

    it("excludes nested directories", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "Templates/Meetings/weekly" },
                { path: "regular" },
            ],
            settings,
            excludeDirs: ["Templates"],
        })

        // Files in nested excluded directories should not be linked
        const result1 = replaceLinks({
            body: "weekly",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result1).toBe("weekly")

        // Files outside excluded directories should be linked
        const result2 = replaceLinks({
            body: "regular",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result2).toBe("[[regular]]")
    })

    it("works with empty exclude list", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "meeting" },
                { path: "project" },
            ],
            settings,
            excludeDirs: [],
        })

        // All files should be linked when exclude list is empty
        const result1 = replaceLinks({
            body: "meeting",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result1).toBe("[[meeting]]")

        const result2 = replaceLinks({
            body: "project",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result2).toBe("[[project]]")
    })

    it("works with baseDir and excludeDirs together", () => {
        const settings = {
            scoped: false,
            baseDir: "pages",
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "pages/Templates/daily" },
                { path: "pages/work" },
            ],
            settings,
            excludeDirs: ["pages/Templates"],
        })

        // Excluded directory files should not be linked (even with short path)
        const result1 = replaceLinks({
            body: "Templates/daily",
            linkResolverContext: {
                filePath: "pages/journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result1).toBe("Templates/daily")

        // Non-excluded directory files should be linked (using short path)
        const result2 = replaceLinks({
            body: "work",
            linkResolverContext: {
                filePath: "pages/journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result2).toBe("[[work]]")
    })
})
