import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("ignore code", () => {
    it("inline code", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "example" }, { path: "code" }],
            settings,
        })
        const result = replaceLinks({
            body: "`code` example",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result).toBe("`code` [[example]]")
    })

    it("code block", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "example" }, { path: "typescript" }],
            settings,
        })
        const result = replaceLinks({
            body: "```typescript\nexample\n```",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result).toBe("```typescript\nexample\n```")
    })

    it("unclosed code block", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "example" }, { path: "typescript" }],
            settings,
        })
        const result = replaceLinks({
            body: "```typescript\nexample",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result).toBe("```typescript\nexample")
    })

    it("unclosed code block when headings are ignored", () => {
        const settings = {
            scoped: false,
            baseDir: undefined,
            ignoreHeadings: true,
        }
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "example" }, { path: "typescript" }],
            settings,
        })
        const result = replaceLinks({
            body: "```typescript\nexample",
            linkResolverContext: {
                filePath: "journals/2022-01-01",
                trie,
                candidateMap,
            },
            settings,
        })
        expect(result).toBe("```typescript\nexample")
    })
})
