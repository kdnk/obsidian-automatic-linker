import { isLinkingOff, isUrlTitleReplacementOff } from "./frontmatter-utils"
import { segmentMarkdown } from "./markdown-segments"
import { isIndexInsideMarkdownTable } from "./replace-links/candidate-scanner"
import {
    defaultLinkGenerator,
    LinkGenerator,
    normalizeExistingBaseDirWikilinks,
    replaceLinks,
} from "./replace-links/replace-links"
import { replaceUrlWithTitle } from "./replace-url-with-title"
import { formatURLsInText } from "./replace-urls/url-formatting"
import {
    AutomaticLinkerSettings,
    projectReplaceLinksSettings,
} from "./settings/settings-catalog"
import { CandidateData, TrieNode } from "./trie"

export interface CandidateIndex {
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
}

export interface FormattingRunOptions {
    content: string
    filePath: string
    contentStart?: number
    frontmatter?: Record<string, unknown>
    settings: AutomaticLinkerSettings
    baseDir?: string
    candidateIndex?: CandidateIndex
    urlTitleMap?: Map<string, string>
    linkGenerator?: LinkGenerator
    normalizeExistingWikilinks?: boolean
}

export { projectReplaceLinksSettings as toReplaceLinksSettings } from "./settings/settings-catalog"

const formatMarkdownURLs = (
    text: string,
    settings: AutomaticLinkerSettings,
): string =>
    formatURLsInText({
        text,
        settings,
    })

export const formatMarkdownBody = ({
    body,
    filePath,
    frontmatter,
    settings,
    baseDir,
    candidateIndex,
    urlTitleMap = new Map(),
    linkGenerator,
    normalizeExistingWikilinks = false,
}: Omit<FormattingRunOptions, "content"> & { body: string }): string => {
    if (isLinkingOff(frontmatter)) return body

    let updatedBody = formatMarkdownURLs(body, settings)

    if (settings.replaceUrlWithTitle && !isUrlTitleReplacementOff(frontmatter)) {
        updatedBody = replaceUrlWithTitle({
            body: updatedBody,
            urlTitleMap,
            ignoredDomains: settings.replaceUrlWithTitleIgnoreDomains,
        })
    }
    if (candidateIndex) {
        updatedBody = replaceLinks({
            body: updatedBody,
            linkResolverContext: {
                filePath: filePath.replace(/\.md$/, ""),
                trie: candidateIndex.trie,
                candidateMap: candidateIndex.candidateMap,
            },
            settings: projectReplaceLinksSettings(settings, baseDir),
            linkGenerator,
            normalizeExistingWikilinks: normalizeExistingWikilinks
                && settings.normalizeExistingWikilinks
                && !!linkGenerator,
        })
    }

    return updatedBody
}

export const formatMarkdownSelection = ({
    body,
    selection = { start: 0, end: body.length },
    frontmatter,
    filePath,
    settings,
    baseDir,
    candidateIndex,
    linkGenerator,
}: Omit<FormattingRunOptions, "content" | "urlTitleMap"> & {
    /** Full document body, so protection rules can see outside the selection. */
    body: string
    /** Offsets into body; the returned text contains only this range. */
    selection?: { start: number, end: number }
}): string => {
    if (isLinkingOff(frontmatter) || !candidateIndex) {
        return body.slice(selection.start, selection.end)
    }

    const replacementSettings = projectReplaceLinksSettings(settings, baseDir)
    const effectiveLinkGenerator = linkGenerator ?? defaultLinkGenerator
    const canNormalizeExistingWikilinks = settings.normalizeExistingWikilinks
        && !!linkGenerator
    const markdownOptions = {
        protectHeadings: settings.ignoreHeadings,
        protectCallouts: true,
        protectTableRows: settings.ignoreMarkdownTables,
        protectUrls: true,
    }
    return segmentMarkdown(body, markdownOptions).map((segment) => {
        const start = Math.max(segment.start, selection.start)
        const end = Math.min(segment.end, selection.end)
        if (start >= end) return ""
        const selectedText = body.slice(start, end)
        if (segment.kind === "protected") {
            const containsWholeWikilink = segment.protectedKind === "wikilink"
                && segment.start >= selection.start
                && segment.end <= selection.end
            if (!canNormalizeExistingWikilinks || !containsWholeWikilink) {
                return selectedText
            }

            return normalizeExistingBaseDirWikilinks(
                segment.text,
                filePath.replace(/\.md$/, ""),
                candidateIndex.candidateMap,
                effectiveLinkGenerator,
                replacementSettings,
                markdownOptions,
                isIndexInsideMarkdownTable(body, segment.start),
            )
        }

        return selectedText.replace(/[^\n]+/g, (line, offset: number) => replaceLinks({
            body: line,
            linkResolverContext: {
                filePath: filePath.replace(/\.md$/, ""),
                trie: candidateIndex.trie,
                candidateMap: candidateIndex.candidateMap,
            },
            settings: replacementSettings,
            linkGenerator: params => effectiveLinkGenerator({
                ...params,
                isInTable: isIndexInsideMarkdownTable(body, start + offset),
            }),
        }))
    }).join("")
}

const inferContentStart = (content: string): number => {
    const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
    return frontmatter?.[0].length ?? 0
}

export const formatMarkdownDocument = ({
    content,
    contentStart = inferContentStart(content),
    ...options
}: FormattingRunOptions): string => {
    if (isLinkingOff(options.frontmatter)) return content

    const frontmatterText = content.slice(0, contentStart)
    const body = content.slice(contentStart)
    return frontmatterText + formatMarkdownBody({ ...options, body })
}
