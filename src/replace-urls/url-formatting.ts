import { mapMarkdownProse } from "../markdown-segments"
import { AutomaticLinkerSettings } from "../settings/settings-info"
import { formatGitHubURL } from "./github"
import { formatJiraURL } from "./jira"
import { formatLinearURL } from "./linear"

export type UrlFormatter = (
    url: string,
    settings: AutomaticLinkerSettings,
) => string

export interface FormatURLsInTextOptions {
    text: string
    settings: AutomaticLinkerSettings
    formatters?: readonly UrlFormatter[]
}

const URL_PATTERN = /(?:https?:\/\/|linear:\/\/)[^\s<>\]]+/g

const formatGitHubURLIfEnabled: UrlFormatter = (url, settings) =>
    settings.formatGitHubURLs ? formatGitHubURL(url, settings) : url

const formatJiraURLIfEnabled: UrlFormatter = (url, settings) =>
    settings.formatJiraURLs ? formatJiraURL(url, settings) : url

const formatLinearURLIfEnabled: UrlFormatter = (url, settings) =>
    settings.formatLinearURLs ? formatLinearURL(url, settings) : url

const TRAILING_PUNCTUATION = new Set([".", ",", ";", "!", "?", "]", "}"])

const countCharacter = (text: string, character: string): number => {
    let count = 0

    for (const currentCharacter of text) {
        if (currentCharacter === character) {
            count += 1
        }
    }

    return count
}

const splitTrailingBoundary = (match: string): { url: string, suffix: string } => {
    let url = match
    let suffix = ""

    while (url.length > 0) {
        const lastCharacter = url[url.length - 1]

        if (TRAILING_PUNCTUATION.has(lastCharacter)) {
            suffix = lastCharacter + suffix
            url = url.slice(0, -1)
            continue
        }

        if (
            lastCharacter === ")"
            && countCharacter(url, "(") < countCharacter(url, ")")
        ) {
            suffix = lastCharacter + suffix
            url = url.slice(0, -1)
            continue
        }

        break
    }

    return { url, suffix }
}

export const DEFAULT_URL_FORMATTERS: readonly UrlFormatter[] = [
    formatGitHubURLIfEnabled,
    formatJiraURLIfEnabled,
    formatLinearURLIfEnabled,
]

export const formatURLWithAdapters = (
    url: string,
    settings: AutomaticLinkerSettings,
    formatters: readonly UrlFormatter[] = DEFAULT_URL_FORMATTERS,
): string => {
    for (const formatter of formatters) {
        const formatted = formatter(url, settings)
        if (formatted !== url) {
            return formatted
        }
    }

    return url
}

export const formatURLsInText = ({
    text,
    settings,
    formatters = DEFAULT_URL_FORMATTERS,
}: FormatURLsInTextOptions): string =>
    mapMarkdownProse(
        text,
        (prose, segment) =>
            prose.replace(URL_PATTERN, (match, offset) => {
                const precedingCharacter = offset > 0
                    ? segment.text[offset - 1]
                    : undefined
                const followingCharacter = segment.text[offset + match.length]

                if (precedingCharacter === "<" && followingCharacter === ">") {
                    return match
                }

                const { url, suffix } = splitTrailingBoundary(match)

                return formatURLWithAdapters(url, settings, formatters) + suffix
            }),
    )
