import { CandidateData, TrieNode } from "../trie"
import { AutomaticLinkerSettings } from "../settings/settings-info"
import { resolveAmbiguitiesBatch, AIResolveRequest } from "./ai-client"

// A simplified scanner to find candidates that have multiple options or existing links to verify.
export const resolveAmbiguities = async (
    text: string,
    candidateMap: Map<string, CandidateData>,
    trie: TrieNode,
    settings: AutomaticLinkerSettings,
): Promise<Map<string, string>> => {
    const requests: AIResolveRequest[] = []
    
    // 1. Scan for existing links [[Path|Alias]] or [[Path]]
    const existingLinkRegex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g
    let match: RegExpExecArray | null
    while ((match = existingLinkRegex.exec(text)) !== null) {
        const fullMatch = match[0]
        const path = match[1]
        const alias = match[2] || path
        
        const candidateData = candidateMap.get(alias)
        if (candidateData && candidateData.candidates.length > 1) {
            const start = Math.max(0, match.index - settings.aiMaxContext)
            const end = Math.min(text.length, match.index + fullMatch.length + settings.aiMaxContext)
            
            requests.push({
                word: fullMatch, // Using the full link as the "word" key for replacement
                text: text.slice(start, end),
                candidates: candidateData.candidates.map(c => c.canonical),
            })
        }
    }

    // 2. Scan for unlinked words with multiple candidates using the Trie
    // (This is a simplified version of the trie traversal logic)
    let i = 0
    while (i < text.length) {
        let node = trie
        let j = i
        let lastMatch: { word: string; data: CandidateData; index: number } | null = null

        while (j < text.length && node.children.has(text[j].toLowerCase())) {
            node = node.children.get(text[j].toLowerCase())!
            if (node.candidate) {
                const data = candidateMap.get(node.candidate)
                if (data) {
                    lastMatch = { word: node.candidate, data, index: i }
                }
            }
            j++
        }

        if (lastMatch && lastMatch.data.candidates.length > 1) {
            // Check if it's already inside a link (simple check)
            const isInsideLink = text.slice(Math.max(0, i - 2), i) === "[[" || 
                                 text.slice(i + lastMatch.word.length, i + lastMatch.word.length + 2) === "]]"
            
            if (!isInsideLink) {
                const start = Math.max(0, i - settings.aiMaxContext)
                const end = Math.min(text.length, i + lastMatch.word.length + settings.aiMaxContext)
                
                requests.push({
                    word: lastMatch.word,
                    text: text.slice(start, end),
                    candidates: lastMatch.data.candidates.map(c => c.canonical),
                })
            }
            i += lastMatch.word.length
        } else {
            i++
        }
    }

    // Deduplicate requests by word to avoid redundant AI calls
    const uniqueRequests = Array.from(new Map(requests.map(r => [r.word, r])).values())

    return await resolveAmbiguitiesBatch(settings, uniqueRequests)
}
