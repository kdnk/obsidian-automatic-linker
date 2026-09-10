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

    it("groups settings by user workflow in display order", () => {
        const expectedGroups = [
            {
                group: "Formatting Workflow",
                keys: [
                    "normalizeListIndent",
                    "formatOnSave",
                    "formatDelayMs",
                    "runPrettierAfterFormatting",
                    "runLinterAfterFormatting",
                ],
            },
            {
                group: "Link Behavior",
                keys: [
                    "respectNewFileFolderPath",
                    "proximityBasedLinking",
                    "includeAliases",
                    "removeAliasInDirs",
                    "ignoreCase",
                    "matchSentenceCase",
                ],
            },
            {
                group: "Exclusions",
                keys: [
                    "preventSelfLinking",
                    "ignoreDateFormats",
                    "ignoreHeadings",
                    "ignoreMarkdownTables",
                    "excludeDirsFromAutoLinking",
                ],
            },
            {
                group: "URL Formatting",
                keys: [
                    "formatGitHubURLs",
                    "githubEnterpriseURLs",
                    "formatJiraURLs",
                    "jiraURLs",
                    "formatLinearURLs",
                    "replaceUrlWithTitle",
                    "replaceUrlWithTitleIgnoreDomains",
                ],
            },
            {
                group: "Diagnostics",
                keys: ["showNotice", "debug"],
            },
        ]

        const actualGroups = SETTINGS_CATALOG.reduce<Array<{
            group: string
            keys: Array<keyof typeof DEFAULT_SETTINGS>
        }>>((groups, entry) => {
            const currentGroup = groups[groups.length - 1]
            if (currentGroup?.group === entry.group) {
                currentGroup.keys.push(entry.key)
                return groups
            }

            groups.push({
                group: entry.group,
                keys: [entry.key],
            })
            return groups
        }, [])

        expect(actualGroups).toEqual(expectedGroups)
    })

    it("marks only the URL textarea settings for explicit sizing", () => {
        const sizedTextareaKeys = SETTINGS_CATALOG
            .filter(entry => entry.control === "textarea")
            .filter(entry => (entry as { rows?: number }).rows === 4)
            .filter(entry => (entry as { cols?: number }).cols === 50)
            .map(entry => entry.key)
            .sort()

        expect(sizedTextareaKeys).toEqual([
            "githubEnterpriseURLs",
            "jiraURLs",
            "replaceUrlWithTitleIgnoreDomains",
        ])
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
