import { CandidateData, TrieNode } from "../trie"
import {
    buildFallbackIndex,
    extractFencedCodeBlocks,
    extractLinkParts,
    findBestCandidateInSameNamespace,
    getCurrentNamespace,
    isCjkCandidate,
    isCjkText,
    isIndexInsideMarkdownTable,
    isKoreanText,
    isMarkdownTableLine,
    isMonthNote,
    isProtectedLink,
    isSelfLink,
    isSentenceStart,
    isWordBoundary,
    normalizeCanonicalPath,
    REGEX_PATTERNS,
    shouldSkipCandidate,
} from "./candidate-scanner"

// Types for the replaceLinks function
export interface LinkResolverContext {
    filePath: string
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
}

export interface ReplaceLinksSettings {
    proximityBasedLinking?: boolean
    baseDir?: string
    ignoreDateFormats?: boolean
    ignoreCase?: boolean
    matchSentenceCase?: boolean
    preventSelfLinking?: boolean
    removeAliasInDirs?: string[]
    ignoreHeadings?: boolean
    ignoreMarkdownTables?: boolean
}

export interface LinkGeneratorParams {
    linkPath: string
    sourcePath: string
    alias?: string
    isInTable?: boolean
}

export type LinkGenerator = (params: LinkGeneratorParams) => string

export interface ReplaceLinksOptions {
    body: string
    linkResolverContext: LinkResolverContext
    settings?: ReplaceLinksSettings
    linkGenerator?: LinkGenerator
    resolvedAmbiguities?: Map<string, string>
}

// Helper function to check if a path should have its alias removed
const shouldRemoveAlias = (
    normalizedPath: string,
    removeAliasInDirs?: string[],
): boolean => {
    if (!removeAliasInDirs || removeAliasInDirs.length === 0) {
        return false
    }

    // Early return for paths without slashes
    if (!normalizedPath.includes("/")) {
        return false
    }

    // Check if the normalized path starts with any of the specified directories
    for (const dir of removeAliasInDirs) {
        if (normalizedPath === dir || normalizedPath.startsWith(dir + "/")) {
            return true
        }
    }

    return false
}

// Link Content Creation
const createLinkContent = (
    candidateData: CandidateData,
    originalMatchedText: string,
    settings: ReplaceLinksSettings = {},
): { linkPath: string, alias?: string } => {
    if (candidateData.candidates.length === 0) {
        return { linkPath: originalMatchedText }
    }
    const { linkPath, alias, hasAlias } = extractLinkParts(
        candidateData.candidates[0].canonical,
    )
    const normalizedPath = normalizeCanonicalPath(linkPath, settings.baseDir)

    // Check if alias should be removed for this directory
    const removeAlias = shouldRemoveAlias(
        normalizedPath,
        settings.removeAliasInDirs,
    )

    if (hasAlias) {
        // If alias removal is enabled for this directory, return path without alias
        if (removeAlias) {
            return { linkPath: normalizedPath }
        }
        // Use originalMatchedText to preserve case when ignoreCase or matchSentenceCase is enabled
        const displayAlias = (settings.ignoreCase || settings.matchSentenceCase) ? originalMatchedText : alias
        return { linkPath: normalizedPath, alias: displayAlias }
    }

    if (normalizedPath.includes("/")) {
        // If alias removal is enabled for this directory, return path without alias
        if (removeAlias) {
            return { linkPath: normalizedPath }
        }

        // For paths with slashes, use the last segment as the display text
        const lastSegment = normalizedPath.split("/").pop() || originalMatchedText

        // If ignoreCase is enabled and originalMatchedText contains a slash,
        // use the last segment of originalMatchedText to preserve case
        let displayText = lastSegment
        if ((settings.ignoreCase || settings.matchSentenceCase) && originalMatchedText.includes("/")) {
            const originalLastSegment = originalMatchedText.split("/").pop()
            if (originalLastSegment) {
                displayText = originalLastSegment
            }
        }
        else if (settings.ignoreCase || settings.matchSentenceCase) {
            // If originalMatchedText doesn't contain a slash, use it as-is
            displayText = originalMatchedText
        }

        return { linkPath: normalizedPath, alias: displayText }
    }

    // No explicit alias, no '/' in normalizedPath
    if (settings.ignoreCase) {
        if (
            originalMatchedText.toLowerCase() === normalizedPath.toLowerCase()
        ) {
            return { linkPath: originalMatchedText }
        }
        else {
            return { linkPath: normalizedPath, alias: originalMatchedText }
        }
    }
    else {
        if (originalMatchedText !== normalizedPath) {
            return { linkPath: normalizedPath, alias: originalMatchedText }
        }
        else {
            return { linkPath: normalizedPath }
        }
    }
}

