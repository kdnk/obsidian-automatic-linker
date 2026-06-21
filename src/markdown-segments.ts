import { isMarkdownTableLine } from "./replace-links/candidate-scanner"

export type MarkdownSegmentKind = "prose" | "protected"

export type MarkdownProtectedKind = "inline-code"
    | "fenced-code"
    | "wikilink"
    | "markdown-link"
    | "single-bracket"
    | "url"
    | "heading"
    | "callout"
    | "table-row"

export interface MarkdownSegment {
    kind: MarkdownSegmentKind
    protectedKind?: MarkdownProtectedKind
    start: number
    end: number
    text: string
}

export interface SegmentMarkdownOptions {
    protectHeadings?: boolean
    protectCallouts?: boolean
    protectTableRows?: boolean
    protectUrls?: boolean
}

interface ProtectedRange {
    start: number
    end: number
    protectedKind: MarkdownProtectedKind
}

const collectHeadingRanges = (text: string): ProtectedRange[] => {
    const ranges: ProtectedRange[] = []
    const headingPattern = /^#{1,6}\s+.*$/gm
    let match: RegExpExecArray | null

    while ((match = headingPattern.exec(text)) !== null) {
        ranges.push({
            start: match.index,
            end: match.index + match[0].length,
            protectedKind: "heading",
        })
    }

    return ranges
}

const collectCalloutRanges = (text: string): ProtectedRange[] => {
    const ranges: ProtectedRange[] = []
    const calloutPattern = /^>[ \t]*\[![\w-]+\].*?(\n>.*?)*(?=\n(?!>)|$)/gm
    let match: RegExpExecArray | null

    while ((match = calloutPattern.exec(text)) !== null) {
        ranges.push({
            start: match.index,
            end: match.index + match[0].length,
            protectedKind: "callout",
        })
    }

    return ranges
}

const collectTableRowRanges = (text: string): ProtectedRange[] => {
    const ranges: ProtectedRange[] = []
    const linePattern = /[^\n]*(?:\n|$)/g
    let match: RegExpExecArray | null

    while ((match = linePattern.exec(text)) !== null) {
        if (match[0] === "") {
            break
        }

        const lineText = match[0]
        const lineContent = lineText.endsWith("\n")
            ? lineText.slice(0, -1).replace(/\r$/, "")
            : lineText.replace(/\r$/, "")

        if (isMarkdownTableLine(lineContent)) {
            ranges.push({
                start: match.index,
                end: match.index + lineText.length,
                protectedKind: "table-row",
            })
        }
    }

    return ranges
}

const buildProtectedPattern = (protectUrls: boolean): RegExp => {
    const parts = [
        "```[\\s\\S]*?(?:```|$)",
        "~~~[\\s\\S]*?(?:~~~|$)",
        "`[^`]*`",
        "\\[\\[[^\\]]+\\]\\]",
        "\\[[^\\]]+\\]\\([^)]+\\)",
        "\\[[^\\]]+\\]",
    ]

    if (protectUrls) {
        parts.push("https?:\\/\\/[^\\s]+")
    }

    return new RegExp(`(${parts.join("|")})`, "g")
}

const getProtectedKind = (text: string): MarkdownProtectedKind => {
    if (text.startsWith("```") || text.startsWith("~~~")) {
        return "fenced-code"
    }

    if (text.startsWith("`")) {
        return "inline-code"
    }

    if (text.startsWith("[[")) {
        return "wikilink"
    }

    if (text.startsWith("[")) {
        return text.includes("](") ? "markdown-link" : "single-bracket"
    }

    return "url"
}

const sortAndMergeRanges = (ranges: ProtectedRange[]): ProtectedRange[] => {
    const sortedRanges = ranges
        .slice()
        .sort((a, b) => a.start - b.start || a.end - b.end)
    const merged: ProtectedRange[] = []

    for (const range of sortedRanges) {
        const lastRange = merged[merged.length - 1]
        if (!lastRange || range.start >= lastRange.end) {
            merged.push({ ...range })
            continue
        }

        lastRange.end = Math.max(lastRange.end, range.end)
    }

    return merged
}

const isInsideRanges = (
    index: number,
    ranges: ProtectedRange[],
): boolean => {
    return ranges.some(range => index >= range.start && index < range.end)
}

export const segmentMarkdown = (
    text: string,
    options: SegmentMarkdownOptions = {},
): MarkdownSegment[] => {
    const mayContainProtectedMarkdown = text.includes("`")
        || text.includes("[")
        || (options.protectHeadings && text.includes("#"))
        || (options.protectCallouts && text.includes(">"))
        || (options.protectTableRows && text.includes("|"))
        || (options.protectUrls && text.includes("http"))

    if (!mayContainProtectedMarkdown) {
        return [{
            kind: "prose",
            start: 0,
            end: text.length,
            text,
        }]
    }

    const ranges: ProtectedRange[] = []

    if (options.protectHeadings) {
        ranges.push(...collectHeadingRanges(text))
    }

    if (options.protectCallouts) {
        ranges.push(...collectCalloutRanges(text))
    }

    if (options.protectTableRows) {
        ranges.push(...collectTableRowRanges(text))
    }

    const protectedPattern = buildProtectedPattern(options.protectUrls ?? false)
    let match: RegExpExecArray | null

    while ((match = protectedPattern.exec(text)) !== null) {
        if (isInsideRanges(match.index, ranges)) {
            continue
        }

        ranges.push({
            start: match.index,
            end: match.index + match[0].length,
            protectedKind: getProtectedKind(match[0]),
        })
    }

    const mergedRanges = sortAndMergeRanges(ranges)
    const segments: MarkdownSegment[] = []
    let cursor = 0

    for (const range of mergedRanges) {
        if (cursor < range.start) {
            segments.push({
                kind: "prose",
                start: cursor,
                end: range.start,
                text: text.slice(cursor, range.start),
            })
        }

        segments.push({
            kind: "protected",
            protectedKind: range.protectedKind,
            start: range.start,
            end: range.end,
            text: text.slice(range.start, range.end),
        })
        cursor = range.end
    }

    if (cursor < text.length || segments.length === 0) {
        segments.push({
            kind: "prose",
            start: cursor,
            end: text.length,
            text: text.slice(cursor),
        })
    }

    return segments
}

export const mapMarkdownProse = (
    text: string,
    transform: (segmentText: string, segment: MarkdownSegment) => string,
    options: SegmentMarkdownOptions = {},
): string => {
    return segmentMarkdown(text, options)
        .map(segment => segment.kind === "prose"
            ? transform(segment.text, segment)
            : segment.text)
        .join("")
}
