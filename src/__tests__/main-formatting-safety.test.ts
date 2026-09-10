import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SETTINGS } from "../settings/settings-info"
import AutomaticLinkerPlugin from "../main"
import { EditorState, TransactionSpec } from "@codemirror/state"

const requestMock = vi.hoisted(() => vi.fn())
const notices = vi.hoisted(() => [] as string[])

vi.mock("obsidian", () => ({
    App: class {},
    Editor: class {},
    MarkdownView: class {},
    TFile: class {},
    Notice: class { constructor(message: string) { notices.push(message) } },
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
        cm: { dispatch: vi.fn((spec: TransactionSpec) => {
            content = EditorState.create({ doc: content }).update(spec).state.doc.toString()
        }) },
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
        plugins: { plugins: {} as Record<string, unknown> },
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
    notices.length = 0
})

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((finish) => {
        resolve = finish
    })
    return { promise, resolve }
}

function formatterFixture() {
    vi.useFakeTimers()
    const f = fixture()
    f.plugin.settings.replaceUrlWithTitle = false
    f.plugin.settings.runPrettierAfterFormatting = true
    f.plugin.settings.runLinterAfterFormatting = true
    f.setContent("before")
    return f
}

describe("formatter coordination", () => {
    it("leaves indentation to external formatters even with a legacy cleanup setting", async () => {
        const f = formatterFixture()
        const gate = deferred()
        f.app.plugins.plugins["prettier-format"] = { async format() {
            f.setContent("- root\n  - child")
        } }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor() {
            await gate.promise
            f.setContent("- root\n      - child")
        } }
        const first = f.plugin.formatThenRunPrettierAndLinter()
        await vi.advanceTimersByTimeAsync(20)
        gate.resolve()
        await first
        expect(f.editor.getValue()).toBe("- root\n      - child")
        expect(f.editor.cm.dispatch).not.toHaveBeenCalled()

        Object.assign(f.plugin.settings, { normalizeListIndent: true })
        const second = f.plugin.formatThenRunPrettierAndLinter()
        await vi.runAllTimersAsync()
        await second
        expect(f.editor.getValue()).toBe("- root\n      - child")
        expect(f.editor.cm.dispatch).not.toHaveBeenCalled()
    })

    it("does not normalize indentation without external formatters", async () => {
        const f = fixture()
        f.plugin.settings.replaceUrlWithTitle = false
        Object.assign(f.plugin.settings, { normalizeListIndent: true })
        f.setContent("- root\n      - child")
        await f.plugin.formatThenRunPrettierAndLinter()
        expect(f.editor.getValue()).toBe("- root\n      - child")
        await f.plugin.formatThenRunPrettierAndLinter()
        expect(f.editor.cm.dispatch).not.toHaveBeenCalled()
    })

    it("rejects a formatter that cannot report completion", async () => {
        const f = formatterFixture()
        f.app.plugins.plugins["prettier-format"] = { format: () => true }
        const result = f.plugin.formatThenRunPrettierAndLinter().then(() => null, error => error)
        await vi.runAllTimersAsync()
        expect(await result).toMatchObject({ message: expect.stringMatching(/completion Promise/) })
        expect(f.app.commands.executeCommandById).not.toHaveBeenCalled()
    })

    it("retains only the newest note requested while a formatter is running", async () => {
        const f = formatterFixture()
        const gate = deferred()
        const events: string[] = []
        f.app.plugins.plugins["prettier-format"] = { async format() {
            events.push("prettier " + f.app.workspace.getActiveFile().path)
            await gate.promise
        } }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor() {
            events.push("linter " + f.app.workspace.getActiveFile().path)
        } }
        const requests = [f.plugin.formatThenRunPrettierAndLinter()]
        await vi.advanceTimersByTimeAsync(10)
        for (const path of ["B.md", "C.md"]) {
            const file = { path }
            f.app.workspace.getActiveFile.mockReturnValue(file)
            f.app.workspace.getActiveViewOfType.mockReturnValue({ ...f.view, file })
            requests.push(f.plugin.formatThenRunPrettierAndLinter())
        }
        gate.resolve()
        await vi.runAllTimersAsync()
        await Promise.all(requests)
        expect(events).toEqual(["prettier A.md", "prettier C.md", "linter C.md"])
    })

    it("lints Prettier's completed output even when command callbacks return immediately", async () => {
        const f = formatterFixture()
        const gate = deferred()
        const completed: string[] = []
        f.app.plugins.plugins["prettier-format"] = { async format() {
            await gate.promise
            f.setContent("formatted")
            completed.push("prettier")
        } }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor(editor: typeof f.editor) {
            completed.push(editor.getValue())
            editor.setValue(editor.getValue() + " linted")
        } }
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        await vi.advanceTimersByTimeAsync(100)
        expect(completed).toEqual([])
        gate.resolve()
        await vi.runAllTimersAsync()
        await pending
        expect(completed).toEqual(["prettier", "formatted"])
        expect(f.editor.getValue()).toBe("formatted linted")
        expect(f.app.commands.executeCommandById).not.toHaveBeenCalled()
    })

    it("coalesces repeated requests into one trailing run without overlapping formatters", async () => {
        const f = formatterFixture()
        const gate = deferred()
        const events: string[] = []
        f.app.plugins.plugins["prettier-format"] = { async format() {
            events.push("prettier start")
            await gate.promise
            events.push("prettier end")
        } }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor() {
            events.push("lint")
        } }
        const first = f.plugin.formatThenRunPrettierAndLinter()
        await vi.advanceTimersByTimeAsync(10)
        const second = f.plugin.formatThenRunPrettierAndLinter()
        const third = f.plugin.formatThenRunPrettierAndLinter()
        await vi.advanceTimersByTimeAsync(100)
        expect(events).toEqual(["prettier start"])
        gate.resolve()
        await vi.runAllTimersAsync()
        await Promise.all([first, second, third])
        expect(events).toEqual(["prettier start", "prettier end", "lint", "prettier start", "prettier end", "lint"])
    })

    it("cancels downstream formatting after navigation during Prettier", async () => {
        const f = formatterFixture()
        const gate = deferred()
        f.app.plugins.plugins["prettier-format"] = { format: () => gate.promise }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor() {
            f.setContent("wrong note linted")
        } }
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        await vi.advanceTimersByTimeAsync(10)
        f.switchFile()
        gate.resolve()
        await vi.runAllTimersAsync()
        await pending
        expect(f.editor.getValue()).toBe("before")
    })

    it("stops on formatter errors and allows the next request to recover", async () => {
        const f = formatterFixture()
        f.app.plugins.plugins["prettier-format"] = { async format() {
            throw Error("formatter failed")
        } }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor() {
            f.setContent("linted")
        } }
        const failed = expect(f.plugin.formatThenRunPrettierAndLinter()).rejects.toThrow("formatter failed")
        await vi.runAllTimersAsync()
        await failed
        expect(f.editor.getValue()).toBe("before")
        f.app.plugins.plugins["prettier-format"] = { async format() {
            f.setContent("formatted")
        } }
        const retry = f.plugin.formatThenRunPrettierAndLinter()
        await vi.runAllTimersAsync()
        await retry
        expect(f.editor.getValue()).toBe("linted")
    })

    it("fails safely for unsupported integrations instead of invoking fire-and-forget commands", async () => {
        const f = formatterFixture()
        f.app.plugins.plugins["prettier-format"] = {}
        const failed = expect(f.plugin.formatThenRunPrettierAndLinter()).rejects.toThrow(/Prettier/)
        await vi.runAllTimersAsync()
        await failed
        expect(f.app.commands.executeCommandById).not.toHaveBeenCalled()
        expect(f.editor.getValue()).toBe("before")
    })

    it("warns about duplicate save hooks without changing other plugin settings", async () => {
        const f = formatterFixture()
        f.plugin.settings.formatOnSave = true
        const prettierSettings = { formatOnSave: true }
        const linterSettings = { lintOnSave: true }
        f.app.plugins.plugins["prettier-format"] = { settings: prettierSettings, async format() {} }
        f.app.plugins.plugins["obsidian-linter"] = { settings: linterSettings, async runLinterEditor() {} }
        for (let i = 0; i < 2; i++) {
            const pending = f.plugin.formatThenRunPrettierAndLinter()
            await vi.runAllTimersAsync()
            await pending
        }
        expect(notices).toHaveLength(1)
        expect(notices[0]).toMatch(/Prettier/)
        expect(notices[0]).toMatch(/Linter/)
        expect(prettierSettings).toEqual({ formatOnSave: true })
        expect(linterSettings).toEqual({ lintOnSave: true })
    })

    it("drops queued work and downstream integrations when unloaded", async () => {
        const f = formatterFixture()
        const gate = deferred()
        const events: string[] = []
        f.app.plugins.plugins["prettier-format"] = { async format() {
            events.push("prettier")
            await gate.promise
        } }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor() {
            events.push("lint")
        } }
        const first = f.plugin.formatThenRunPrettierAndLinter()
        await vi.advanceTimersByTimeAsync(10)
        const second = f.plugin.formatThenRunPrettierAndLinter()
        f.plugin.onunload()
        gate.resolve()
        await vi.runAllTimersAsync()
        await Promise.all([first, second])
        expect(events).toEqual(["prettier"])
    })
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

