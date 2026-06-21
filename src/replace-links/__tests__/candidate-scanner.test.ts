import { describe, expect, it } from "vitest"
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

    it("filters scoped candidates outside the current namespace", () => {
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
