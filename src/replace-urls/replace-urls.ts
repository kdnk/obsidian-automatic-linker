import { AutomaticLinkerSettings } from "../settings/settings-info"

const URL_PATTERN = /(?:https?:\/\/|linear:\/\/)[^\s<>\]]+/g
const WIKILINK_PATTERN = /\[\[[\s\S]*?\]\]/g

const collectWikilinkRanges = (text: string): Array<{ start: number, end: number }> => {
    const ranges: Array<{ start: number, end: number }> = []
    let match: RegExpExecArray | null

    while ((match = WIKILINK_PATTERN.exec(text)) !== null) {
        ranges.push({
            start: match.index,
            end: match.index + match[0].length,
        })
    }

    return ranges
}

const isInsideRange = (
    index: number,
    ranges: Array<{ start: number, end: number }>,
): boolean => ranges.some(range => index >= range.start && index < range.end)

export const replaceURLs = (
    fileContent: string,
    settings: AutomaticLinkerSettings,
    formatter: (url: string, settings: AutomaticLinkerSettings) => string,
) => {
    const wikilinkRanges = collectWikilinkRanges(fileContent)

    return fileContent.replace(URL_PATTERN, (match, offset) => {
        if (isInsideRange(offset, wikilinkRanges)) {
            return match
        }

        return formatter(match, settings)
    })
}
