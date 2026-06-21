import { describe, expect, it } from "vitest"
import {
    AutomaticLinkerSettings,
    DEFAULT_SETTINGS,
} from "../../settings/settings-info"
import { formatGitHubURL } from "../github"
import { formatLinearURL } from "../linear"
import { replaceURLs } from "../replace-urls"

describe("replace-urls", () => {
    const baseSettings: AutomaticLinkerSettings = {
        ...DEFAULT_SETTINGS,
        githubEnterpriseURLs: ["github.enterprise.com", "github.company.com"],
    }

    it("should replace GitHub URLs", () => {
        const input
            = "[[github/kdnk/obsidian-automatic-linker]] [🔗](https://github.com/kdnk/obsidian-automatic-linker)"
        const expected
            = "[[github/kdnk/obsidian-automatic-linker]] [🔗](https://github.com/kdnk/obsidian-automatic-linker)"
        expect(replaceURLs(input, baseSettings, formatGitHubURL)).toBe(
            expected,
        )
    })

    it("should replace linear protocol URLs", () => {
        const input = "linear://workspace/issue/ACME-123"
        const expected
            = "[[linear/workspace/ACME-123]] [🔗](https://linear.app/workspace/issue/ACME-123)"

        expect(
            replaceURLs(
                input,
                {
                    ...baseSettings,
                    formatLinearURLs: true,
                },
                formatLinearURL,
            ),
        ).toBe(expected)
    })
})
