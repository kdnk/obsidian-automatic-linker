import { describe, expect, it } from "vitest"
import {
    AutomaticLinkerSettings,
    DEFAULT_SETTINGS,
} from "../../settings/settings-info"
import { formatGitHubURL } from "../github"
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
})