// Default link generator that creates standard Obsidian wikilinks
export const escapeLinkForMarkdownTable = (
    link: string,
    isInTable = false,
): string => {
    if (isInTable && link.includes("|")) {
        return link.replace(/\|/g, "\\|")
    }

    return link
}

export const defaultLinkGenerator: LinkGenerator = ({
    linkPath,
    alias,
    isInTable = false,
}: LinkGeneratorParams): string => {
    let linkContent = linkPath

    if (alias) {
        linkContent = `${linkPath}|${alias}`
    }

    return escapeLinkForMarkdownTable(`[[${linkContent}]]`, isInTable)
}

// Processing functions for different text types
const processCjkText = (
    text: string,
    trie: TrieNode,
    candidateMap: Map<string, CandidateData>,
    currentNamespace: string,
    filePath: string,
    linkGenerator: LinkGenerator,
    settings: ReplaceLinksSettings = {},
    resolvedAmbiguities?: Map<string, string>,
): string => {
    // For CJK texts that might contain non-CJK terms like "taro-san", ensure we use a consistent approach
    // Pass the proper filePath to maintain correct namespace resolution
    return processStandardText(
        text,
        trie,
        candidateMap,
        buildFallbackIndex(candidateMap, settings.ignoreCase),
        filePath,
        currentNamespace,
        linkGenerator,
        settings,
        resolvedAmbiguities,
    )
}

// Fallback Search Processing
const processFallbackSearch = (
    text: string,
    startIndex: number,
    fallbackIndex: Map<string, Array<[string, CandidateData]>>,
    filePath: string,
    currentNamespace: string,
    linkGenerator: LinkGenerator,
    settings: ReplaceLinksSettings,
): { result: string, newIndex: number } | null => {
    // Early boundary check - if start isn't a word boundary, skip
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

    // Iterate through potential multi-word sequences starting from startIndex
    const maxSearchLength = Math.min(text.length - startIndex, 100) // Limit search length for performance

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
                searchWord = searchWord + currentChar
            }
        }
        else {
            searchWord = settings.ignoreCase
                ? searchWord + currentChar.toLowerCase()
                : potentialMatch
        }

        // Check if this potential match exists in fallback index
        const candidateList = fallbackIndex.get(searchWord)
        if (!candidateList) {
            continue
        }

        // Basic boundary check: next char should be a boundary if not end of text
        const nextChar = text[endIndex]
        if (!isWordBoundary(nextChar)) {
            continue // This isn't a valid match end
        }

        // Skip date formats and month notes
        if (shouldSkipCandidate(potentialMatch, settings)) {
            continue // Try longer match
        }

        // Found a valid candidate
        longestMatch = {
            word: potentialMatch,
            length: length,
            key: searchWord,
            candidateList: candidateList,
        }
        // Continue checking for even longer matches
    }

    // Process the longest valid match found
    if (!longestMatch) return null

    // Filter candidates based on namespace restrictions
    const filteredCandidates = longestMatch.candidateList.filter(
        ([, data]) => {
            if (data.candidates.length === 0) return true
            const candidate = data.candidates[0]
            return !(candidate.scoped && candidate.namespace !== currentNamespace)
        },
    )

    let bestCandidateData: CandidateData | null = null

    if (filteredCandidates.length === 1) {
        bestCandidateData = filteredCandidates[0][1]
    }
    else if (filteredCandidates.length > 1) {
        const bestCandidateResult = findBestCandidateInSameNamespace(
            filteredCandidates,
            filePath,
            settings,
        )
        if (bestCandidateResult) {
            bestCandidateData = bestCandidateResult[1]
        }
    }

    if (!bestCandidateData) return null

    // Check if this is a self-link and should be prevented
    if (isSelfLink(bestCandidateData, filePath, settings)) {
        return {
            result: longestMatch.word,
            newIndex: startIndex + longestMatch.length,
        }
    }

    // Create the link
    const { linkPath, alias } = createLinkContent(
        bestCandidateData,
        longestMatch.word,
        settings,
    )
    const isInTable = isIndexInsideMarkdownTable(text, startIndex)
    const finalLink = linkGenerator({
        linkPath,
        sourcePath: filePath,
        alias,
        isInTable,
    })

    return {
        result: finalLink,
        newIndex: startIndex + longestMatch.length,
    }
}

