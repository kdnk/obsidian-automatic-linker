import { describe, expect, it } from "vitest"
import { getTitleFromHtml } from "../get-title-from-html"

describe("getTitleFromHtml", () => {
    it("should extract title from HTML", () => {
        const html = "<html><head><title>Example Title</title></head></html>"
        const result = getTitleFromHtml(html)
        expect(result).toBe("Example Title")
    })

    it("should decode and normalize a multiline HTML title", () => {
        const html = `<html><head><title>
            モンステラ L Clear Pot（Simple Green L）｜土を使わない観葉植物
            &ndash; &amp;Green
        </title></head></html>`

        expect(getTitleFromHtml(html)).toBe(
            "モンステラ L Clear Pot（Simple Green L）｜土を使わない観葉植物 – &Green",
        )
    })

    it("should decode numeric entities and normalize unsafe characters", () => {
        const html
            = "<title>\u0000Cafe\u0301\t&#x2013;\n&#8212;\u007F</title>"

        expect(getTitleFromHtml(html)).toBe("Café – —")
    })

    it("should handle empty title tag", () => {
        const html = "<html><head><title></title></head></html>"
        const result = getTitleFromHtml(html)
        expect(result).toBe("")
    })

    it("should handle no title tag", () => {
        const html = "<html><head></head></html>"
        const result = getTitleFromHtml(html)
        expect(result).toBe("")
    })
})