describe("selection Markdown context", () => {
    it.each([
        "```ts\nA\n```",
        "~~~\nA\n~~~",
        "```ts\nA",
        "`A`",
        "[[A]]",
        "[A](https://example.com)",
        "https://example.com/A",
        "# A",
        "| A | other |",
        "> [!note]\n> A",
    ])("preserves a partial selection in protected Markdown: %s", async (content) => {
        const f = fixture()
        f.setContent(content)
        f.editor.getSelection = () => "A"
        f.editor.posToOffset = () => content.indexOf("A")
        f.plugin.settings.ignoreHeadings = true
        f.plugin.settings.ignoreMarkdownTables = true
        f.plugin.refreshFileDataAndTrie()

        await f.plugin.mofifyLinksSelection()

        expect(f.editor.replaceSelection).not.toHaveBeenCalled()
    })

    it("formats only selected prose when a selection starts inside code", async () => {
        const f = fixture()
        const content = "A\n```\nA\n```\nA\nA"
        f.setContent(content)
        f.editor.getSelection = () => "A\n```\nA"
        f.editor.posToOffset = () => 6
        f.plugin.refreshFileDataAndTrie()

        await f.plugin.mofifyLinksSelection()

        expect(f.editor.replaceSelection).toHaveBeenCalledWith("A\n```\n[[A]]")
    })

    it("formats body selections after frontmatter using document offsets", async () => {
        const f = fixture()
        const content = "---\naliases: A\n---\n`A` and A"
        f.setContent(content)
        f.editor.getSelection = () => "A"
        f.editor.posToOffset = () => content.lastIndexOf("A")
        f.plugin.refreshFileDataAndTrie()

        await f.plugin.mofifyLinksSelection()

        expect(f.editor.replaceSelection).toHaveBeenCalledWith("[[A]]")
    })
})