// Korean Language Processing
const handleKoreanSpecialCases = (
    text: string,
    i: number,
    candidate: string,
    candidateData: CandidateData,
    filePath: string,
    linkGenerator: LinkGenerator,
    settings: ReplaceLinksSettings = {},
): { result: string, newIndex: number } | null => {
    const remaining = text.slice(i + candidate.length)

    // Special handling when followed by "이다"
    const suffixMatch = remaining.match(REGEX_PATTERNS.KOREAN_SUFFIX)
    if (suffixMatch) {
        // Check if this is a self-link and should be prevented
        if (isSelfLink(candidateData, filePath, settings)) {
            return {
                result: candidate + suffixMatch[0],
                newIndex: i + candidate.length + suffixMatch[0].length,
            }
        }

        const { linkPath, alias } = createLinkContent(
            candidateData,
            candidate,
            settings,
        )
        const finalLink = linkGenerator({
            linkPath,
            sourcePath: filePath,
            alias,
            isInTable: false,
        })

        return {
            result: finalLink + suffixMatch[0],
            newIndex: i + candidate.length + suffixMatch[0].length,
        }
    }

    // Special handling when followed by particles like "는" or "은"
    if (remaining.match(REGEX_PATTERNS.KOREAN_PARTICLES)) {
        return {
            result: text[i],
            newIndex: i + 1,
        }
    }

    return null
}

