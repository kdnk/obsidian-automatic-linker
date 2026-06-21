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
            new Map([["meeting", "work/meeting"]]),
        )

        const result = await resolveAmbiguities(text, candidateMap, trie, mockSettings)

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            mockSettings,
            expect.arrayContaining([
                expect.objectContaining({
                    word: "meeting",
                    candidates: ["work/meeting", "private/meeting"],
                }),
            ]),
        )
        expect(result.get("meeting")).toBe("work/meeting")
    })

    it("should identify ambiguous existing links for verification", async () => {
        const text = "Check the [[private/meeting|meeting]] notes."
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(
            new Map([["[[private/meeting|meeting]]", "work/meeting"]]),
        )

        const result = await resolveAmbiguities(text, candidateMap, trie, mockSettings)

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            mockSettings,
            expect.arrayContaining([
                expect.objectContaining({
                    word: "[[private/meeting|meeting]]",
                    candidates: ["work/meeting", "private/meeting"],
                }),
            ]),
        )
        expect(result.get("[[private/meeting|meeting]]")).toBe("work/meeting")
    })

    it("should not request AI for existing links inside inline code", async () => {
        const text = "Check the `[[private/meeting|meeting]]` notes."
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockClear()
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(new Map())

        const result = await resolveAmbiguities(text, candidateMap, trie, mockSettings)

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            mockSettings,
            [],
        )
        expect(result.size).toBe(0)
    })

    it("should skip fenced code blocks, callouts, and ignored headings", async () => {
        const text = `# meeting
> [!note]
> meeting

~~~ts
meeting
~~~

meeting`
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockClear()
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(
            new Map([["meeting", "work/meeting"]]),
        )

        await resolveAmbiguities(text, candidateMap, trie, {
            ...mockSettings,
            ignoreHeadings: true,
            proximityBasedLinking: true,
        })

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledTimes(1)
        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            expect.objectContaining({
                ignoreHeadings: true,
                proximityBasedLinking: true,
            }),
            [
                expect.objectContaining({
                    word: "meeting",
                    candidates: ["work/meeting", "private/meeting"],
                }),
            ],
        )
    })

    it("should not request AI for Korean particle forms that replacement skips", async () => {
        const koreanCandidateMap = new Map<string, CandidateData>([
            [
                "문서",
                {
                    candidates: [
                        { canonical: "work/문서", scoped: false, namespace: "work" },
                        { canonical: "private/문서", scoped: false, namespace: "private" },
                    ],
                },
            ],
        ])
        const koreanTrie: TrieNode = buildTrie(["문서"], true)
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockClear()
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(new Map())

        const result = await resolveAmbiguities(
            "문서는 문서은",
            koreanCandidateMap,
            koreanTrie,
            mockSettings,
        )

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            mockSettings,
            [],
        )
        expect(result.size).toBe(0)
    })

    it("should not request AI for self-link candidates when the file path matches", async () => {
        const selfLinkCandidateMap = new Map<string, CandidateData>([
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
        const selfLinkTrie: TrieNode = buildTrie(["meeting"], true)
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockClear()
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(new Map())

        const result = await resolveAmbiguities(
            "meeting",
            selfLinkCandidateMap,
            selfLinkTrie,
            {
                ...mockSettings,
                preventSelfLinking: true,
            },
            "work/meeting",
        )

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            expect.objectContaining({
                preventSelfLinking: true,
            }),
            [],
        )
        expect(result.size).toBe(0)
    })
})
