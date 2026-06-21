import { describe, expect, it } from "vitest"
import { mapMarkdownProse, segmentMarkdown } from "../markdown-segments"

describe("segmentMarkdown", () => {
    it("round-trips prose and protected inline code", () => {
        const text = "Use `TypeScript` with TypeScript"
        const segments = segmentMarkdown(text)

        expect(segments.map(segment => ({
            kind: segment.kind,
            protectedKind: segment.protectedKind,
            text: segment.text,
        }))).toEqual([
            { kind: "prose", protectedKind: undefined, text: "Use " },
            { kind: "protected", protectedKind: "inline-code", text: "`TypeScript`" },
            { kind: "prose", protectedKind: undefined, text: " with TypeScript" },
        ])
        expect(segments.map(segment => segment.text).join("")).toBe(text)
    })

    it("protects fenced code blocks including unclosed blocks", () => {
        const text = "before\n```ts\nTypeScript"
        const segments = segmentMarkdown(text)

        expect(segments.map(segment => ({
            kind: segment.kind,
            protectedKind: segment.protectedKind,
            text: segment.text,
        }))).toEqual([
            { kind: "prose", protectedKind: undefined, text: "before\n" },
            { kind: "protected", protectedKind: "fenced-code", text: "```ts\nTypeScript" },
        ])
    })

    it("protects tilde fenced code blocks", () => {
        const text = "before\n~~~ts\nTypeScript\n~~~\nafter"
        const segments = segmentMarkdown(text)

        expect(segments.map(segment => ({
            kind: segment.kind,
            protectedKind: segment.protectedKind,
            text: segment.text,
        }))).toEqual([
            { kind: "prose", protectedKind: undefined, text: "before\n" },
            { kind: "protected", protectedKind: "fenced-code", text: "~~~ts\nTypeScript\n~~~\n" },
            { kind: "prose", protectedKind: undefined, text: "after" },
        ])
    })

    it("protects headings, tables, and callouts when requested", () => {
        const text = "# TypeScript\n| TypeScript |\n> [!note]\n> TypeScript\nTypeScript"
        const segments = segmentMarkdown(text, {
            protectHeadings: true,
            protectTableRows: true,
            protectCallouts: true,
        })

        expect(segments.filter(segment => segment.kind === "protected").map(segment => segment.protectedKind)).toEqual([
            "heading",
            "table-row",
            "callout",
        ])
        expect(segments.map(segment => segment.text).join("")).toBe(text)
    })
})

describe("mapMarkdownProse", () => {
    it("transforms only prose segments", () => {
        const result = mapMarkdownProse(
            "TypeScript `TypeScript` [[TypeScript]]",
            text => text.replace(/TypeScript/g, "TS"),
        )

        expect(result).toBe("TS `TypeScript` [[TypeScript]]")
    })

    it("does not globally protect angle-bracket autolinks", () => {
        const result = mapMarkdownProse(
            "<https://example.com> https://example.com",
            text => text.replace(/https:\/\/example\.com/g, "URL"),
        )

        expect(result).toBe("<URL> URL")
    })
})
