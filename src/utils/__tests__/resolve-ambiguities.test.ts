import { describe, it, expect, vi } from "vitest"

vi.mock("obsidian", () => ({
    request: vi.fn(),
}))

import { resolveAmbiguities } from "../resolve-ambiguities"
import { CandidateData, TrieNode, buildTrie } from "../../trie"
import { AutomaticLinkerSettings, DEFAULT_SETTINGS } from "../../settings/settings-info"
import * as aiClient from "../ai-client"

vi.mock("../ai-client", () => ({
    callAI: vi.fn(),
    resolveAmbiguitiesBatch: vi.fn(),
}))

describe("resolveAmbiguities", () => {
    const mockSettings: AutomaticLinkerSettings = {
        ...DEFAULT_SETTINGS,
        aiMaxContext: 50,
    }

    const candidateMap = new Map<string, CandidateData>([
        [
            "meeting",
            {
                candidates: [
                    { canonical: "work/meeting", scoped: false, namespace: "work" },
                    { canonical: "private/meeting", scoped: false, namespace: "private" },
                ],
            },
        ],
    ])

    const trie: TrieNode = buildTrie(["meeting"], true)

    it("should identify ambiguous unlinked words", async () => {
        const text = "I have a meeting tomorrow."
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(
            new Map([["meeting", "work/meeting"]])
        )

        const result = await resolveAmbiguities(text, candidateMap, trie, mockSettings)

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            mockSettings,
            expect.arrayContaining([
                expect.objectContaining({
                    word: "meeting",
                    candidates: ["work/meeting", "private/meeting"],
                })
            ])
        )
        expect(result.get("meeting")).toBe("work/meeting")
    })

    it("should identify ambiguous existing links for verification", async () => {
        const text = "Check the [[private/meeting|meeting]] notes."
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(
            new Map([["[[private/meeting|meeting]]", "work/meeting"]])
        )

        const result = await resolveAmbiguities(text, candidateMap, trie, mockSettings)

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            mockSettings,
            expect.arrayContaining([
                expect.objectContaining({
                    word: "[[private/meeting|meeting]]",
                    candidates: ["work/meeting", "private/meeting"],
                })
            ])
        )
        expect(result.get("[[private/meeting|meeting]]")).toBe("work/meeting")
    })
})
