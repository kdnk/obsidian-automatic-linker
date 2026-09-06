import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SETTINGS } from "../settings/settings-info"
import AutomaticLinkerPlugin from "../main"

const requestMock = vi.hoisted(() => vi.fn())

vi.mock("obsidian", () => ({
    App: class {},
    Editor: class {},
    MarkdownView: class {},
    TFile: class {},
    Notice: class {},
    parseFrontMatterAliases: () => [],
    getFrontMatterInfo: (content: string) => ({
        contentStart: content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)?.[0].length ?? 0,
    }),
    request: requestMock,
    PluginSettingTab: class {},
    Plugin: class {
        app: unknown
        commands: Array<{ id: string, editorCallback: () => Promise<void> }> = []
        constructor(app: unknown) { this.app = app }
        addCommand(command: never) { this.commands.push(command) }
        addSettingTab() {}
    },
}))

vi.mock("../update-editor", () => ({
    updateEditor: (_oldText: string, newText: string, editor: { setValue: (text: string) => void }) => editor.setValue(newText),
}))

function fixture() {
    vi.stubGlobal("window", globalThis)
    let content = "https://example.com"
    let frontmatter: Record<string, unknown> = {}
    const file = { path: "A.md" }
    const editor = {
        getValue: () => content,
        setValue: vi.fn((value: string) => { content = value }),
        getSelection: () => "TypeScript",
        getCursor: () => ({ line: 0, ch: 0 }),
        posToOffset: () => 0,
        replaceSelection: vi.fn(),
    }
    const view = { file, editor }
    const originalSave = vi.fn((_checking: boolean) => true)
    const save = { checkCallback: originalSave }
    const app = {
        workspace: {
            getActiveFile: vi.fn(() => file),
            getActiveViewOfType: vi.fn(() => view),
            activeEditor: { editor },
            onLayoutReady: vi.fn(),
        },
        metadataCache: { getFileCache: () => ({ frontmatter }) },
        vault: {
            read: vi.fn(async () => "https://stale.example.com"),
            getMarkdownFiles: () => [file],
            getConfig: () => "",
            getAbstractFileByPath: () => null,
            process: vi.fn(async (_file: unknown, transform: (s: string) => string) => { content = transform(content) }),
        },
        commands: {
            commands: { "editor:save-file": save },
            executeCommandById: vi.fn(),
        },
    }
    const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
    plugin.settings = { ...DEFAULT_SETTINGS, formatDelayMs: 10 }
    return {
        plugin, app, editor, view, file, save, originalSave,
        setContent: (value: string) => { content = value },
        disable: () => { frontmatter = { "automatic-linker-off": true } },
        switchFile: () => { app.workspace.getActiveFile.mockReturnValue({ path: "B.md" }) },
    }
}

function deferredTitle() {
    let finish!: (value: string) => void
    requestMock.mockImplementation(() => new Promise<string>((resolve) => {
        finish = resolve
    }))
    return () => finish("<title>Example</title>")
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    requestMock.mockReset()
})

