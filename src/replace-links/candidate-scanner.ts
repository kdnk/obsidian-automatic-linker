import { CandidateData, getTopLevelDirectoryName, TrieNode } from "../trie"
import { RAW_URL_AT_START_PATTERN, RAW_URL_SOURCE } from "../markdown-protection"
import { isMarkdownTableLine, segmentMarkdown } from "../markdown-segments"
import type { ReplaceLinksSettings } from "./replace-links"

export type CandidateOccurrenceKind = "unlinked" | "existing-wikilink"

export interface CandidateOccurrence {
    kind: CandidateOccurrenceKind
    start: number
    end: number
    text: string
    candidateKey: string
    candidateData: CandidateData
    replacementCandidateData?: CandidateData
    isInTable: boolean
}

export type UnlinkedCandidateScanResult
    = | { action: "match", occurrence: CandidateOccurrence }
        | { action: "skip", end: number }
        | null

export interface ScanCandidateOccurrencesOptions {
    text: string
    filePath: string
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
    settings?: ReplaceLinksSettings
}

export const REGEX_PATTERNS = {
    PROTECTED: new RegExp(
        `(\`\`\`[\\s\\S]*?\`\`\`|\`[^\`]*\`|\\[\\[([^\\]]+)\\]\\]|\\[[^\\]]+\\]\\([^)]+\\)|\\[[^\\]]+\\]|${RAW_URL_SOURCE})`,
        "g",
    ),
    DATE_FORMAT: /^\d{4}-\d{2}-\d{2}$/,
    MONTH_NOTE: /^[0-9]{1,2}$/,
    CJK: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
    CJK_CANDIDATE: /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s\d]+$/u,
    KOREAN: /^[\p{Script=Hangul}]+$/u,
    JAPANESE: /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\s\d]+$/u,
    URL: RAW_URL_AT_START_PATTERN,
    PROTECTED_LINK: /^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/,
    KOREAN_SUFFIX: /^(이다\.?)/,
    KOREAN_PARTICLES: /^(는|은)/,
    KOREAN_PARTICLES_EXTENDED: /^(가|는|을|에|서|와|로부터|까지|보다|로|의|나|도|또한)/,
    WORD_BOUNDARY: /[\p{L}\p{N}_/-]/u,
    WHITESPACE: /[\t\n\r ]/,
} as const

export const isWordBoundary = (char: string | undefined): boolean => {
    if (char === undefined) return true
    if (REGEX_PATTERNS.CJK.test(char)) return true
    return (!REGEX_PATTERNS.WORD_BOUNDARY.test(char) || REGEX_PATTERNS.WHITESPACE.test(char))
}

export const isMonthNote = (candidate: string): boolean =>
    REGEX_PATTERNS.MONTH_NOTE.test(candidate)
    && parseInt(candidate, 10) >= 1
    && parseInt(candidate, 10) <= 12

export const isProtectedLink = (body: string): boolean => REGEX_PATTERNS.PROTECTED_LINK.test(body)

export const isCjkText = (text: string): boolean => REGEX_PATTERNS.CJK.test(text)

export const isCjkCandidate = (candidate: string): boolean => REGEX_PATTERNS.CJK_CANDIDATE.test(candidate)

export const isKoreanText = (text: string): boolean => REGEX_PATTERNS.KOREAN.test(text)

export const isSentenceStart = (text: string, index: number): boolean => {
    if (index === 0) return true
    if (text[index - 1] === "\n") return true
    if (index >= 3 && text[index - 1] === " " && text[index - 2] === ".") {
        const charBeforePeriod = text[index - 3]
        if (/[a-zA-Z]/.test(charBeforePeriod)) {
            return true
        }
    }
    return false
}

const fallbackIndexCache = new WeakMap<
    Map<string, CandidateData>,
    Map<string, Map<string, Array<[string, CandidateData]>>>
>()

export const buildFallbackIndex = (
    candidateMap: Map<string, CandidateData>,
    ignoreCase?: boolean,
): Map<string, Array<[string, CandidateData]>> => {
    let cacheForMap = fallbackIndexCache.get(candidateMap)
    if (!cacheForMap) {
        cacheForMap = new Map()
        fallbackIndexCache.set(candidateMap, cacheForMap)
    }

    const cacheKey = ignoreCase ? "ignoreCase" : "normal"
    const cached = cacheForMap.get(cacheKey)
    if (cached) return cached

    const fallbackIndex = new Map<string, Array<[string, CandidateData]>>()

    for (const [key, data] of candidateMap.entries()) {
        const slashIndex = key.lastIndexOf("/")
        if (slashIndex === -1) continue

        const shorthand = key.slice(slashIndex + 1)
        const indexKey = ignoreCase ? shorthand.toLowerCase() : shorthand

        let arr = fallbackIndex.get(indexKey)
        if (!arr) {
            arr = []
            fallbackIndex.set(indexKey, arr)
        }
        arr.push([key, data])
    }

    cacheForMap.set(cacheKey, fallbackIndex)
    return fallbackIndex
}

