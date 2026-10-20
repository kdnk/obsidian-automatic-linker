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
    getFrontMatterInfo: (content: string) => {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
        return { contentStart: match?.[0].length ?? 0, frontmatter: match?.[1] ?? "" }
    },
    parseYaml: (yaml: string) => Object.fromEntries(yaml.split("\n").filter(line => line.includes(":"))
        .map((line) => {
            const [key, value] = line.split(":")
            return [key.trim(), value.trim() === "true" ? true : value.trim()]
        })),
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
    const persisted = new Map<string, string>()
    const view = {
        file,
        editor,
        containerEl: { isConnected: true },
        save: vi.fn(async () => {
            persisted.set(view.file.path, view.editor.getValue())
        }),
    }
    const originalSave = vi.fn((checking: boolean) => {
        if (!checking) void app.workspace.getActiveViewOfType().save()
        return true
    })
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
    plugin.settings = { ...DEFAULT_SETTINGS }
    return {
        plugin, app, editor, view, file, save, originalSave, persisted,
        setContent: (value: string) => { content = value },
        disable: (key = "automatic-linker-off") => {
            frontmatter = { [key]: true }
            content = `---\n${key}: true\n---\n${content}`
        },
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

function initialize(plugin: AutomaticLinkerPlugin) {
    ;(plugin as unknown as { initializePlugin: () => void }).initializePlugin()
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((complete, fail) => {
        resolve = complete
        reject = fail
    })
    return { promise, resolve, reject }
}

describe("text formatting API", () => {
    it("formats supplied text with title lookup without reading or writing an editor", async () => {
        const f = fixture()
        requestMock.mockResolvedValue("<title>Example</title>")
        const result = await f.plugin.formatText("https://example.com", f.file as never)
        expect(result).toBe("[Example](https://example.com)")
        expect(f.editor.getValue()).toBe("https://example.com")
        expect(f.editor.setValue).not.toHaveBeenCalled()
        expect(f.app.vault.read).not.toHaveBeenCalled()
    })

    it("keeps the supplied text snapshot separate from typing during title lookup", async () => {
        const f = fixture()
        const finish = deferredTitle()
        const pending = f.plugin.formatText("https://example.com", f.file as never)
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
        f.setContent("https://example.com typed")
        finish()
        expect(await pending).toBe("[Example](https://example.com)")
        expect(f.editor.getValue()).toBe("https://example.com typed")
    })

    it.each(["automatic-linker-off", "automatic-linker-disabled"])(
        "reads %s from the supplied frontmatter instead of metadata cache", async (key) => {
            const f = fixture()
            requestMock.mockResolvedValue("<title>Example</title>")
            const text = `---\n${key}: true\n---\nhttps://example.com`
            expect(await f.plugin.formatText(text, f.file as never)).toBe(text)
            expect(requestMock).not.toHaveBeenCalled()
            expect(await f.plugin.formatText("https://example.com", f.file as never))
                .toBe("[Example](https://example.com)")
        },
    )

    it("honors URL title opt-out while retaining other URL formatting", async () => {
        const f = fixture()
        const text = "---\nautomatic-linker-disable-url-title: true\n---\nhttps://github.com/a/b/issues/1 https://example.com"
        expect(await f.plugin.formatText(text, f.file as never))
            .toBe("---\nautomatic-linker-disable-url-title: true\n---\n[[github/a/b/issues/1]] [🔗](https://github.com/a/b/issues/1) https://example.com")
        expect(requestMock).not.toHaveBeenCalled()
    })

    it("preserves excluded folders without fetching titles", async () => {
        const f = fixture()
        f.plugin.settings.excludeDirsFromAutoLinking = ["templates"]
        const text = "https://example.com"
        expect(await f.plugin.formatText(text, { path: "templates/Test.md" } as never)).toBe(text)
        expect(requestMock).not.toHaveBeenCalled()
        requestMock.mockResolvedValue("<title>Example</title>")
        expect(await f.plugin.formatText(text, { path: "templates-other/Test.md" } as never))
            .toBe("[Example](https://example.com)")
    })

    it("keeps URL lookup results local to concurrent transforms", async () => {
        const f = fixture()
        const firstShared = deferred<string>()
        const secondShared = deferred<string>()
        const firstTail = deferred<string>()
        const secondTail = deferred<string>()
        requestMock.mockReturnValueOnce(firstShared.promise)
            .mockReturnValueOnce(secondShared.promise)
            .mockReturnValueOnce(firstTail.promise)
            .mockReturnValueOnce(secondTail.promise)
        const first = f.plugin.formatText("https://shared.test https://first.test", f.file as never)
        const second = f.plugin.formatText("https://shared.test https://second.test", f.file as never)
        firstShared.resolve("<title>First shared title</title>")
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3))
        secondShared.resolve("<title>Second shared title</title>")
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(4))
        secondTail.resolve("<title>Second tail</title>")
        expect(await second).toBe("[Second shared title](https://shared.test) [Second tail](https://second.test)")
        firstTail.resolve("<title>First tail</title>")
        expect(await first).toBe("[First shared title](https://shared.test) [First tail](https://first.test)")
    })
})

