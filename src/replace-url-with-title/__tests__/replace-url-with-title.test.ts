import { describe, expect, it } from "vitest"
import { replaceUrlWithTitle } from ".."

describe("replaceUrlWithTitle", () => {
    it("should replace URLs with titles", () => {
        const body = "Check this link: https://example.com"
        const result = replaceUrlWithTitle({
            body,
            urlTitleMap: new Map(
                Object.entries({
                    "https://example.com": "Example Title",
                }),
            ),
        })
        expect(result).toBe(
            "Check this link: [Example Title](https://example.com)",
        )
    })

    it("should escape Markdown syntax characters in titles", () => {
        const result = replaceUrlWithTitle({
            body: "https://example.com",
            urlTitleMap: new Map([
                ["https://example.com", String.raw`Docs [Android] \ Guide`],
            ]),
        })

        expect(result).toBe(
            String.raw`[Docs \[Android\] \\ Guide](https://example.com)`,
        )
    })

    it("should handle multiple URLs", () => {
        const body = "Links: https://example.com and https://another.com"
        const result = replaceUrlWithTitle({
            body,
            urlTitleMap: new Map(
                Object.entries({
                    "https://example.com": "Example Title",
                    "https://another.com": "Another Title",
                }),
            ),
        })
        expect(result).toBe(
            "Links: [Example Title](https://example.com) and [Another Title](https://another.com)",
        )
    })

    it("should ignore markdown link []()", () => {
        const body = "Check this link: [Example Title](https://example.com)"
        const result = replaceUrlWithTitle({
            body,
            urlTitleMap: new Map(
                Object.entries({
                    "https://example.com": "Example Title",
                }),
            ),
        })
        expect(result).toBe(
            "Check this link: [Example Title](https://example.com)",
        )
    })

    it("should handle multiple lines", () => {
        const body = "Line 1: https://example.com\nLine 2: https://another.com"
        const result = replaceUrlWithTitle({
            body,
            urlTitleMap: new Map(
                Object.entries({
                    "https://example.com": "Example Title",
                    "https://another.com": "Another Title",
                }),
            ),
        })
        expect(result).toBe(
            "Line 1: [Example Title](https://example.com)\nLine 2: [Another Title](https://another.com)",
        )
    })

    it("should ignore URLs inside tilde fenced code blocks", () => {
        const body = "~~~\nhttps://example.com\n~~~"
        const result = replaceUrlWithTitle({
            body,
            urlTitleMap: new Map(
                Object.entries({
                    "https://example.com": "Example Title",
                }),
            ),
        })
        expect(result).toBe("~~~\nhttps://example.com\n~~~")
    })

    it("should not replace angle-bracket autolinks", () => {
        const body = "<https://example.com>"
        const result = replaceUrlWithTitle({
            body,
            urlTitleMap: new Map(
                Object.entries({
                    "https://example.com": "Example Title",
                }),
            ),
        })
        expect(result).toBe("<https://example.com>")
    })

    it.each([
        "https://example.com/docs",
        "https://example.com?section=docs",
        "https://example.com#docs",
        "https://example.com.evil.test",
    ])("does not replace a cached prefix of %s", (body) => {
        expect(replaceUrlWithTitle({
            body,
            urlTitleMap: new Map([["https://example.com", "Home"]]),
        })).toBe(body)
    })

    it.each([
        ["https://example.com/docs", "[Docs](https://example.com/docs)"],
        ["https://example.com?section=docs", "[Docs](https://example.com?section=docs)"],
        ["https://example.com.evil.test", "[Docs](https://example.com.evil.test)"],
    ])("uses the complete cached URL once for %s", (url, expected) => {
        expect(replaceUrlWithTitle({
            body: url,
            urlTitleMap: new Map([
                ["https://example.com", "Home"],
                [url, "Docs"],
            ]),
        })).toBe(expected)
    })

    it("replaces repeated URLs and leaves the result unchanged on another run", () => {
        const urlTitleMap = new Map([
            ["https://example.com", "Home"],
            ["https://example.com/docs", "Docs"],
        ])
        const expected = "[Docs](https://example.com/docs), [Home](https://example.com), [Docs](https://example.com/docs)."
        const result = replaceUrlWithTitle({
            body: "https://example.com/docs, https://example.com, https://example.com/docs.",
            urlTitleMap,
        })

        expect(result).toBe(expected)
        expect(replaceUrlWithTitle({ body: result, urlTitleMap })).toBe(expected)
    })

    it("does not revisit URLs inside a newly inserted title", () => {
        expect(replaceUrlWithTitle({
            body: "https://example.com/docs",
            urlTitleMap: new Map([
                ["https://example.com/docs", "See https://example.com"],
                ["https://example.com", "Home"],
            ]),
        })).toBe("[See https://example.com](https://example.com/docs)")
    })

    it("ignores cached URLs from ignored domains and their subdomains", () => {
        const body = "https://example.com https://docs.example.com https://notexample.com"
        expect(replaceUrlWithTitle({
            body,
            ignoredDomains: ["example.com"],
            urlTitleMap: new Map([
                ["https://example.com", "Home"],
                ["https://docs.example.com", "Docs"],
                ["https://notexample.com", "Other"],
            ]),
        })).toBe("https://example.com https://docs.example.com [Other](https://notexample.com)")
    })

    it("preserves code, Markdown links, and autolinks beside a bare URL", () => {
        const protectedText = [
            "`https://example.com/docs`",
            "```\nhttps://example.com/docs\n```",
            "~~~\nhttps://example.com/docs\n~~~",
            "[Docs](https://example.com/docs)",
            "[https://example.com/docs](https://other.test)",
            "<https://example.com/docs>",
        ].join("\n")
        const result = replaceUrlWithTitle({
            body: `${protectedText}\nhttps://example.com/docs`,
            urlTitleMap: new Map([
                ["https://example.com", "Home"],
                ["https://example.com/docs", "Docs"],
            ]),
        })

        expect(result).toBe(`${protectedText}\n[Docs](https://example.com/docs)`)
    })

    it("keeps balanced URL parentheses and surrounding punctuation", () => {
        expect(replaceUrlWithTitle({
            body: "See (https://example.com/docs_(part)).",
            urlTitleMap: new Map([
                ["https://example.com/docs_(part", "Incomplete"],
                ["https://example.com/docs_(part)", "Part"],
            ]),
        })).toBe("See ([Part](https://example.com/docs_(part))).")
    })

    it("preserves URLs after an unclosed inline code delimiter", () => {
        const body = "https://example.com before `code https://example.com"
        expect(replaceUrlWithTitle({
            body,
            urlTitleMap: new Map([["https://example.com", "Home"]]),
        })).toBe("[Home](https://example.com) before `code https://example.com")
    })

    it("replaces a bare URL immediately after an existing Markdown link", () => {
        expect(replaceUrlWithTitle({
            body: "[Docs](https://example.com/docs)https://example.com",
            urlTitleMap: new Map([["https://example.com", "Home"]]),
        })).toBe("[Docs](https://example.com/docs)[Home](https://example.com)")
    })

    it("does not replace an embedded URL after a protected range in the same URL", () => {
        const body = "https://example.com/search?q=[value]&next=https://example.org"
        expect(replaceUrlWithTitle({
            body,
            urlTitleMap: new Map([["https://example.org", "Other"]]),
        })).toBe(body)
    })
})
