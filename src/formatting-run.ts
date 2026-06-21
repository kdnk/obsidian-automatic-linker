import { isUrlTitleReplacementOff } from "./frontmatter-utils"
import {
    LinkGenerator,
    replaceLinks,
} from "./replace-links/replace-links"
import { replaceUrlWithTitle } from "./replace-url-with-title"
import { formatGitHubURL } from "./replace-urls/github"
import { formatJiraURL } from "./replace-urls/jira"
import { formatLinearURL } from "./replace-urls/linear"
import { replaceURLs } from "./replace-urls/replace-urls"
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
}

export { projectReplaceLinksSettings as toReplaceLinksSettings } from "./settings/settings-catalog"

const formatMarkdownURLs = (
    text: string,
    settings: AutomaticLinkerSettings,
): string => {
    let updatedText = text

    if (settings.formatGitHubURLs) {
        updatedText = replaceURLs(updatedText, settings, formatGitHubURL)
    }
    if (settings.formatJiraURLs) {
        updatedText = replaceURLs(updatedText, settings, formatJiraURL)
    }
    if (settings.formatLinearURLs) {
        updatedText = replaceURLs(updatedText, settings, formatLinearURL)
    }

    return updatedText
}

export const formatMarkdownBody = ({
    body,
    filePath,
    frontmatter,
    settings,
    baseDir,
    candidateIndex,
    urlTitleMap = new Map(),
    linkGenerator,
}: Omit<FormattingRunOptions, "content"> & { body: string }): string => {
    let updatedBody = formatMarkdownURLs(body, settings)

    if (settings.replaceUrlWithTitle && !isUrlTitleReplacementOff(frontmatter)) {
        updatedBody = replaceUrlWithTitle({ body: updatedBody, urlTitleMap })
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
        })
    }

    return updatedBody
}

export const formatMarkdownSelection = ({
    body,
    filePath,
    settings,
    baseDir,
    candidateIndex,
    linkGenerator,
}: Omit<FormattingRunOptions, "content" | "frontmatter" | "urlTitleMap"> & { body: string }): string => {
    if (!candidateIndex) {
        return body
    }

    return replaceLinks({
        body,
        linkResolverContext: {
            filePath: filePath.replace(/\.md$/, ""),
            trie: candidateIndex.trie,
            candidateMap: candidateIndex.candidateMap,
        },
        settings: projectReplaceLinksSettings(settings, baseDir),
        linkGenerator,
    })
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
    const frontmatterText = formatMarkdownURLs(
        content.slice(0, contentStart),
        options.settings,
    )
    const body = content.slice(contentStart)
    return frontmatterText + formatMarkdownBody({ ...options, body })
}