describe("standalone link commands", () => {
    it("runs format-file as link-only even when formatter plugins are installed", async () => {
        const f = fixture()
        requestMock.mockResolvedValue("<title>Example</title>")
        const formatter = vi.fn()
        f.app.plugins.plugins["prettier-format"] = { format: formatter }
        f.app.plugins.plugins["obsidian-linter-plus"] = { runLinterEditor: formatter }
        initialize(f.plugin)
        const command = (f.plugin as unknown as {
            commands: Array<{ id: string, editorCallback: () => Promise<void> }>
        }).commands.find(({ id }) => id === "format-file")
        await command?.editorCallback()
        expect(f.editor.getValue()).toBe("[Example](https://example.com)")
        expect(formatter).not.toHaveBeenCalled()
    })

    it.each(["file", "editor", "rename", "unload"])(
        "discards pending editor writes after %s changes", async (change) => {
            const f = fixture()
            const finish = deferredTitle()
            const pending = f.plugin.formatActiveFile()
            await vi.waitFor(() => expect(requestMock).toHaveBeenCalled())
            if (change === "file") f.switchFile()
            if (change === "editor") f.app.workspace.getActiveViewOfType.mockReturnValue({ ...f.view, editor: { ...f.editor } })
            if (change === "rename") f.file.path = "renamed.md"
            if (change === "unload") f.plugin.onunload()
            finish()
            await pending
            expect(f.editor.getValue()).toBe("https://example.com")
            expect(f.editor.setValue).not.toHaveBeenCalled()
        },
    )

    it("formats the latest editor text with fetched titles while preserving typing", async () => {
        const f = fixture()
        const finish = deferredTitle()
        const pending = f.plugin.formatActiveFile()
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
        f.setContent("https://example.com typed https://new.test")
        finish()
        await pending
        expect(f.editor.getValue()).toBe("[Example](https://example.com) typed https://new.test")
        expect(requestMock).toHaveBeenCalledExactlyOnceWith("https://example.com")
    })

    it.each(["automatic-linker-off", "automatic-linker-disabled", "automatic-linker-disable-url-title"])(
        "honors %s added during title lookup", async (key) => {
            const f = fixture()
            const finish = deferredTitle()
            const pending = f.plugin.formatActiveFile()
            await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
            f.disable(key)
            finish()
            await pending
            expect(f.editor.getValue()).toBe(`---\n${key}: true\n---\nhttps://example.com`)
            expect(requestMock).toHaveBeenCalledTimes(1)
        },
    )

    it("honors folder exclusions added while typing during title lookup", async () => {
        const f = fixture()
        f.file.path = "templates/A.md"
        const finish = deferredTitle()
        const pending = f.plugin.formatActiveFile()
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
        f.plugin.settings.excludeDirsFromAutoLinking = ["templates"]
        f.setContent("https://example.com typed")
        finish()
        await pending
        expect(f.editor.getValue()).toBe("https://example.com typed")
        expect(requestMock).toHaveBeenCalledTimes(1)
    })

    it("coalesces repeated requests into one trailing run with fresh text", async () => {
        const f = fixture()
        const gate = deferred<string>()
        requestMock.mockReturnValueOnce(gate.promise).mockResolvedValue("<title>Second</title>")
        const first = f.plugin.formatActiveFile()
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
        f.setContent("https://second.test")
        const second = f.plugin.formatActiveFile()
        const third = f.plugin.formatActiveFile()
        gate.resolve("<title>Example</title>")
        await Promise.all([first, second, third])
        expect(f.editor.getValue()).toBe("[Second](https://second.test)")
        expect(requestMock).toHaveBeenCalledTimes(2)
        expect(f.editor.setValue).toHaveBeenCalledTimes(1)
    })
})