const processStandardText = (
    text: string,
    trie: TrieNode,
    candidateMap: Map<string, CandidateData>,
    fallbackIndex: Map<string, Array<[string, CandidateData]>>,
    filePath: string,
    currentNamespace: string,
    linkGenerator: LinkGenerator,
    settings: ReplaceLinksSettings = {},
    resolvedAmbiguities?: Map<string, string>,
): string => {
    let result = ""
    let i = 0

    outer: while (i < text.length) {
        // Check for URLs first - only if current character could start a URL
        if (text[i] === "h" && text.slice(i, i + 4) === "http") {
            const urlMatch = text.slice(i).match(REGEX_PATTERNS.URL)
            if (urlMatch) {
                result += urlMatch[0]
                i += urlMatch[0].length
                continue
            }
        }

        // Try to find a candidate using the trie
        let node = trie
        let lastCandidate: { candidate: string, length: number } | null = null
        let j = i
        let candidateBuilder = ""

        while (j < text.length) {
            const ch = text[j]
            let chLower = settings.ignoreCase ? ch.toLowerCase() : ch
            // At sentence start, lowercase only the first character to allow matching
            if (settings.matchSentenceCase && !settings.ignoreCase && j === i && isSentenceStart(text, i)) {
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
                        length: j - i + 1,
                    }
                }
            }
            j++
        }

        if (lastCandidate) {
            const candidate = candidateBuilder.slice(0, lastCandidate.length)

            // Skip if it's a date format
            if (
                settings.ignoreDateFormats
                && REGEX_PATTERNS.DATE_FORMAT.test(candidate)
            ) {
                result += candidate
                i += lastCandidate.length
                continue outer
            }

            // Skip month notes
            if (isMonthNote(candidate)) {
                result += candidate
                i += lastCandidate.length
                continue
            }

            // Use the candidate found in the trie (lastCandidate.candidate) to look up in candidateMap
            const trieCandidateKey = lastCandidate.candidate

            // candidateMap lookup should always use the exact key from the trie result.
            // Case comparison happened during trie traversal if ignoreCase is true.
            const candidateData = candidateMap.get(trieCandidateKey)

            if (candidateData) {
                // Check if this is a self-link and should be prevented
                if (isSelfLink(candidateData, filePath, settings)) {
                    result += candidate
                    i += candidate.length
                    continue outer
                }

                // Handle Korean special cases
                const isKorean = isKoreanText(candidate)
                if (isKorean) {
                    const koreanResult = handleKoreanSpecialCases(
                        text,
                        i,
                        candidate,
                        candidateData,
                        filePath,
                        linkGenerator,
                        settings,
                    )
                    if (koreanResult) {
                        result += koreanResult.result
                        i = koreanResult.newIndex
                        continue outer
                    }
                }

                // Word boundary check for non-CJK text
                const candidateIsCjk = isCjkCandidate(candidate)
                if (!candidateIsCjk) {
                    const left = i > 0 ? text[i - 1] : undefined
                    const right = i + candidate.length < text.length
                        ? text[i + candidate.length]
                        : undefined

                    if (!isWordBoundary(left) || !isWordBoundary(right)) {
                        result += text[i]
                        i++
                        continue outer
                    }
                }

                // Check for Korean particles (extended)
                const isKoreanCandidate = isKoreanText(candidate)
                if (isKoreanCandidate) {
                    const right = i + candidate.length < text.length
                        ? text.slice(
                                i + candidate.length,
                                i + candidate.length + 10,
                            )
                        : ""

                    // Check for Korean particles (no action needed, just a check point)
                    if (right.match(REGEX_PATTERNS.KOREAN_PARTICLES_EXTENDED)) {
                        // Skip word boundary check for Korean particles
                    }
                }

                // Skip if namespace restriction applies
                if (
                    settings.proximityBasedLinking
                    && candidateData.candidates.length > 0
                    && candidateData.candidates[0].scoped
                    && candidateData.candidates[0].namespace !== currentNamespace
                ) {
                    result += candidate
                    i += candidate.length
                    continue outer
                }

                // Create the link
                let linkPath = ""
                let alias: string | undefined

                if (resolvedAmbiguities?.has(candidate)) {
                    const resolvedPath = resolvedAmbiguities.get(candidate)!
                    const parts = extractLinkParts(resolvedPath)
                    linkPath = parts.linkPath
                    alias = parts.alias || candidate
                }
                else {
                    const content = createLinkContent(
                        candidateData,
                        candidate,
                        settings,
                    )
                    linkPath = content.linkPath
                    alias = content.alias
                }

                const isInTable = isIndexInsideMarkdownTable(text, i)
                const finalLink = linkGenerator({
                    linkPath,
                    sourcePath: filePath,
                    alias,
                    isInTable,
                })
                result += finalLink

                i += candidate.length
                continue outer
            }
        }

        // Fallback: multi-word lookup using fallback index
        if (settings.proximityBasedLinking) {
            const fallbackResult = processFallbackSearch(
                text,
                i,
                fallbackIndex,
                filePath,
                currentNamespace,
                linkGenerator,
                settings,
            )
            if (fallbackResult) {
                result += fallbackResult.result
                i = fallbackResult.newIndex
                continue outer
            }
        }

        // If no rule applies, output the current character
        result += text[i]
        i++
    }

    return result
}

