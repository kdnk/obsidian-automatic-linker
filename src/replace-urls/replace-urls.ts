import { AutomaticLinkerSettings } from "../settings/settings-info"

const URL_PATTERN = /(?:https?:\/\/|linear:\/\/)[^\s<>\]]+/g

export const replaceURLs = (
    fileContent: string,
    settings: AutomaticLinkerSettings,
    formatter: (url: string, settings: AutomaticLinkerSettings) => string,
) => fileContent.replace(URL_PATTERN, match => formatter(match, settings))
