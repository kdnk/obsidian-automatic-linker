import { CandidateData, TrieNode } from "../trie"
import { AutomaticLinkerSettings } from "../settings/settings-info"
import { resolveAmbiguitiesBatch, AIResolveRequest } from "./ai-client"
import {
    getOccurrenceContext,
    scanCandidateOccurrences,
} from "../replace-links/candidate-scanner"

export const resolveAmbiguities = async (
    text: string,
    candidateMap: Map<string, CandidateData>,
    trie: TrieNode,
    settings: AutomaticLinkerSettings,
    filePath = "",
    baseDir?: string,
): Promise<Map<string, string>> => {
    const scannerSettings = baseDir === undefined
        ? settings
        : { ...settings, baseDir }
    const occurrences = scanCandidateOccurrences({
        text,
        filePath,
        trie,
        candidateMap,
        settings: scannerSettings,
    })

    const requests: AIResolveRequest[] = occurrences
        .filter(occurrence => occurrence.candidateData.candidates.length > 1)
        .map(occurrence => ({
            word: occurrence.text,
            text: getOccurrenceContext(text, occurrence, settings.aiMaxContext),
            candidates: occurrence.candidateData.candidates.map(c => c.canonical),
        }))

    const uniqueRequests = Array.from(new Map(requests.map(r => [r.word, r])).values())

    return await resolveAmbiguitiesBatch(settings, uniqueRequests)
}
