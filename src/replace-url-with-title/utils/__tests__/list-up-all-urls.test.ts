import { describe, expect, it } from "vitest"
import { listupAllUrls } from "../list-up-all-urls"

describe("listupAllUrls", () => {
    it("should find a URL in the text", () => {
        const body = "Check this link: https://example.com"
        const result = listupAllUrls(body)
        expect(result).toContain("https://example.com")
    })

    it("should ignore URLs inside markdown links", () => {
        const body = "Check this link: [Example](https://example.com)"
        const result = listupAllUrls(body)
        expect(result).not.toContain("https://example.com")
    })

    it("should ignore URLs inside angle brackets", () => {
        const body = "Check this link: <https://example.com>"
        const result = listupAllUrls(body)
        expect(result).not.toContain("https://example.com")
    })

    it("should ignore URLs inside inline code", () => {
        const body = "Check this link: `https://example.com`"
        const result = listupAllUrls(body)
        expect(result).not.toContain("https://example.com")
    })

    it("should ignore URLs inside fenced code blocks", () => {
        const body = "```\nhttps://example.com\n```"
        const result = listupAllUrls(body)
        expect(result).not.toContain("https://example.com")
    })

    it("should ignore URLs inside tilde fenced code blocks", () => {
        const body = "~~~\nhttps://example.com\n~~~"
        const result = listupAllUrls(body)
        expect(result).not.toContain("https://example.com")
    })

    it("ignore domains", () => {
        const body = "Check this link: https://example.com"
        const result = listupAllUrls(body, ["example.com"])
        expect(result).not.toContain("https://example.com")
    })

    it("finds complete URLs while excluding surrounding punctuation", () => {
        const body = "https://example.com/docs, https://example.com?q=docs! (https://example.com/docs_(part))."

        expect([...listupAllUrls(body)]).toEqual([
            "https://example.com/docs",
            "https://example.com?q=docs",
            "https://example.com/docs_(part)",
        ])
    })

    it("ignores subdomains without ignoring hosts that only share a suffix", () => {
        expect([...listupAllUrls(
            "https://example.com https://docs.example.com https://notexample.com",
            ["example.com"],
        )]).toEqual(["https://notexample.com"])
    })

    it("does not treat a URL interrupted by protected Markdown as a shorter URL", () => {
        expect([...listupAllUrls("https://example.com/search?q=[value]")]).toEqual([])
    })

    it("does not fetch URLs after an unclosed inline code delimiter", () => {
        expect([...listupAllUrls("`code https://example.com")]).toEqual([])
    })

    it("finds a bare URL immediately after an existing Markdown link", () => {
        expect([...listupAllUrls("[Docs](https://example.com/docs)https://example.com")])
            .toEqual(["https://example.com"])
    })

    it("does not fetch an embedded URL after a protected range in the same URL", () => {
        const body = "https://example.com/search?q=[value]&next=https://example.org"
        expect([...listupAllUrls(body)]).toEqual([])
    })
})
