import { AutomaticLinkerSettings } from "../settings/settings-info"

export const replaceURLs = (
    fileContent: string,
    settings: AutomaticLinkerSettings,
    formatter: (url: string, settings: AutomaticLinkerSettings) => string,
) => {
    const githubUrlPattern = /(?<!\[\[.*)(https?:\/\/[^\s\]]+)(?!.*\]\])/g
    fileContent = fileContent.replace(githubUrlPattern, (match) => {
        return formatter(match, settings)
    })
    return fileContent
}
