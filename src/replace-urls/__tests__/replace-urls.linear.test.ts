import { describe, expect, it } from "vitest"
import {
    AutomaticLinkerSettings,
    DEFAULT_SETTINGS,
} from "../../settings/settings-info"
import { formatLinearURL } from "../linear"

describe("formatLinearURL", () => {
    const baseSettings: AutomaticLinkerSettings = {
        ...DEFAULT_SETTINGS,
        formatLinearURLs: true,
    }

    describe("Basic Linear URL formatting", () => {
        it("should format Linear issue URL with title", () => {
            const input
                = "https://linear.app/andrewmcodes/issue/ACME-123/title-of-issue"
            const expected
                = "[[linear/andrewmcodes/ACME-123]] [🔗](https://linear.app/andrewmcodes/issue/ACME-123)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })

        it("should format Linear issue URL without title", () => {
            const input = "https://linear.app/workspace/issue/PROJ-456"
            const expected
                = "[[linear/workspace/PROJ-456]] [🔗](https://linear.app/workspace/issue/PROJ-456)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })

        it("should format linear:// protocol URL", () => {
            const input = "linear://andrewmcodes/issue/ACME-123"
            const expected
                = "[[linear/andrewmcodes/ACME-123]] [🔗](https://linear.app/andrewmcodes/issue/ACME-123)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })

        it("should not modify non-Linear URLs", () => {
            const input = "https://example.com/issue/ACME-123"
            expect(formatLinearURL(input, baseSettings)).toBe(input)
        })

        it("should handle invalid URLs", () => {
            const input = "not-a-url"
            expect(formatLinearURL(input, baseSettings)).toBe(input)
        })
    })

    describe("URL pattern validation", () => {
        it("should not format URLs without issue path", () => {
            const input = "https://linear.app/workspace"
            expect(formatLinearURL(input, baseSettings)).toBe(input)
        })

        it("should not format URLs with invalid issue format", () => {
            const input = "https://linear.app/workspace/issue/INVALID"
            expect(formatLinearURL(input, baseSettings)).toBe(input)
        })

        it("should format URLs with different workspace names", () => {
            const input = "https://linear.app/my-company/issue/BUG-789"
            const expected
                = "[[linear/my-company/BUG-789]] [🔗](https://linear.app/my-company/issue/BUG-789)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })
    })

    describe("Issue ID format validation", () => {
        it("should handle issue IDs with numbers", () => {
            const input = "https://linear.app/workspace/issue/ABC-123"
            const expected
                = "[[linear/workspace/ABC-123]] [🔗](https://linear.app/workspace/issue/ABC-123)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })

        it("should handle issue IDs with multiple digits", () => {
            const input = "https://linear.app/workspace/issue/PROJ-99999"
            const expected
                = "[[linear/workspace/PROJ-99999]] [🔗](https://linear.app/workspace/issue/PROJ-99999)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })

        it("should not format issue IDs without hyphen", () => {
            const input = "https://linear.app/workspace/issue/ABC123"
            expect(formatLinearURL(input, baseSettings)).toBe(input)
        })
    })

    describe("URL with query parameters", () => {
        it("should format URLs with query parameters", () => {
            const input
                = "https://linear.app/workspace/issue/ACME-123?something=value"
            const expected
                = "[[linear/workspace/ACME-123]] [🔗](https://linear.app/workspace/issue/ACME-123)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })

        it("should format URLs with hash fragments", () => {
            const input
                = "https://linear.app/workspace/issue/ACME-123#comment-123"
            const expected
                = "[[linear/workspace/ACME-123]] [🔗](https://linear.app/workspace/issue/ACME-123)"
            expect(formatLinearURL(input, baseSettings)).toBe(expected)
        })
    })

    describe("When formatLinearURLs is disabled", () => {
        it("should not format Linear URLs when setting is false", () => {
            const settingsDisabled: AutomaticLinkerSettings = {
                ...DEFAULT_SETTINGS,
                formatLinearURLs: false,
            }
            const input = "https://linear.app/workspace/issue/ACME-123"
            expect(formatLinearURL(input, settingsDisabled)).toBe(input)
        })
    })
})
