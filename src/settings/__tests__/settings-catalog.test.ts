import { describe, expect, it } from "vitest"
import {
    DEFAULT_SETTINGS,
    SETTINGS_CATALOG,
    projectReplaceLinksSettings,
    projectUrlFormattingSettings,
    settingRefreshesIndex,
} from "../settings-catalog"

describe("SETTINGS_CATALOG", () => {
    it("covers every default setting exactly once", () => {
        const defaultKeys = Object.keys(DEFAULT_SETTINGS).sort()
        const catalogKeys = SETTINGS_CATALOG.map(entry => entry.key).sort()

        expect(catalogKeys).toEqual(defaultKeys)
        expect(new Set(catalogKeys).size).toBe(catalogKeys.length)
    })

    it("marks current index-refresh settings", () => {
        expect(settingRefreshesIndex("respectNewFileFolderPath")).toBe(true)
        expect(settingRefreshesIndex("includeAliases")).toBe(true)
        expect(settingRefreshesIndex("proximityBasedLinking")).toBe(true)
        expect(settingRefreshesIndex("ignoreDateFormats")).toBe(true)
        expect(settingRefreshesIndex("ignoreCase")).toBe(true)
        expect(settingRefreshesIndex("preventSelfLinking")).toBe(true)
        expect(settingRefreshesIndex("excludeDirsFromAutoLinking")).toBe(true)
        expect(settingRefreshesIndex("removeAliasInDirs")).toBe(true)
        expect(settingRefreshesIndex("debug")).toBe(false)
    })
})

describe("settings projections", () => {
    it("projects link replacement settings", () => {
        expect(projectReplaceLinksSettings({
            ...DEFAULT_SETTINGS,
            proximityBasedLinking: false,
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        }, "pages")).toEqual({
            proximityBasedLinking: false,
            baseDir: "pages",
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        })
    })

    it("projects URL formatting settings", () => {
        expect(projectUrlFormattingSettings({
            ...DEFAULT_SETTINGS,
            formatGitHubURLs: false,
            githubEnterpriseURLs: ["github.enterprise.com"],
            formatJiraURLs: false,
            jiraURLs: ["jira.example.com"],
            formatLinearURLs: true,
        })).toEqual({
            formatGitHubURLs: false,
            githubEnterpriseURLs: ["github.enterprise.com"],
            formatJiraURLs: false,
            jiraURLs: ["jira.example.com"],
            formatLinearURLs: true,
        })
    })
})
