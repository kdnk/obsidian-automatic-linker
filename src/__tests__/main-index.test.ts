import { describe, expect, it, vi } from "vitest"
import AutomaticLinkerPlugin from "../main"
import { DEFAULT_SETTINGS } from "../settings/settings-info"

vi.mock("obsidian", () => ({
    MarkdownView: class {},
    TFile: class {},
    Notice: class {},
    getFrontMatterInfo: () => ({ contentStart: 0 }),
    parseFrontMatterAliases: (frontmatter?: { aliases?: string[] }) => frontmatter?.aliases ?? [],
    PluginSettingTab: class {},
    Plugin: class {
        constructor(public app: unknown) {}
        addSettingTab() {}
        addCommand() {}
        registerEvent() {}
    },
}))

function fixture() {
    const files = [{ path: "Note.md" }, { path: "Target.md" }]
    const frontmatter = new Map<string, Record<string, unknown>>([
        ["Target.md", { aliases: ["old alias"] }],
    ])
    const handlers = new Map<string, (file: { path: string }) => void>()
    const getMarkdownFiles = vi.fn(() => files)
    const app = {
        workspace: { onLayoutReady: (callback: () => void) => callback() },
        metadataCache: {
            getFileCache: (file: { path: string }) => ({ frontmatter: frontmatter.get(file.path) }),
            on: (event: string, callback: (file: { path: string }) => void) => handlers.set(event, callback),
        },
        vault: {
            getMarkdownFiles,
            getConfig: () => "",
            getAbstractFileByPath: () => null,
            on: (event: string, callback: (file: { path: string }) => void) => handlers.set(event, callback),
        },
        commands: { commands: { "editor:save-file": { checkCallback: () => true } } },
    }
    const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
    plugin.settings = { ...DEFAULT_SETTINGS }
    ;(plugin as unknown as { initializePlugin: () => void }).initializePlugin()
    return {
        plugin, files, frontmatter, getMarkdownFiles,
        emit: (event: string, file = files[1]) => handlers.get(event)!(file),
    }
}

describe("candidate index metadata cache", () => {
    it("does not rescan the vault on the first body-only change of each note", () => {
        const f = fixture()
        f.getMarkdownFiles.mockClear()

        for (const file of f.files) f.emit("changed", file)

        expect(f.getMarkdownFiles).not.toHaveBeenCalled()
        expect(f.plugin.modifyLinks("old alias", "Note.md")).toBe("[[Target|old alias]]")
    })

    it("updates aliases when metadata changes and skips subsequent body changes", () => {
        const f = fixture()
        f.frontmatter.set("Target.md", { aliases: ["new alias"] })
        f.getMarkdownFiles.mockClear()
        f.emit("changed")

        expect(f.plugin.modifyLinks("old alias and new alias", "Note.md")).toBe("old alias and [[Target|new alias]]")
        expect(f.getMarkdownFiles).toHaveBeenCalledTimes(1)
        f.emit("changed")
        expect(f.getMarkdownFiles).toHaveBeenCalledTimes(1)
    })

    it("keeps metadata change detection active for excluded link targets", () => {
        const f = fixture()
        f.frontmatter.set("Target.md", { "automatic-linker-exclude": true })
        f.emit("changed")
        expect(f.plugin.modifyLinks("Target", "Note.md")).toBe("Target")

        f.frontmatter.set("Target.md", {})
        f.emit("changed")
        expect(f.plugin.modifyLinks("Target", "Note.md")).toBe("[[Target]]")
    })

    it("seeds cache entries for renamed files during a rebuild", () => {
        const f = fixture()
        f.files[1].path = "Renamed.md"
        f.emit("rename")
        f.getMarkdownFiles.mockClear()
        f.emit("changed")

        expect(f.getMarkdownFiles).not.toHaveBeenCalled()
        expect(f.plugin.modifyLinks("Renamed", "Note.md")).toBe("[[Renamed]]")
    })

    it("updates all metadata snapshots when explicitly rebuilding the index", () => {
        const f = fixture()
        f.frontmatter.set("Target.md", { aliases: ["updated alias"] })
        f.plugin.refreshFileDataAndTrie()
        f.getMarkdownFiles.mockClear()
        f.emit("changed")

        expect(f.getMarkdownFiles).not.toHaveBeenCalled()
        expect(f.plugin.modifyLinks("updated alias", "Note.md")).toBe("[[Target|updated alias]]")
    })
})