describe("save callback ownership", () => {
    it("reports no ownership until settings finish loading", () => {
        const f = fixture()
        const plugin = new AutomaticLinkerPlugin(f.app as never, {} as never)
        expect(plugin.isFormatOnSaveEnabled()).toBe(false)
        plugin.settings = { ...DEFAULT_SETTINGS, formatOnSave: true }
        expect(plugin.isFormatOnSaveEnabled()).toBe(true)
    })

    it("delegates native save immediately when linker formatting is disabled", () => {
        const f = fixture()
        initialize(f.plugin)
        expect(f.plugin.isFormatOnSaveEnabled()).toBe(false)
        expect(f.save.checkCallback(false)).toBe(true)
        expect(f.originalSave).toHaveBeenCalledExactlyOnceWith(false)
    })

    it.each(["linker first", "bullet first"])("delegates to Bullet with %s", (order) => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        const events: string[] = []
        const installBullet = () => {
            const previous = f.save.checkCallback
            f.save.checkCallback = vi.fn((checking: boolean) => {
                if (!checking) events.push("bullet")
                return previous(checking)
            })
            f.app.plugins.plugins.bullet = { ownsExplicitSaveFormatting: () => true }
        }
        if (order === "bullet first") installBullet()
        initialize(f.plugin)
        if (order === "linker first") installBullet()
        expect(f.save.checkCallback(false)).toBe(true)
        expect(events).toEqual(["bullet"])
        expect(f.originalSave).toHaveBeenCalledExactlyOnceWith(false)
        expect(requestMock).not.toHaveBeenCalled()
    })

    it("resumes standalone linking when Bullet ownership is disabled", async () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        f.app.plugins.plugins.bullet = { ownsExplicitSaveFormatting: () => false }
        requestMock.mockResolvedValue("<title>Example</title>")
        initialize(f.plugin)
        expect(f.save.checkCallback(false)).toBe(true)
        await vi.waitFor(() => expect(f.originalSave).toHaveBeenCalledExactlyOnceWith(false))
        expect(f.editor.getValue()).toBe("[Example](https://example.com)")
    })

    it("still saves original text after a formatting error", async () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        vi.spyOn(f.plugin, "formatText").mockRejectedValue(Error("bad YAML"))
        vi.spyOn(console, "error").mockImplementation(() => {})
        initialize(f.plugin)
        f.save.checkCallback(false)
        await vi.waitFor(() => expect(f.originalSave).toHaveBeenCalledExactlyOnceWith(false))
        expect(f.editor.getValue()).toBe("https://example.com")
        expect(notices).toEqual(["Automatic Linker: bad YAML"])
    })

    it("saves converted links and text typed during title lookup without Bullet", async () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        const finish = deferredTitle()
        initialize(f.plugin)
        f.save.checkCallback(false)
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
        f.setContent("https://example.com typed")
        finish()
        await vi.waitFor(() => expect(f.originalSave).toHaveBeenCalledExactlyOnceWith(false))
        expect(f.editor.getValue()).toBe("[Example](https://example.com) typed")
    })

    it("saves each explicit request when runs are coalesced", async () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        const finish = deferredTitle()
        initialize(f.plugin)
        f.save.checkCallback(false)
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
        f.save.checkCallback(false)
        f.save.checkCallback(false)
        finish()
        await vi.waitFor(() => expect(f.originalSave).toHaveBeenCalledTimes(3))
        expect(f.editor.getValue()).toBe("[Example](https://example.com)")
    })

    it.each(["success", "failure", "unload"])("saves the source pane after switching notes during %s", async (action) => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        const gate = deferred<string>()
        vi.spyOn(f.plugin, "formatText").mockReturnValue(gate.promise)
        vi.spyOn(console, "error").mockImplementation(() => {})
        initialize(f.plugin)
        f.save.checkCallback(false)
        await vi.waitFor(() => expect(f.plugin.formatText).toHaveBeenCalledTimes(1))
        const destinationEditor = { ...f.editor, getValue: () => "destination unsaved" }
        const destination = {
            ...f.view,
            file: { path: "B.md" },
            editor: destinationEditor,
            save: vi.fn(async () => { f.persisted.set("B.md", destinationEditor.getValue()) }),
        }
        f.app.workspace.getActiveViewOfType.mockReturnValue(destination)
        f.app.workspace.getActiveFile.mockReturnValue(destination.file)
        if (action === "unload") f.plugin.onunload()
        if (action === "failure") gate.reject(new Error("bad YAML"))
        else gate.resolve("linked source")
        await vi.waitFor(() => expect([...f.persisted]).toEqual([["A.md", "https://example.com"]]))
        expect(destinationEditor.getValue()).toBe("destination unsaved")
        expect(f.originalSave).not.toHaveBeenCalled()
    })

    it("keeps queued intents tied to their note when a view navigates", async () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        const gate = deferred<string>()
        vi.spyOn(f.plugin, "formatText").mockReturnValueOnce(gate.promise).mockResolvedValue("linked destination")
        initialize(f.plugin)
        f.save.checkCallback(false)
        await vi.waitFor(() => expect(f.plugin.formatText).toHaveBeenCalledTimes(1))
        f.save.checkCallback(false)
        await f.view.save()
        f.view.file = { path: "B.md" }
        f.app.workspace.getActiveFile.mockReturnValue(f.view.file)
        f.setContent("destination unsaved")
        f.save.checkCallback(false)
        gate.resolve("stale source")
        await vi.waitFor(() => expect([...f.persisted]).toEqual([
            ["A.md", "https://example.com"],
            ["B.md", "linked destination"],
        ]))
        expect(f.originalSave).toHaveBeenCalledTimes(1)
    })

    it("does not flush a detached source view or the newly active destination", async () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        const gate = deferred<string>()
        vi.spyOn(f.plugin, "formatText").mockReturnValue(gate.promise)
        initialize(f.plugin)
        f.save.checkCallback(false)
        await vi.waitFor(() => expect(f.plugin.formatText).toHaveBeenCalledTimes(1))
        await f.view.save()
        f.view.containerEl.isConnected = false
        f.app.workspace.getActiveViewOfType.mockReturnValue({ ...f.view, file: { path: "B.md" } })
        f.app.workspace.getActiveFile.mockReturnValue({ path: "B.md" })
        gate.resolve("stale source")
        await new Promise(resolve => setImmediate(resolve))
        expect([...f.persisted]).toEqual([["A.md", "https://example.com"]])
        expect(f.originalSave).not.toHaveBeenCalled()
    })

    it("reports a rejected source save without an unhandled rejection", async () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        const gate = deferred<string>()
        vi.spyOn(f.plugin, "formatText").mockReturnValue(gate.promise)
        f.view.save.mockRejectedValueOnce(new Error("disk full"))
        initialize(f.plugin)
        f.save.checkCallback(false)
        await vi.waitFor(() => expect(f.plugin.formatText).toHaveBeenCalledTimes(1))
        f.app.workspace.getActiveViewOfType.mockReturnValue({ ...f.view, file: { path: "B.md" } })
        f.app.workspace.getActiveFile.mockReturnValue({ path: "B.md" })
        gate.resolve("stale source")
        await vi.waitFor(() => expect(notices).toEqual(["Automatic Linker could not save A.md. disk full"]))
        expect([...f.persisted]).toEqual([])
        expect(f.editor.getValue()).toBe("https://example.com")
    })

    it("keeps a later wrapper installed and delegates through an unloaded linker", () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        initialize(f.plugin)
        const linker = f.save.checkCallback
        const wrapper = vi.fn((checking: boolean) => linker(checking))
        f.save.checkCallback = wrapper
        f.plugin.onunload()
        expect(f.save.checkCallback).toBe(wrapper)
        expect(f.plugin.isFormatOnSaveEnabled()).toBe(false)
        expect(f.save.checkCallback(false)).toBe(true)
        expect(f.originalSave).toHaveBeenCalledExactlyOnceWith(false)
    })

    it("forwards availability checks without starting formatting", () => {
        const f = fixture()
        f.plugin.settings.formatOnSave = true
        f.originalSave.mockReturnValue(false)
        initialize(f.plugin)
        expect(f.save.checkCallback(true)).toBe(false)
        expect(f.originalSave).toHaveBeenCalledExactlyOnceWith(true)
    })

    it("restores the captured callback when the linker wrapper is current", () => {
        const f = fixture()
        initialize(f.plugin)
        f.plugin.onunload()
        expect(f.save.checkCallback).toBe(f.originalSave)
        expect(f.save.checkCallback(false)).toBe(true)
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
        await f.plugin.formatActiveFile()
        expect(f.editor.getValue()).toBe("[Example](https://example.com)")

        f.setContent("https://example.com")
        f.plugin.settings.replaceUrlWithTitleIgnoreDomains = ["example.com"]
        await f.plugin.formatActiveFile()

        expect(f.editor.getValue()).toBe("https://example.com")
        expect(requestMock).toHaveBeenCalledTimes(1)

        f.plugin.settings.replaceUrlWithTitleIgnoreDomains = []
        await f.plugin.formatActiveFile()
        expect(f.editor.getValue()).toBe("[Example](https://example.com)")
        expect(requestMock).toHaveBeenCalledTimes(1)
    })
})
