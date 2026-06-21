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

    it("uses baseDir when filtering scoped candidates for AI requests", async () => {
        const scopedCandidateMap = new Map<string, CandidateData>([
            [
                "internal",
                {
                    candidates: [
                        { canonical: "pages/team-a/internal", scoped: true, namespace: "team-a" },
                        { canonical: "pages/team-a/archive/internal", scoped: true, namespace: "team-a" },
                    ],
                },
            ],
        ])
        const scopedTrie: TrieNode = buildTrie(["internal"], true)
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockClear()
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(new Map())

        await resolveAmbiguities(
            "internal",
            scopedCandidateMap,
            scopedTrie,
            {
                ...mockSettings,
                proximityBasedLinking: true,
            },
            "pages/team-a/today",
            "pages",
        )

        const [settingsArg, requestsArg] = vi.mocked(aiClient.resolveAmbiguitiesBatch).mock.calls[0]
        expect(settingsArg).toEqual(expect.objectContaining({
            proximityBasedLinking: true,
        }))
        expect(settingsArg).not.toHaveProperty("baseDir")
        expect(requestsArg).toEqual([
            expect.objectContaining({
                word: "internal",
                candidates: [
                    "pages/team-a/internal",
                    "pages/team-a/archive/internal",
                ],
            }),
        ])
    })

    it("does not request AI for candidates inside raw Linear URLs", async () => {
        const linearCandidateMap = new Map<string, CandidateData>([
            [
                "linear",
                {
                    candidates: [
                        { canonical: "work/linear", scoped: false, namespace: "work" },
                        { canonical: "private/linear", scoped: false, namespace: "private" },
                    ],
                },
            ],
        ])
        const linearTrie: TrieNode = buildTrie(["linear"], true)
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockClear()
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(new Map())

        const result = await resolveAmbiguities(
            "Open linear://issue/TEAM-123",
            linearCandidateMap,
            linearTrie,
            mockSettings,
        )

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            mockSettings,
            [],
        )
        expect(result.size).toBe(0)
    })

    it("does not request AI for candidates inside ignored Markdown table rows", async () => {
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockClear()
        vi.mocked(aiClient.resolveAmbiguitiesBatch).mockResolvedValue(new Map())

        const result = await resolveAmbiguities(
            `| Topic |
| --- |
| meeting |`,
            candidateMap,
            trie,
            {
                ...mockSettings,
                ignoreMarkdownTables: true,
            },
        )

        expect(aiClient.resolveAmbiguitiesBatch).toHaveBeenCalledWith(
            expect.objectContaining({
                ignoreMarkdownTables: true,
            }),
            [],
        )
        expect(result.size).toBe(0)
    })
})
