import { CandidateData, TrieNode } from "../trie"
import { mapMarkdownProse, segmentMarkdown } from "../markdown-segments"
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
    /** Canonical vault-relative file path without the .md extension. */
    targetPath?: string
    /** Heading or block-reference suffix, including the leading #. */
    subpath?: string
    /** Existing link text to preserve if its canonical target can no longer be resolved. */
    originalLink?: string
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
    normalizeExistingWikilinks?: boolean
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
): { linkPath: string, targetPath: string, alias?: string } => {
    if (candidateData.candidates.length === 0) {
        return { linkPath: originalMatchedText, targetPath: originalMatchedText }
    }
    const { linkPath, alias, hasAlias } = extractLinkParts(
        candidateData.candidates[0].canonical,
    )
    const targetPath = linkPath
    const normalizedPath = normalizeCanonicalPath(linkPath, settings.baseDir)

    // Check if alias should be removed for this directory
    const removeAlias = shouldRemoveAlias(
        normalizedPath,
        settings.removeAliasInDirs,
    )

    if (hasAlias) {
        // If alias removal is enabled for this directory, return path without alias
        if (removeAlias) {
            return { linkPath: normalizedPath, targetPath }
        }
        // Use originalMatchedText to preserve case when ignoreCase or matchSentenceCase is enabled
        const displayAlias = (settings.ignoreCase || settings.matchSentenceCase) ? originalMatchedText : alias
        return { linkPath: normalizedPath, targetPath, alias: displayAlias }
    }

    if (normalizedPath.includes("/")) {
        // If alias removal is enabled for this directory, return path without alias
        if (removeAlias) {
            return { linkPath: normalizedPath, targetPath }
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

        return { linkPath: normalizedPath, targetPath, alias: displayText }
    }

    // No explicit alias, no '/' in normalizedPath
    if (settings.ignoreCase) {
        if (
            originalMatchedText.toLowerCase() === normalizedPath.toLowerCase()
        ) {
            return { linkPath: originalMatchedText, targetPath }
        }
        else {
            return { linkPath: normalizedPath, targetPath, alias: originalMatchedText }
        }
    }
    else {
        if (originalMatchedText !== normalizedPath) {
            return { linkPath: normalizedPath, targetPath, alias: originalMatchedText }
        }
        else {
            return { linkPath: normalizedPath, targetPath }
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
    subpath = "",
    alias,
    isInTable = false,
}: LinkGeneratorParams): string => {
    let linkContent = `${linkPath}${subpath}`

    if (alias) {
        linkContent = `${linkContent}|${alias}`
    }

    return escapeLinkForMarkdownTable(`[[${linkContent}]]`, isInTable)
}

const normalizeExistingBaseDirWikilinks = (
    body: string,
    filePath: string,
    candidateMap: Map<string, CandidateData>,
    linkGenerator: LinkGenerator,
    settings: ReplaceLinksSettings,
    markdownOptions: {
        protectHeadings?: boolean
        protectCallouts?: boolean
        protectTableRows?: boolean
        protectUrls?: boolean
    },
): string => {
    if (!settings.baseDir) return body

    const basePrefix = `${settings.baseDir}/`
    return segmentMarkdown(body, markdownOptions).map((segment) => {
        if (segment.kind !== "protected" || segment.protectedKind !== "wikilink") {
            return segment.text
        }

        const isInTable = isIndexInsideMarkdownTable(body, segment.start)
        const linkContent = segment.text.slice(2, -2)
        const escapedAliasSeparator = isInTable ? linkContent.indexOf("\\|") : -1
        const plainAliasSeparator = linkContent.indexOf("|")
        const aliasSeparator = escapedAliasSeparator >= 0
            ? escapedAliasSeparator
            : plainAliasSeparator
        const aliasSeparatorLength = escapedAliasSeparator >= 0 ? 2 : 1
        const targetWithSubpath = aliasSeparator >= 0
            ? linkContent.slice(0, aliasSeparator)
            : linkContent
        const subpathStart = targetWithSubpath.indexOf("#")
        const targetPath = subpathStart >= 0
            ? targetWithSubpath.slice(0, subpathStart)
            : targetWithSubpath
        const subpath = subpathStart >= 0
            ? targetWithSubpath.slice(subpathStart)
            : undefined
        if (!targetPath.startsWith(basePrefix)) return segment.text

        if (!candidateMap.has(targetPath)) return segment.text

        const linkPath = targetPath.slice(basePrefix.length)
        const originalAlias = aliasSeparator >= 0
            ? linkContent.slice(aliasSeparator + aliasSeparatorLength)
            : undefined
        const alias = originalAlias === linkPath ? undefined : originalAlias

        return linkGenerator({
            linkPath,
            targetPath,
            subpath,
            originalLink: segment.text,
            sourcePath: filePath,
            alias,
            isInTable,
        })
    }).join("")
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
            const { linkPath, targetPath, alias } = createLinkContent(
                candidateData,
                occurrence.text,
                settings,
            )
            const finalLink = linkGenerator({
                linkPath,
                targetPath,
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
    normalizeExistingWikilinks = false,
}: ReplaceLinksOptions): string => {
    // Normalize the body text to NFC
    body = body.normalize("NFC")

    const markdownOptions = {
        protectHeadings: settings.ignoreHeadings,
        protectCallouts: true,
        protectTableRows: settings.ignoreMarkdownTables,
        protectUrls: true,
    }

    if (normalizeExistingWikilinks) {
        body = normalizeExistingBaseDirWikilinks(
            body,
            filePath,
            candidateMap,
            linkGenerator,
            settings,
            markdownOptions,
        )
    }

    // If the body consists solely of a protected link, return it unchanged
    if (isProtectedLink(body)) {
        return body
    }

    // Build the fallback index
    const fallbackIndex = buildFallbackIndex(candidateMap, settings.ignoreCase)

    // Get the current namespace
    const currentNamespace = getCurrentNamespace(filePath, settings.baseDir)

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
