import { mapMarkdownProse } from "../markdown-segments"
import { AutomaticLinkerSettings } from "../settings/settings-info"

const URL_PATTERN = /(?:https?:\/\/|linear:\/\/)[^\s<>\]]+/g

export const replaceURLs = (
    fileContent: string,
    settings: AutomaticLinkerSettings,
    formatter: (url: string, settings: AutomaticLinkerSettings) => string,
) =>
    mapMarkdownProse(
        fileContent,
        prose => prose.replace(URL_PATTERN, match => formatter(match, settings)),
    )
