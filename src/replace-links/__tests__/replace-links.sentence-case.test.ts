import { describe, it, expect } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("sentence case matching", () => {
    const buildContext = (ignoreCase: boolean, matchSentenceCase: boolean) => {
        const settings = {
            scoped: false,
            baseDir: undefined,
            ignoreCase,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "my name" }],
            settings,
        })
        return {
            candidateMap,
            trie,
            replaceSettings: {
                ...settings,
                matchSentenceCase,
            },
        }
    }

    it("matches sentence-start capitalized text at the beginning of text", () => {
        const { candidateMap, trie, replaceSettings } = buildContext(false, true)
        const result = replaceLinks({
            body: "My name is John",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: replaceSettings,
        })
        expect(result).toBe("[[my name|My name]] is John")
    })

    it("does not match mid-sentence capitalized text", () => {
        const { candidateMap, trie, replaceSettings } = buildContext(false, true)
        const result = replaceLinks({
            body: "he knows My name",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: replaceSettings,
        })
        expect(result).toBe("he knows My name")
    })

    it("matches lowercase text in mid-sentence (exact match)", () => {
        const { candidateMap, trie, replaceSettings } = buildContext(false, true)
        const result = replaceLinks({
            body: "he knows my name well",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: replaceSettings,
        })
        expect(result).toBe("he knows [[my name]] well")
    })

    it("matches after a period and space", () => {
        const { candidateMap, trie, replaceSettings } = buildContext(false, true)
        const result = replaceLinks({
            body: "something happened. My name is John",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: replaceSettings,
        })
        expect(result).toBe("something happened. [[my name|My name]] is John")
    })

    it("matches after a newline", () => {
        const { candidateMap, trie, replaceSettings } = buildContext(false, true)
        const result = replaceLinks({
            body: "line one\nMy name is here",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: replaceSettings,
        })
        expect(result).toBe("line one\n[[my name|My name]] is here")
    })

    it("does not match when matchSentenceCase is off", () => {
        const { candidateMap, trie, replaceSettings } = buildContext(false, false)
        const result = replaceLinks({
            body: "My name is John",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: replaceSettings,
        })
        expect(result).toBe("My name is John")
    })

    it("does not interfere when ignoreCase is on", () => {
        const { candidateMap, trie, replaceSettings } = buildContext(true, true)
        const result = replaceLinks({
            body: "My name is John",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: replaceSettings,
        })
        expect(result).toBe("[[My name]] is John")
    })

    it("handles path with alias (namespace)", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
            ignoreCase: false,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "people/my name" }],
            settings,
        })
        const result = replaceLinks({
            body: "My name is here",
            linkResolverContext: { filePath: "test", trie, candidateMap },
            settings: { ...settings, matchSentenceCase: true, proximityBasedLinking: true },
        })
        expect(result).toBe("[[people/my name|My name]] is here")
    })
})
