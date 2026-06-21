import { describe, expect, it } from "vitest"
import { buildTrie, CandidateData } from "../../trie"
import { buildCandidateTrieForTest } from "./test-helpers"
import {
    getOccurrenceContext,
    scanCandidateOccurrences,
} from "../candidate-scanner"

describe("scanCandidateOccurrences", () => {
    it("reports ambiguous prose candidates and skips inline code", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "work/meeting" },
                { path: "private/meeting" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "`meeting` meeting",
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: { ignoreCase: true, proximityBasedLinking: true },
        })

        expect(occurrences.map(o => ({
            kind: o.kind,
            text: o.text,
            start: o.start,
            end: o.end,
            candidates: o.candidateData.candidates.map(c => c.canonical),
        }))).toEqual([
            {
                kind: "unlinked",
                text: "meeting",
                start: 10,
                end: 17,
                candidates: ["work/meeting", "private/meeting"],
            },
        ])
    })

    it("reports existing wikilinks by their display alias", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "work/meeting" },
                { path: "private/meeting" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "Check [[private/meeting|meeting]] notes.",
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: { ignoreCase: true, proximityBasedLinking: true },
        })

        expect(occurrences.map(o => ({
            kind: o.kind,
            text: o.text,
            candidateKey: o.candidateKey,
            candidates: o.candidateData.candidates.map(c => c.canonical),
        }))).toEqual([
            {
                kind: "existing-wikilink",
                text: "[[private/meeting|meeting]]",
                candidateKey: "meeting",
                candidates: ["work/meeting", "private/meeting"],
            },
        ])
    })

    it("skips existing wikilinks inside inline code", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "work/meeting" },
                { path: "private/meeting" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "`[[private/meeting|meeting]]`",
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: { ignoreCase: true, proximityBasedLinking: true },
        })

        expect(occurrences).toEqual([])
    })

    it("preserves trie-hit candidate sets for scoped candidates in the current namespace", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "pages/team-a/internal" },
                { path: "pages/team-b/internal" },
            ],
            settings: {
                scoped: true,
                baseDir: "pages",
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "internal",
            filePath: "pages/team-a/today",
            trie,
            candidateMap,
            settings: {
                baseDir: "pages",
                ignoreCase: true,
                proximityBasedLinking: true,
            },
        })

        expect(occurrences).toHaveLength(1)
        expect(occurrences[0].candidateData.candidates.map(c => c.canonical)).toEqual([
            "pages/team-a/internal",
            "pages/team-b/internal",
        ])
    })

    it("matches replaceLinks trie-hit namespace semantics", () => {
        const candidateMap = new Map<string, CandidateData>([
            [
                "internal",
                {
                    candidates: [
                        {
                            canonical: "pages/team-b/internal",
                            scoped: true,
                            namespace: "team-b",
                        },
                        {
                            canonical: "pages/team-a/internal",
                            scoped: true,
                            namespace: "team-a",
                        },
                    ],
                },
            ],
        ])
        const trie = buildTrie(["internal"], true)

        const occurrences = scanCandidateOccurrences({
            text: "internal",
            filePath: "pages/team-a/today",
            trie,
            candidateMap,
            settings: {
                baseDir: "pages",
                ignoreCase: true,
                proximityBasedLinking: true,
            },
        })

        expect(occurrences).toEqual([])
    })

    it("skips fenced code blocks, callouts, and ignored headings", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "meeting" }],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: `# meeting
> [!note]
> meeting

~~~ts
meeting
~~~

meeting`,
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: {
                ignoreCase: true,
                ignoreHeadings: true,
                proximityBasedLinking: true,
            },
        })

        expect(occurrences.map(o => ({
            start: o.start,
            end: o.end,
            text: o.text,
        }))).toEqual([
            {
                start: 50,
                end: 57,
                text: "meeting",
            },
        ])
    })

    it("does not re-enter a later callout when inline code appears earlier", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "work/meeting" },
                { path: "private/meeting" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "`meeting`\n\n> [!note]\n> meeting\n\nmeeting",
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: {
                ignoreCase: true,
                proximityBasedLinking: true,
            },
        })

        expect(occurrences.map(o => ({
            start: o.start,
            end: o.end,
            text: o.text,
        }))).toEqual([
            {
                start: 32,
                end: 39,
                text: "meeting",
            },
        ])
    })

    it("skips Korean particle hits but still finds overlapping follow-on candidates", () => {
        const isolatedFixture = buildCandidateTrieForTest({
            files: [
                { path: "work/문서" },
                { path: "private/문서" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })
        const isolatedOccurrences = scanCandidateOccurrences({
            text: "문서는",
            filePath: "notes/today",
            trie: isolatedFixture.trie,
            candidateMap: isolatedFixture.candidateMap,
            settings: { ignoreCase: true, proximityBasedLinking: true },
        })

        expect(isolatedOccurrences).toEqual([])

        const overlappingFixture = buildCandidateTrieForTest({
            files: [
                { path: "work/문서" },
                { path: "private/문서" },
                { path: "work/서는" },
                { path: "private/서는" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })
        const { candidateMap, trie } = overlappingFixture

        const overlappingOccurrences = scanCandidateOccurrences({
            text: "문서는",
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: { ignoreCase: true, proximityBasedLinking: true },
        })

        expect(overlappingOccurrences.map(o => ({
            text: o.text,
            start: o.start,
            end: o.end,
        }))).toEqual([
            {
                text: "서는",
                start: 1,
                end: 3,
            },
        ])
    })
})

describe("getOccurrenceContext", () => {
    it("returns bounded surrounding text for AI requests", () => {
        const occurrence = {
            kind: "unlinked" as const,
            start: 10,
            end: 17,
            text: "meeting",
            candidateKey: "meeting",
            candidateData: { candidates: [] },
            isInTable: false,
        }

        expect(getOccurrenceContext("before -- meeting -- after", occurrence, 4)).toBe(
            " -- meeting -- ",
        )
    })
})
