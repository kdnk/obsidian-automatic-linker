import { ChangeSpec } from "@codemirror/state"
import { Editor } from "obsidian"
import { segmentMarkdown } from "./markdown-segments"

const TAB_SIZE = 4
const LIST_MARKER = /^([ \t]*)(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/

function indentColumns(prefix: string): number {
    let columns = 0
    for (const char of prefix) columns += char === "\t" ? TAB_SIZE - columns % TAB_SIZE : 1
    return columns
}

function pendingInlineBlock(text: string, end: string | null = null): string | null {
    const openers = /<!--|%%|\$\$/g
    let offset = 0
    while (offset < text.length) {
        if (end) {
            const closing = text.indexOf(end, offset)
            if (closing < 0) return end
            offset = closing + end.length
            end = null
        }
        else {
            openers.lastIndex = offset
            const opening = openers.exec(text)
            if (!opening) return null
            end = opening[0] === "<!--" ? "-->" : opening[0]
            offset = opening.index + opening[0].length
        }
    }
    return end
}

/** Conservative repair, not a Markdown parser: ambiguous indentation stays intact. */
export function listIndentChanges(text: string, contentStart: number): ChangeSpec[] {
    const changes: ChangeSpec[] = []
    const codeSpans = segmentMarkdown(text).filter(segment => segment.protectedKind === "inline-code")
    let spanIndex = 0
    let inList = false
    let contentIndent = 0
    let fence: { character: string, length: number, maxClosingIndent: number } | null = null
    let rawHtmlEnd: RegExp | null = null
    let protectedUntil: string | null = null
    let html = false
    const lines = /[^\n]*(?:\n|$)/g
    lines.lastIndex = contentStart
    let match: RegExpExecArray | null
    while ((match = lines.exec(text)) && match[0]) {
        const line = match[0].replace(/\r?\n$/, "")
        const trimmed = line.trim()
        while (spanIndex < codeSpans.length && codeSpans[spanIndex].end <= match.index) spanIndex++
        if (codeSpans[spanIndex]?.start < match.index && codeSpans[spanIndex].end > match.index) {
            inList = false
            continue
        }
        if (fence) {
            const indent = indentColumns(line.match(/^[ \t]*/)![0])
            if (indent <= fence.maxClosingIndent && new RegExp(`^${fence.character}{${fence.length},}[ \\t]*$`).test(trimmed)) fence = null
            continue
        }
        if (rawHtmlEnd) {
            if (rawHtmlEnd.test(line)) rawHtmlEnd = null
            continue
        }
        if (protectedUntil) {
            protectedUntil = pendingInlineBlock(line, protectedUntil)
            continue
        }
        if (html) {
            if (!trimmed) html = false
            continue
        }

        const marker = LIST_MARKER.exec(line)
        let body = marker ? line.slice(marker[0].length) : trimmed
        // Nested containers can open a fence on the same physical line.
        let nested: RegExpExecArray | null
        while ((nested = LIST_MARKER.exec(body))) body = body.slice(nested[0].length)
        const opening = /^(`{3,}|~{3,})/.exec(body)
        const rawHtml = /^<(pre|script|style|textarea)(?:[ \t>]|$)/i.exec(body)
        const comment = /<!--|%%|\$\$/.exec(body)
        if (opening || comment || body.startsWith("<")) {
            const containerIndent = marker
                ? indentColumns(line.slice(0, line.length - body.length))
                : inList && indentColumns(line.match(/^[ \t]*/)![0]) >= contentIndent ? contentIndent : 0
            inList = false
            if (opening) fence = {
                character: opening[1][0],
                length: opening[1].length,
                maxClosingIndent: containerIndent + 3,
            }
            else if (rawHtml) {
                const end = new RegExp(`</${rawHtml[1]}[ \\t]*>`, "i")
                rawHtmlEnd = end.test(body) ? null : end
            }
            else if (comment) {
                protectedUntil = pendingInlineBlock(body)
            }
            else html = true
            continue
        }

        // Break the run at prose, blank lines, quotes and thematic breaks. Without
        // a contiguous list root, four-column indentation might be a code block.
        if (!marker || /^(?:\*[ \t]*){3,}$|^(?:-[ \t]*){3,}$/.test(trimmed)) {
            inList = false
            continue
        }
        const prefix = marker[1]
        const columns = indentColumns(prefix)
        if (!inList && columns >= TAB_SIZE) continue
        inList = true
        contentIndent = indentColumns(marker[0])
        const normalized = "\t".repeat(Math.floor(columns / TAB_SIZE))
        if (prefix !== normalized) changes.push({ from: match.index, to: match.index + prefix.length, insert: normalized })
    }
    return changes
}

export function normalizeListIndent(editor: Editor, contentStart: number): void {
    const changes = listIndentChanges(editor.getValue(), contentStart)
    // One transaction maps selection and produces one native undo step. Bypass
    // Live Preview's editing filters just like the existing formatter diff path.
    if (changes.length) editor.cm?.dispatch({ changes, filter: false })
}