// Main function
export const replaceLinks = ({
    body,
    linkResolverContext: { filePath, trie, candidateMap },
    settings = {
        proximityBasedLinking: true,
        baseDir: undefined,
        ignoreDateFormats: true,
    },
    linkGenerator = defaultLinkGenerator,
    resolvedAmbiguities,
}: ReplaceLinksOptions): string => {
    // Normalize the body text to NFC
    body = body.normalize("NFC")

    // If the body consists solely of a protected link, return it unchanged
    if (isProtectedLink(body)) {
        return body
    }

    // Build the fallback index
    const fallbackIndex = buildFallbackIndex(candidateMap, settings.ignoreCase)

    // Get the current namespace
    const currentNamespace = getCurrentNamespace(filePath, settings.baseDir)

    // Process segments of text
    const processTextSegment = (text: string): string => {
        // Check if the text contains CJK characters
        const hasCjkText = isCjkText(text)

        if (hasCjkText) {
            return processCjkText(
                text,
                trie,
                candidateMap,
                currentNamespace,
                filePath,
                linkGenerator,
                settings,
                resolvedAmbiguities,
            )
        }
        else {
            return processStandardText(
                text,
                trie,
                candidateMap,
                fallbackIndex,
                filePath,
                currentNamespace,
                linkGenerator,
                settings,
                resolvedAmbiguities,
            )
        }
    }

    const processTableAwareTextSegment = (text: string): string => {
        if (!settings.ignoreMarkdownTables) {
            return processTextSegment(text)
        }

        return text.replace(/[^\n]*(?:\n|$)/g, (line) => {
            if (line === "") {
                return line
            }

            const lineContent = line.endsWith("\n")
                ? line.slice(0, -1)
                : line

            if (isMarkdownTableLine(lineContent)) {
                return line
            }

            return processTextSegment(line)
        })
    }

    // Extract and protect fenced code blocks before any other block-level rules.
    const { body: bodyAfterCodeBlocks, codeBlocks } = extractFencedCodeBlocks(body)

    // Extract and protect headings first
    const headingPattern = /^#{1,6}\s+.*$/gm
    const headings: Array<{ placeholder: string, content: string }> = []
    let headingIndex = 0

    let bodyAfterHeadings = bodyAfterCodeBlocks
    if (settings.ignoreHeadings) {
        bodyAfterHeadings = bodyAfterCodeBlocks.replace(headingPattern, (match) => {
            const placeholder = `__HEADING_${headingIndex}__`
            headings.push({ placeholder, content: match })
            headingIndex++
            return placeholder
        })
    }

    // Extract and protect callout blocks first
    // Match callout blocks: starts with > [!type] and continues with lines starting with >
    const calloutPattern = /^>[ \t]*\[![\w-]+\].*?(\n>.*?)*(?=\n(?!>)|$)/gm
    const callouts: Array<{ placeholder: string, content: string }> = []
    let calloutIndex = 0

    // Replace callouts with placeholders
    const bodyWithPlaceholders = bodyAfterHeadings.replace(calloutPattern, (match) => {
        const placeholder = `__CALLOUT_${calloutIndex}__`
        callouts.push({ placeholder, content: match })
        calloutIndex++
        return placeholder
    })

    // Process the entire body while preserving protected segments
    let resultBody = ""
    let lastIndex = 0
    let match: RegExpExecArray | null

    // Reset the regex to start from the beginning
    REGEX_PATTERNS.PROTECTED.lastIndex = 0

    while (
        (match = REGEX_PATTERNS.PROTECTED.exec(bodyWithPlaceholders)) !== null
    ) {
        const mIndex = match.index
        const segment = bodyWithPlaceholders.slice(lastIndex, mIndex)
        resultBody += processTableAwareTextSegment(segment)

        const fullMatch = match[0]
        if (
            settings.ignoreMarkdownTables
            && isIndexInsideMarkdownTable(bodyWithPlaceholders, mIndex)
        ) {
            resultBody += fullMatch
        }
        else if (resolvedAmbiguities?.has(fullMatch)) {
            // Existing link replacement
            const resolvedPath = resolvedAmbiguities.get(fullMatch)!
            const { linkPath, alias: resolvedAlias } = extractLinkParts(resolvedPath)

            // Try to extract existing alias from the matched link
            const existingLinkRegex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/
            const linkMatch = fullMatch.match(existingLinkRegex)
            const existingPath = linkMatch ? linkMatch[1] : ""
            const existingAlias = linkMatch ? linkMatch[2] : undefined

            // Use resolved alias if present, otherwise use existing alias,
            // otherwise use existing path (as alias if it was a simple link)
            const finalAlias = resolvedAlias || existingAlias || (fullMatch.includes("|") ? undefined : existingPath)

            const isInTable = isIndexInsideMarkdownTable(bodyWithPlaceholders, mIndex)
            resultBody += linkGenerator({
                linkPath,
                sourcePath: filePath,
                alias: finalAlias,
                isInTable,
            })
        }
        else {
            // Append the protected segment unchanged
            resultBody += fullMatch
        }
        lastIndex = mIndex + fullMatch.length

        // Prevent infinite loop on zero-length matches
        if (fullMatch.length === 0) {
            REGEX_PATTERNS.PROTECTED.lastIndex++
        }
    }

    // Process the remaining text
    resultBody += processTableAwareTextSegment(bodyWithPlaceholders.slice(lastIndex))

    // Restore callouts
    for (const { placeholder, content } of callouts) {
        resultBody = resultBody.replace(placeholder, content)
    }

    // Restore headings
    for (const { placeholder, content } of headings) {
        resultBody = resultBody.replace(placeholder, content)
    }

    // Restore fenced code blocks
    for (const { placeholder, content } of codeBlocks) {
        resultBody = resultBody.replace(placeholder, content)
    }

    return resultBody
}
