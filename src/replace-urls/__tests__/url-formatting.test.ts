import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "../../settings/settings-info"
import {
    formatURLsInText,
    formatURLWithAdapters,
    UrlFormatter,
} from "../url-formatting"

describe("formatURLWithAdapters", () => {
    it("uses the first adapter that changes the URL", () => {
        const first: UrlFormatter = url => `${url}-first`
        const second: UrlFormatter = url => `${url}-second`

        expect(
            formatURLWithAdapters(
                "https://example.com",
                DEFAULT_SETTINGS,
                [first, second],
            ),
        ).toBe("https://example.com-first")
    })

    it("returns the original URL when no adapter changes it", () => {
        const unchanged: UrlFormatter = url => url

        expect(
            formatURLWithAdapters(
                "https://example.com",
                DEFAULT_SETTINGS,
                [unchanged],
            ),
        ).toBe("https://example.com")
    })
})

describe("formatURLsInText", () => {
    it("formats GitHub, Jira, and Linear URLs in one text pass", () => {
        const result = formatURLsInText({
            text: [
                "https://github.com/owner/repo/issues/123",
                "https://jira.company.com/browse/ABC-456",
                "https://linear.app/team/issue/BUG-789/title",
                "linear://team/issue/BUG-790",
            ].join("\n"),
            settings: {
                ...DEFAULT_SETTINGS,
                githubEnterpriseURLs: [],
                jiraURLs: ["jira.company.com"],
                formatGitHubURLs: true,
                formatJiraURLs: true,
                formatLinearURLs: true,
            },
        })

        expect(result).toBe([
            "[[github/owner/repo/issues/123]] [🔗](https://github.com/owner/repo/issues/123)",
            "[[company/jira/ABC/456]] [🔗](https://jira.company.com/browse/ABC-456)",
            "[[linear/team/BUG-789]] [🔗](https://linear.app/team/issue/BUG-789)",
            "[[linear/team/BUG-790]] [🔗](https://linear.app/team/issue/BUG-790)",
        ].join("\n"))
    })

    it("does not format GitHub URLs wrapped in angle brackets", () => {
        const result = formatURLsInText({
            text: "<https://github.com/owner/repo/issues/123>",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: true,
            },
        })

        expect(result).toBe("<https://github.com/owner/repo/issues/123>")
    })

    it("leaves disabled adapter URLs unchanged", () => {
        const result = formatURLsInText({
            text: "https://linear.app/team/issue/BUG-789/title",
            settings: {
                ...DEFAULT_SETTINGS,
                formatLinearURLs: false,
            },
        })

        expect(result).toBe("https://linear.app/team/issue/BUG-789/title")
    })

    it("leaves Jira URLs with query strings unchanged", () => {
        const result = formatURLsInText({
            text: "https://jira.company.com/browse/ABC-456?focusedCommentId=12345",
            settings: {
                ...DEFAULT_SETTINGS,
                jiraURLs: ["jira.company.com"],
                formatJiraURLs: true,
            },
        })

        expect(result).toBe(
            "https://jira.company.com/browse/ABC-456?focusedCommentId=12345",
        )
    })

    it("keeps closing parens and trailing punctuation outside formatted URLs", () => {
        const result = formatURLsInText({
            text: "See (https://github.com/owner/repo/issues/123).",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: true,
            },
        })

        expect(result).toBe(
            "See ([[github/owner/repo/issues/123]] [🔗](https://github.com/owner/repo/issues/123)).",
        )
    })

    it("does not format URLs inside protected Markdown segments", () => {
        const result = formatURLsInText({
            text: [
                "`https://github.com/owner/repo/issues/123`",
                "```md",
                "https://github.com/owner/repo/issues/123",
                "```",
                "[label](https://github.com/owner/repo/issues/123)",
                "[[https://github.com/owner/repo/issues/123]]",
                "<https://github.com/owner/repo/issues/123>",
                "https://github.com/owner/repo/issues/123",
            ].join("\n"),
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: true,
            },
        })

        expect(result).toBe([
            "`https://github.com/owner/repo/issues/123`",
            "```md",
            "https://github.com/owner/repo/issues/123",
            "```",
            "[label](https://github.com/owner/repo/issues/123)",
            "[[https://github.com/owner/repo/issues/123]]",
            "<https://github.com/owner/repo/issues/123>",
            "[[github/owner/repo/issues/123]] [🔗](https://github.com/owner/repo/issues/123)",
        ].join("\n"))
    })
})
