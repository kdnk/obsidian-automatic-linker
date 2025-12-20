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
})