describe("URL title domain exclusions", () => {
    it("honors new exclusions even when a URL title is already cached", async () => {
        const f = fixture()
        requestMock.mockResolvedValue("<title>Example</title>")
        await f.plugin.formatThenRunPrettierAndLinter()
        expect(f.editor.getValue()).toBe("[Example](https://example.com)")

        f.setContent("https://example.com")
        f.plugin.settings.replaceUrlWithTitleIgnoreDomains = ["example.com"]
        await f.plugin.formatThenRunPrettierAndLinter()

        expect(f.editor.getValue()).toBe("https://example.com")
        expect(requestMock).toHaveBeenCalledTimes(1)

        f.plugin.settings.replaceUrlWithTitleIgnoreDomains = []
        await f.plugin.formatThenRunPrettierAndLinter()
        expect(f.editor.getValue()).toBe("[Example](https://example.com)")
        expect(requestMock).toHaveBeenCalledTimes(1)
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
        const events: string[] = []
        f.app.plugins.plugins["prettier-format"] = { async format() {
            events.push("prettier")
        } }
        f.app.plugins.plugins["obsidian-linter"] = { async runLinterEditor() {
            events.push("linter")
        } }
        const pending = f.plugin.formatThenRunPrettierAndLinter()
        await vi.runAllTimersAsync()
        await pending
        expect(events).toEqual(["prettier", "linter"])
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
