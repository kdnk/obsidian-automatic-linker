import { describe, expect, it } from "vitest"
import { buildCandidateTrie } from "../../trie"
import { replaceLinks } from "../replace-links"

describe("canonical link targets", () => {
    it("does not invent a root target when an alias equals the short path", () => {
        const { candidateMap } = buildCandidateTrie([
            { path: "pages/Topic", aliases: ["Topic"], scoped: false },
        ], "pages")

        expect(candidateMap.get("Topic")?.candidates.map(candidate => candidate.canonical))
            .toEqual(["pages/Topic"])
    })

    it.each([
        { path: "pages/Topic", body: "Topic", aliases: [], expected: "[[Topic]]" },
        { path: "pages/Topic", body: "topic", aliases: [], expected: "[[topic]]" },
        { path: "pages/Topic", body: "subject", aliases: ["subject"], expected: "[[Topic|subject]]" },
        { path: "pages/Topic", body: "Topic", aliases: ["Topic"], expected: "[[Topic]]" },
    ])("keeps default wikilinks unchanged for $body ($aliases)", ({ path, body, aliases, expected }) => {
        const index = buildCandidateTrie([{ path, aliases, scoped: false }], "pages", true)

        expect(replaceLinks({
            body,
            linkResolverContext: { ...index, filePath: "current-file.md" },
            settings: { baseDir: "pages", ignoreCase: true },
        })).toBe(expected)
    })
})