describe("formatting safety", () => {
    it("cancels formatting if the active file changes while fetching titles", async () => {
        const f = fixture()
        const finish = deferredTitle()
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalled())
        f.switchFile()
        finish()
        await pending
        expect(f.editor.setValue).not.toHaveBeenCalled()
        expect(f.app.commands.executeCommandById).not.toHaveBeenCalled()
    })

    it("fetches the editor's URLs and preserves edits made while fetching", async () => {
        const f = fixture()
        const finish = deferredTitle()
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalled())
        f.setContent("https://example.com appended text")
        finish()
        await pending
        expect(requestMock).toHaveBeenCalledWith("https://example.com")
        expect(f.editor.getValue()).toBe("[Example](https://example.com) appended text")
    })

    it("does not run integrations after switching tabs during their delay", async () => {
        vi.useFakeTimers()
        const f = fixture()
        f.plugin.settings.replaceUrlWithTitle = false
        f.plugin.settings.runPrettierAfterFormatting = true
        f.plugin.settings.runLinterAfterFormatting = true
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        f.switchFile()
        await vi.runAllTimersAsync()
        await pending
        expect(f.app.commands.executeCommandById).not.toHaveBeenCalled()
    })

    it("captures the save target before waiting without changing original save behavior", async () => {
        vi.useFakeTimers()
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        f.plugin.settings.replaceUrlWithTitle = false
        ;(f.plugin as unknown as { initializePlugin: () => void }).initializePlugin()
        f.save.checkCallback(false)
        f.switchFile()
        await vi.runAllTimersAsync()
        expect(f.originalSave).not.toHaveBeenCalled()
        expect(f.editor.setValue).not.toHaveBeenCalled()
    })

    it("skips disabled notes during vault formatting", async () => {
        const f = fixture()
        f.disable()
        f.setContent("https://github.com/a/b/issues/1")
        await f.plugin.modifyLinksForVault()
        expect(f.editor.getValue()).toBe("https://github.com/a/b/issues/1")
    })

    it("skips fetching, formatting and integrations for disabled notes", async () => {
        const f = fixture()
        f.disable()
        f.plugin.settings.runLinterAfterFormatting = true
        requestMock.mockResolvedValue("<title>Example</title>")
        await f.plugin.formatThenRunPrettierAndLinter()
        expect(requestMock).not.toHaveBeenCalled()
        expect(f.editor.setValue).not.toHaveBeenCalled()
        expect(f.app.commands.executeCommandById).not.toHaveBeenCalled()
    })

    it("skips selection formatting in disabled notes", async () => {
        const f = fixture()
        f.disable()
        f.plugin.refreshFileDataAndTrie()
        await f.plugin.mofifyLinksSelection()
        expect(f.editor.replaceSelection).not.toHaveBeenCalled()
    })
})

describe("selection frontmatter safety", () => {
    it("preserves a selection entirely inside frontmatter", async () => {
        const f = fixture()
        const header = "---\naliases: A\n---\n"
        f.setContent(header + "A")
        f.editor.getSelection = () => "A"
        f.editor.posToOffset = () => header.indexOf("A")
        f.plugin.refreshFileDataAndTrie()
        await f.plugin.mofifyLinksSelection()
        expect(f.editor.replaceSelection).not.toHaveBeenCalled()
    })

    it("formats only the body portion of a selection crossing frontmatter", async () => {
        const f = fixture()
        const header = "---\naliases: A\n---\n"
        f.setContent(header + "A")
        f.editor.getSelection = () => header + "A"
        f.plugin.refreshFileDataAndTrie()
        await f.plugin.mofifyLinksSelection()
        expect(f.editor.replaceSelection).toHaveBeenCalledWith(header + "[[A]]")
    })
})

describe("formatting target validation", () => {
    it.each(["editor", "rename", "disable"])("cancels pending formatting on %s changes", async (change) => {
        const f = fixture()
        const finish = deferredTitle()
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalled())
        if (change === "editor") {
            f.app.workspace.getActiveViewOfType.mockReturnValue({
                file: f.file,
                editor: { ...f.editor },
            })
        }
        else if (change === "rename") {
            f.file.path = "renamed.md"
        }
        else {
            f.disable()
        }
        finish()
        await pending
        expect(f.editor.setValue).not.toHaveBeenCalled()
    })

    it("runs integrations in order when the target stays active", async () => {
        vi.useFakeTimers()
        const f = fixture()
        f.plugin.settings.replaceUrlWithTitle = false
        f.plugin.settings.runPrettierAfterFormatting = true
        f.plugin.settings.runLinterAfterFormatting = true
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        await vi.runAllTimersAsync()
        await pending
        expect(f.app.commands.executeCommandById.mock.calls).toEqual([
            ["prettier-format:format-file"],
            ["obsidian-linter:lint-file"],
        ])
    })

    it("keeps the original save action suppressed with formatting on or off", async () => {
        vi.useFakeTimers()
        const f = fixture()
        f.plugin.settings.replaceUrlWithTitle = false
        ;(f.plugin as unknown as { initializePlugin: () => void }).initializePlugin()
        f.save.checkCallback(false)
        expect(f.editor.setValue).not.toHaveBeenCalled()
        f.plugin.settings.formatOnSave = true
        f.save.checkCallback(false)
        await vi.runAllTimersAsync()
        expect(f.editor.setValue).toHaveBeenCalledTimes(1)
        expect(f.originalSave).not.toHaveBeenCalled()
        expect(f.save.checkCallback(true)).toBe(true)
        expect(f.originalSave).toHaveBeenCalledWith(true)
    })
})
