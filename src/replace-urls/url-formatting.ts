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
        prose =>
            prose.replace(URL_PATTERN, match =>
                formatURLWithAdapters(match, settings, formatters),
            ),
    )
