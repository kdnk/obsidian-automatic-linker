import { segmentMarkdown } from "../../markdown-segments"

interface BareUrlOccurrence {
    url: string
    start: number
    end: number
}

const trimTrailingPunctuation = (candidate: string): string => {
    const openingParentheses = (candidate.match(/\(/g) ?? []).length
    let closingParentheses = (candidate.match(/\)/g) ?? []).length
    let end = candidate.length

    while (end > 0) {
        const lastCharacter = candidate[end - 1]
        if (/[.,;!?\]}]/.test(lastCharacter)) {
            end--
        }
        else if (lastCharacter === ")" && closingParentheses > openingParentheses) {
            end--
            closingParentheses--
        }
        else {
            break
        }
    }

    return candidate.slice(0, end)
}

const isIgnoredUrl = (url: string, ignoredDomains: string[]): boolean => {
    if (ignoredDomains.length === 0) {
        return false
    }

    try {
        const hostname = new URL(url).hostname
        return ignoredDomains.some(domain =>
            hostname === domain || hostname.endsWith(`.${domain}`))
    }
    catch {
        return true
    }
}

export const findBareUrlOccurrences = (
    body: string,
    ignoredDomains: string[] = [],
): BareUrlOccurrence[] => {
    const protectedRanges: { start: number, end: number }[] = []
    for (const segment of segmentMarkdown(body)) {
        if (segment.kind === "protected") {
            protectedRanges.push(segment)
            continue
        }

        // Keep the existing replacement behavior while inline code is being typed.
        const unclosedBacktick = segment.text.search(/(?<!\\)`/)
        if (unclosedBacktick !== -1) {
            protectedRanges.push({
                start: segment.start + unclosedBacktick,
                end: segment.end,
            })
        }
    }
    const occurrences: BareUrlOccurrence[] = []
    const urlPattern = /https?:\/\/[^\s<>"'`]+/g
    let protectedIndex = 0
    let match: RegExpExecArray | null

    while ((match = urlPattern.exec(body)) !== null) {
        const start = match.index
        const candidateEnd = start + match[0].length

        while (protectedIndex < protectedRanges.length
            && protectedRanges[protectedIndex].end <= start) {
            protectedIndex++
        }

        // Scan the original text so a protected segment cannot truncate a URL.
        if (protectedIndex < protectedRanges.length
            && protectedRanges[protectedIndex].start < candidateEnd) {
            if (start >= protectedRanges[protectedIndex].start) {
                urlPattern.lastIndex = protectedRanges[protectedIndex].end
            }
            continue
        }

        if ((body[start - 1] === "<" && body[candidateEnd] === ">")
            || body.slice(Math.max(0, start - 2), start) === "](") {
            continue
        }

        const url = trimTrailingPunctuation(match[0])
        if (!isIgnoredUrl(url, ignoredDomains)) {
            occurrences.push({ url, start, end: start + url.length })
        }
    }

    return occurrences
}