export const getCurrentNamespace = (filePath: string, baseDir?: string): string => {
    if (baseDir) {
        return getTopLevelDirectoryName(filePath, baseDir)
    }

    const segments = filePath.split("/")
    return segments[0] || ""
}

export const normalizeCanonicalPath = (linkPath: string, baseDir?: string): string => {
    if (baseDir && linkPath.startsWith(baseDir + "/")) {
        return linkPath.slice((baseDir + "/").length)
    }
    return linkPath
}

export const extractLinkParts = (
    canonicalPath: string,
): { linkPath: string, alias: string, hasAlias: boolean } => {
    const pipeIndex = canonicalPath.indexOf("|")
    const hasAlias = pipeIndex !== -1

    if (hasAlias) {
        const linkPath = canonicalPath.slice(0, pipeIndex)
        const alias = canonicalPath.slice(pipeIndex + 1)
        return { linkPath, alias, hasAlias }
    }

    return { linkPath: canonicalPath, alias: "", hasAlias }
}

export const escapeRegExp = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const findFencedCodeBlockRanges = (
    body: string,
): Array<{ start: number, end: number }> => {
    if (!body.includes("```") && !body.includes("~~~")) {
        return []
    }

    const ranges: Array<{ start: number, end: number }> = []
    const openingFencePattern = /^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gm
    let openingMatch: RegExpExecArray | null

    while ((openingMatch = openingFencePattern.exec(body)) !== null) {
        const openingFence = openingMatch[1]
        const fenceChar = openingFence[0]
        const fenceLength = openingFence.length
        const closingFencePattern = new RegExp(
            `^ {0,3}${escapeRegExp(fenceChar)}{${fenceLength},}[ \\t]*(?:\\r?\\n|$)`,
            "gm",
        )
        closingFencePattern.lastIndex = openingMatch.index + openingMatch[0].length
        const closingMatch = closingFencePattern.exec(body)
        const end = closingMatch
            ? closingMatch.index + closingMatch[0].length
            : body.length

        ranges.push({
            start: openingMatch.index,
            end,
        })
        openingFencePattern.lastIndex = end
    }

    return ranges
}

