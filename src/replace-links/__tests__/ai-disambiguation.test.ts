import { describe, it, expect } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrie } from "../../trie"

describe("replaceLinks with AI disambiguation", () => {
    const allFiles = [
        { path: "work/meeting", scoped: false, aliases: [] },
        { path: "private/meeting", scoped: false, aliases: [] },
    ]
    const { candidateMap, trie } = buildCandidateTrie(allFiles, undefined, true)
    const context = {
        filePath: "test.md",
        trie,
        candidateMap,
    }

    it("should use the AI-resolved path for unlinked words", () => {
        const body = "I have a meeting."
        const resolvedAmbiguities = new Map([["meeting", "work/meeting"]])

        const result = replaceLinks({
            body,
            linkResolverContext: context,
            resolvedAmbiguities,
        })

        expect(result).toBe("I have a [[work/meeting|meeting]].")
    })

    it("should correct existing links if resolvedAmbiguities contains them", () => {
        const body = "Check [[private/meeting|meeting]] notes."
        const resolvedAmbiguities = new Map([["[[private/meeting|meeting]]", "work/meeting"]])

        const result = replaceLinks({
            body,
            linkResolverContext: context,
            resolvedAmbiguities,
        })

        expect(result).toBe("Check [[work/meeting|meeting]] notes.")
    })

    it("should handle existing links without alias for correction", () => {
        const body = "Check [[private/meeting]] notes."
        // The resolveAmbiguities scanner uses the full link as key
        const resolvedAmbiguities = new Map([["[[private/meeting]]", "work/meeting"]])

        const result = replaceLinks({
            body,
            linkResolverContext: context,
            resolvedAmbiguities,
        })

        expect(result).toBe("Check [[work/meeting|private/meeting]] notes.")
    })

    it("should honor AI-resolved Korean suffix choices", () => {
        const koreanFiles = [
            { path: "work/문서", scoped: false, aliases: [] },
            { path: "private/문서", scoped: false, aliases: [] },
        ]
        const { candidateMap: koreanCandidateMap, trie: koreanTrie } = buildCandidateTrie(
            koreanFiles,
            undefined,
            true,
        )
        const body = "문서이다."
        const resolvedAmbiguities = new Map([["문서", "private/문서"]])

        const result = replaceLinks({
            body,
            linkResolverContext: {
                filePath: "test.md",
                trie: koreanTrie,
                candidateMap: koreanCandidateMap,
            },
            resolvedAmbiguities,
        })

        expect(result).toBe("[[private/문서|문서]]이다.")
    })
})
