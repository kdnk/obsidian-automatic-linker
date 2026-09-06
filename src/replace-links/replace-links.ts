import { CandidateData, TrieNode } from "../trie"
import { mapMarkdownProse } from "../markdown-segments"
import {
    buildFallbackIndex,
    extractLinkParts,
    getCurrentNamespace,
    isCjkText,
    isIndexInsideMarkdownTable,
    isProtectedLink,
    normalizeCanonicalPath,
    scanUnlinkedCandidateAt,
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
    forceIsInTable?: boolean,
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
        forceIsInTable,
    )
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
    forceIsInTable?: boolean,
): string => {
    let result = ""
    let i = 0

    while (i < text.length) {
        const scanResult = scanUnlinkedCandidateAt({
            text,
            startIndex: i,
            filePath,
            trie,
            candidateMap,
            fallbackIndex,
            currentNamespace,
            settings,
        })

        if (scanResult?.action === "skip") {
            result += text.slice(i, scanResult.end)
            i = scanResult.end
            continue
        }

        if (scanResult?.action === "match") {
            const occurrence = scanResult.occurrence
            const candidateData = occurrence.replacementCandidateData
                ?? occurrence.candidateData
            const { linkPath, alias } = createLinkContent(
                candidateData,
                occurrence.text,
                settings,
            )
            const finalLink = linkGenerator({
                linkPath,
                sourcePath: filePath,
                alias,
                isInTable: forceIsInTable ?? occurrence.isInTable,
            })
            result += finalLink
            i = occurrence.end
            continue
        }

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

    const markdownOptions = {
        protectHeadings: settings.ignoreHeadings,
        protectCallouts: true,
        protectTableRows: settings.ignoreMarkdownTables,
        protectUrls: true,
    }

    // Process segments of text
    const processTextSegment = (
        text: string,
        forceIsInTable?: boolean,
    ): string => {
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
                forceIsInTable,
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
                forceIsInTable,
            )
        }
    }

    const processTableAwareTextSegment = (
        text: string,
        segment: { start: number },
    ): string => {
        if (!text.includes("\n")) {
            const isInTable = !settings.ignoreMarkdownTables
                && isIndexInsideMarkdownTable(body, segment.start)
            return processTextSegment(text, isInTable)
        }

        return text.replace(/[^\n]*(?:\n|$)/g, (line, offset) => {
            if (line === "") {
                return line
            }

            const lineContent = line.endsWith("\n")
                ? line.slice(0, -1).replace(/\r$/, "")
                : line

            if (lineContent === "") {
                return line
            }

            const absoluteIndex = segment.start + offset
            const isInTable = !settings.ignoreMarkdownTables
                && isIndexInsideMarkdownTable(body, absoluteIndex)

            return processTextSegment(line, isInTable)
        })
    }

    return mapMarkdownProse(
        body,
        processTableAwareTextSegment,
        markdownOptions,
    )
}
