import { describe, expect, it } from "vitest"
import { mapMarkdownProse, segmentMarkdown } from "../markdown-segments"

describe("segmentMarkdown", () => {
    it.each(["`TypeScript`", "``TypeScript``", "```TypeScript```"])("round-trips prose and protected inline code %s", (inlineCode) => {
        const text = `Use ${inlineCode} with TypeScript`
        const segments = segmentMarkdown(text)

        expect(segments.map(segment => ({
            kind: segment.kind,
            protectedKind: segment.protectedKind,
            text: segment.text,
        }))).toEqual([
            { kind: "prose", protectedKind: undefined, text: "Use " },
            { kind: "protected", protectedKind: "inline-code", text: inlineCode },
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

    it.each([
        ["before `code`` after", []],
        ["before ``code` after", []],
        ["before ``code`inside`` after", ["``code`inside``"]],
        ["before `code``inside` after", ["`code``inside`"]],
        ["before ` unmatched ``code`` after", ["``code``"]],
        ["before `` unmatched `code` after", ["`code`"]],
        ["before `code\nnext line` after", ["`code\nnext line`"]],
        ["before `one` `two` after", ["`one`", "`two`"]],
    ])("only pairs complete backtick runs of equal length in %s", (text, expectedCode) => {
        const segments = segmentMarkdown(text)

        expect(segments.filter(segment => segment.protectedKind === "inline-code").map(segment => segment.text)).toEqual(expectedCode)
        expect(segments.map(segment => segment.text).join("")).toBe(text)
        for (const segment of segments) {
            expect(text.slice(segment.start, segment.end)).toBe(segment.text)
        }
    })

    it("keeps backticks inside earlier links within the link", () => {
        const text = "before [[`one]] after `two`"

        expect(segmentMarkdown(text).filter(segment => segment.kind === "protected").map(segment => ({
            protectedKind: segment.protectedKind,
            text: segment.text,
        }))).toEqual([
            { protectedKind: "wikilink", text: "[[`one]]" },
            { protectedKind: "inline-code", text: "`two`" },
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

    it("protects linear URLs when requested", () => {
        const text = "linear://workspace/issue/ACME-123"
        const segments = segmentMarkdown(text, {
            protectUrls: true,
        })

        expect(segments).toEqual([
            {
                kind: "protected",
                protectedKind: "url",
                start: 0,
                end: text.length,
                text,
            },
        ])
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