export const extractFencedCodeBlocks = (
    body: string,
): { body: string, codeBlocks: Array<{ placeholder: string, content: string }> } => {
    if (!body.includes("```") && !body.includes("~~~")) {
        return { body, codeBlocks: [] }
    }

    const ranges = findFencedCodeBlockRanges(body)
    const codeBlocks: Array<{ placeholder: string, content: string }> = []
    let result = ""
    let cursor = 0
    for (const [codeBlockIndex, range] of ranges.entries()) {
        const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`
        codeBlocks.push({
            placeholder,
            content: body.slice(range.start, range.end),
        })
        result += body.slice(cursor, range.start) + placeholder
        cursor = range.end
    }

    result += body.slice(cursor)
    return { body: result, codeBlocks }
}

export const isSelfLink = (
    candidateData: CandidateData,
    currentFilePath: string,
    settings: ReplaceLinksSettings = {},
): boolean => {
    if (!settings.preventSelfLinking || candidateData.candidates.length === 0) {
        return false
    }

    const { linkPath } = extractLinkParts(candidateData.candidates[0].canonical)
    const normalizedLinkPath = normalizeCanonicalPath(
        linkPath,
        settings.baseDir,
    )
    const normalizedCurrentPath = normalizeCanonicalPath(
        currentFilePath,
        settings.baseDir,
    )

    return normalizedLinkPath === normalizedCurrentPath
}

export const shouldSkipCandidate = (
    candidate: string,
    settings: ReplaceLinksSettings,
): boolean => {
    if (
        settings.ignoreDateFormats
        && REGEX_PATTERNS.DATE_FORMAT.test(candidate)
    ) {
        return true
    }
    return isMonthNote(candidate)
}

export const isIndexInsideMarkdownTable = (text: string, index: number): boolean => {
    let lineStart = text.lastIndexOf("\n", index - 1) + 1
    if (lineStart === 0 && text[0] !== "\n") {
        lineStart = 0
    }

    let lineEnd = text.indexOf("\n", index)
    if (lineEnd === -1) {
        lineEnd = text.length
    }

    const line = text.slice(lineStart, lineEnd)
    return isMarkdownTableLine(line)
}

export const findBestCandidateInSameNamespace = (
    filteredCandidates: Array<[string, CandidateData]>,
    filePath: string,
    settings: ReplaceLinksSettings = {},
): [string, CandidateData] | null => {
    let bestCandidate: [string, CandidateData] | null = null
    let bestScore = -1

    const filePathDir = filePath.includes("/")
        ? filePath.slice(0, filePath.lastIndexOf("/"))
        : ""
    const filePathSegments = filePathDir ? filePathDir.split("/") : []

    for (const [key, data] of filteredCandidates) {
        const slashIndex = key.lastIndexOf("/")
        const candidateDir = key.slice(0, slashIndex)
        const candidateSegments = candidateDir.split("/")
        let score = 0

        for (
            let idx = 0;
            idx < Math.min(candidateSegments.length, filePathSegments.length);
            idx++
        ) {
            if (candidateSegments[idx] === filePathSegments[idx]) {
                score++
            }
            else {
                break
            }
        }

        if (score > bestScore) {
            bestScore = score
            bestCandidate = [key, data]
        }
        else if (score === bestScore && bestCandidate !== null) {
            if (filePathDir === "" && settings.baseDir) {
                const basePrefix = settings.baseDir + "/"
                const getRelativeDepth = (k: string): number => {
                    if (k.startsWith(basePrefix)) {
                        const relativeParts = k
                            .slice(basePrefix.length)
                            .split("/")
                        return relativeParts.length - 1
                    }
                    return Infinity
                }

                const candidateDepth = getRelativeDepth(key)
                const bestCandidateDepth = getRelativeDepth(bestCandidate[0])

                if (candidateDepth < bestCandidateDepth
                    || (candidateDepth === bestCandidateDepth && key.length < bestCandidate[0].length)) {
                    bestCandidate = [key, data]
                }
            }
            else {
                const currentBestDir = bestCandidate[0].slice(0, bestCandidate[0].lastIndexOf("/"))
                const currentBestSegments = currentBestDir.split("/")

                if (
                    candidateSegments.length < currentBestSegments.length
                    || (candidateSegments.length === currentBestSegments.length && key.length < bestCandidate[0].length)
                ) {
                    bestCandidate = [key, data]
                }
            }
        }
    }

    return bestCandidate
}

const dedupeCandidates = (candidates: CandidateData["candidates"]): CandidateData => {
    const unique = new Map(candidates.map(candidate => [candidate.canonical, candidate]))
    return {
        candidates: Array.from(unique.values()).sort((a, b) => {
            if (a.canonical.length !== b.canonical.length) {
                return a.canonical.length - b.canonical.length
            }
            return a.canonical.localeCompare(b.canonical)
        }),
    }
}

const collectExistingWikilinks = (
    text: string,
    segments: ReturnType<typeof segmentMarkdown>,
    candidateMap: Map<string, CandidateData>,
    occurrences: CandidateOccurrence[],
    settings: ReplaceLinksSettings,
): void => {
    const existingLinkRegex = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/

    for (const segment of segments) {
        if (segment.kind !== "protected" || segment.protectedKind !== "wikilink") {
            continue
        }

        const match = segment.text.match(existingLinkRegex)
        if (!match) {
            continue
        }

        const fullMatch = match[0]
        const path = match[1]
        const alias = match[2] || path
        const candidateKey = settings.ignoreCase ? alias.toLowerCase() : alias
        const candidateData = candidateMap.get(candidateKey) ?? candidateMap.get(alias)

        if (!candidateData) {
            continue
        }

        occurrences.push({
            kind: "existing-wikilink",
            start: segment.start,
            end: segment.end,
            text: fullMatch,
            candidateKey,
            candidateData: dedupeCandidates(candidateData.candidates),
            isInTable: isIndexInsideMarkdownTable(text, segment.start),
        })
    }
}

const collectFallbackOccurrence = ({
    text,
    startIndex,
    fallbackIndex,
    filePath,
    currentNamespace,
    settings,
}: {
    text: string
    startIndex: number
    fallbackIndex: Map<string, Array<[string, CandidateData]>>
    filePath: string
    currentNamespace: string
    settings: ReplaceLinksSettings
}): UnlinkedCandidateScanResult => {
    const prevChar = text[startIndex - 1]
    if (!isWordBoundary(prevChar)) {
        return null
    }

    let longestMatch: {
        word: string
        length: number
        key: string
        candidateList: Array<[string, CandidateData]>
    } | null = null

    const maxSearchLength = Math.min(text.length - startIndex, 100)

    let potentialMatch = ""
    let searchWord = ""

    for (let length = 1; length <= maxSearchLength; length++) {
        const endIndex = startIndex + length
        const currentChar = text[startIndex + length - 1]
        potentialMatch += currentChar

        if (settings.matchSentenceCase && !settings.ignoreCase && isSentenceStart(text, startIndex)) {
            if (length === 1) {
                searchWord = currentChar.toLowerCase()
            }
            else {
                searchWord += currentChar
            }
        }
        else {
            searchWord = settings.ignoreCase
                ? searchWord + currentChar.toLowerCase()
                : potentialMatch
        }

        const candidateList = fallbackIndex.get(searchWord)
        if (!candidateList) {
            continue
        }

        const nextChar = text[endIndex]
        if (!isWordBoundary(nextChar)) {
            continue
        }

        if (shouldSkipCandidate(potentialMatch, settings)) {
            continue
        }

        longestMatch = {
            word: potentialMatch,
            length,
            key: searchWord,
            candidateList,
        }
    }

    if (!longestMatch) return null

    const filteredCandidates = longestMatch.candidateList.filter(([, data]) => {
        if (data.candidates.length === 0 || !settings.proximityBasedLinking) {
            return true
        }
        const candidate = data.candidates[0]
        return !(candidate.scoped && candidate.namespace !== currentNamespace)
    })

    if (filteredCandidates.length === 0) {
        return null
    }

    const candidateData = dedupeCandidates(
        filteredCandidates.flatMap(([, data]) => data.candidates),
    )

    if (candidateData.candidates.length === 0) {
        return null
    }

    const bestCandidateResult = filteredCandidates.length > 1
        ? findBestCandidateInSameNamespace(filteredCandidates, filePath, settings)
        : filteredCandidates[0]
    if (!bestCandidateResult) {
        return null
    }

    if (isSelfLink(bestCandidateResult[1], filePath, settings)) {
        return {
            action: "skip",
            end: startIndex + longestMatch.length,
        }
    }

    return {
        action: "match",
        occurrence: {
            kind: "unlinked",
            start: startIndex,
            end: startIndex + longestMatch.length,
            text: longestMatch.word,
            candidateKey: longestMatch.key,
            candidateData,
            replacementCandidateData: bestCandidateResult[1],
            isInTable: isIndexInsideMarkdownTable(text, startIndex),
        },
    }
}

const shouldSkipKoreanTrieOccurrence = (
    text: string,
    startIndex: number,
    candidate: string,
): boolean => {
    if (!isKoreanText(candidate)) {
        return false
    }

    const remaining = text.slice(startIndex + candidate.length)
    return REGEX_PATTERNS.KOREAN_PARTICLES.test(remaining)
}

export const scanUnlinkedCandidateAt = ({
    text,
    startIndex,
    filePath,
    trie,
    candidateMap,
    fallbackIndex,
    currentNamespace,
    settings,
}: {
    text: string
    startIndex: number
    filePath: string
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
    fallbackIndex: Map<string, Array<[string, CandidateData]>>
    currentNamespace: string
    settings: ReplaceLinksSettings
}): UnlinkedCandidateScanResult => {
    if (
        (text[startIndex] === "h" && text.slice(startIndex, startIndex + 4) === "http")
        || (text[startIndex] === "l" && text.slice(startIndex, startIndex + 9) === "linear://")
    ) {
        const urlMatch = text.slice(startIndex).match(REGEX_PATTERNS.URL)
        if (urlMatch) {
            return {
                action: "skip",
                end: startIndex + urlMatch[0].length,
            }
        }
    }

    let node = trie
    let lastCandidate: { candidate: string, length: number } | null = null
    let j = startIndex
    let candidateBuilder = ""

    while (j < text.length) {
        const ch = text[j]
        let chLower = settings.ignoreCase ? ch.toLowerCase() : ch
        if (settings.matchSentenceCase && !settings.ignoreCase && j === startIndex && isSentenceStart(text, startIndex)) {
            chLower = ch.toLowerCase()
        }
        candidateBuilder += ch

        const child = node.children.get(chLower)
        if (!child) break

        node = child
        if (node.candidate) {
            const candidateIsCjk = isCjkCandidate(candidateBuilder)
            if (candidateIsCjk || isWordBoundary(text[j + 1])) {
                lastCandidate = {
                    candidate: node.candidate,
                    length: j - startIndex + 1,
                }
            }
        }
        j++
    }

    if (lastCandidate) {
        const candidate = candidateBuilder.slice(0, lastCandidate.length)

        if (shouldSkipCandidate(candidate, settings)) {
            return {
                action: "skip",
                end: startIndex + lastCandidate.length,
            }
        }

        const trieCandidateKey = lastCandidate.candidate
        const candidateData = candidateMap.get(trieCandidateKey)

        if (candidateData) {
            if (isSelfLink(candidateData, filePath, settings)) {
                return {
                    action: "skip",
                    end: startIndex + candidate.length,
                }
            }

            if (shouldSkipKoreanTrieOccurrence(text, startIndex, candidate)) {
                return {
                    action: "skip",
                    end: startIndex + 1,
                }
            }

            const candidateIsCjk = isCjkCandidate(candidate)
            if (!candidateIsCjk) {
                const left = startIndex > 0 ? text[startIndex - 1] : undefined
                const right = startIndex + candidate.length < text.length
                    ? text[startIndex + candidate.length]
                    : undefined

                if (!isWordBoundary(left) || !isWordBoundary(right)) {
                    return {
                        action: "skip",
                        end: startIndex + 1,
                    }
                }
            }

            if (
                settings.proximityBasedLinking
                && candidateData.candidates.length > 0
                && candidateData.candidates[0].scoped
                && candidateData.candidates[0].namespace !== currentNamespace
            ) {
                return {
                    action: "skip",
                    end: startIndex + candidate.length,
                }
            }

            return {
                action: "match",
                occurrence: {
                    kind: "unlinked",
                    start: startIndex,
                    end: startIndex + candidate.length,
                    text: candidate,
                    candidateKey: trieCandidateKey,
                    candidateData: dedupeCandidates(candidateData.candidates),
                    replacementCandidateData: candidateData,
                    isInTable: isIndexInsideMarkdownTable(text, startIndex),
                },
            }
        }
    }

    if (settings.proximityBasedLinking) {
        return collectFallbackOccurrence({
            text,
            startIndex,
            fallbackIndex,
            filePath,
            currentNamespace,
            settings,
        })
    }

    return null
}

const collectUnlinkedOccurrences = ({
    text,
    filePath,
    trie,
    candidateMap,
    fallbackIndex,
    currentNamespace,
    settings,
    occurrences,
}: {
    text: string
    filePath: string
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
    fallbackIndex: Map<string, Array<[string, CandidateData]>>
    currentNamespace: string
    settings: ReplaceLinksSettings
    occurrences: CandidateOccurrence[]
}): void => {
    let i = 0

    while (i < text.length) {
        const result = scanUnlinkedCandidateAt({
            text,
            startIndex: i,
            filePath,
            trie,
            candidateMap,
            fallbackIndex,
            currentNamespace,
            settings,
        })

        if (result?.action === "match") {
            occurrences.push(result.occurrence)
            i = result.occurrence.end
            continue
        }

        if (result?.action === "skip") {
            i = result.end
            continue
        }

        i++
    }
}

export const scanCandidateOccurrences = ({
    text,
    filePath,
    trie,
    candidateMap,
    settings = {},
}: ScanCandidateOccurrencesOptions): CandidateOccurrence[] => {
    const occurrences: CandidateOccurrence[] = []
    const normalizedText = text.normalize("NFC")
    const fallbackIndex = buildFallbackIndex(candidateMap, settings.ignoreCase)
    const currentNamespace = getCurrentNamespace(filePath, settings.baseDir)
    const markdownSegments = segmentMarkdown(normalizedText, {
        protectHeadings: settings.ignoreHeadings,
        protectCallouts: true,
        protectTableRows: settings.ignoreMarkdownTables,
        protectUrls: true,
    })

    collectExistingWikilinks(
        normalizedText,
        markdownSegments,
        candidateMap,
        occurrences,
        settings,
    )

    for (const segment of markdownSegments) {
        if (segment.kind !== "prose") {
            continue
        }

        const segmentOccurrences: CandidateOccurrence[] = []
        collectUnlinkedOccurrences({
            text: segment.text,
            filePath,
            trie,
            candidateMap,
            fallbackIndex,
            currentNamespace,
            settings,
            occurrences: segmentOccurrences,
        })

        for (const occurrence of segmentOccurrences) {
            occurrences.push({
                ...occurrence,
                start: occurrence.start + segment.start,
                end: occurrence.end + segment.start,
            })
        }
    }

    return occurrences.sort((a, b) => a.start - b.start)
}

export const getOccurrenceContext = (
    text: string,
    occurrence: CandidateOccurrence,
    maxContext: number,
): string => {
    const start = Math.max(0, occurrence.start - maxContext)
    const end = Math.min(text.length, occurrence.end + maxContext)
    return text.slice(start, end)
}
