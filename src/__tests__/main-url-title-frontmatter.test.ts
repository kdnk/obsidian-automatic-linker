import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SETTINGS } from "../settings/settings-info"

const requestMock = vi.hoisted(() => vi.fn())

class MockTFile {
    path: string

    constructor(path: string) {
        this.path = path
    }
}

vi.mock("obsidian", () => ({
    App: class {},
    Editor: class {},
    getFrontMatterInfo: (content: string) => {
        const frontmatter = content.match(/^---\n[\s\S]*?\n---\n?/)
        return { contentStart: frontmatter?.[0].length ?? 0 }
    },
    MarkdownView: class {},
    Notice: class {},
    parseFrontMatterAliases: () => [],
    Plugin: class {
        app: unknown

        constructor(app: unknown) {
            this.app = app
        }
    },
    PluginSettingTab: class {},
    request: requestMock,
    Setting: class {
        setName() { return this }
        setDesc() { return this }
        setHeading() { return this }
        addToggle() { return this }
        addTextArea() { return this }
        addText() { return this }
    },
    TFile: MockTFile,
}))

describe("AutomaticLinkerPlugin URL title frontmatter opt-out", () => {
    afterEach(() => {
        requestMock.mockReset()
    })

    it("does not fetch URL titles when disabled in active file frontmatter", async () => {
        const { default: AutomaticLinkerPlugin } = await import("../main")
        const activeFile = new MockTFile("current-file.md")
        const app = {
            metadataCache: {
                getFileCache: vi.fn(() => ({
                    frontmatter: {
                        "automatic-linker-disable-url-title": true,
                    },
                })),
            },
            vault: {
                read: vi.fn(async () => (
                    "---\nautomatic-linker-disable-url-title: true\n---\nhttps://example.com"
                )),
            },
            workspace: {
                getActiveFile: vi.fn(() => activeFile),
            },
        }
        const plugin = new AutomaticLinkerPlugin(app as never, {} as never)
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            replaceUrlWithTitle: true,
        }

        await plugin.buildUrlTitleMap()

        expect(requestMock).not.toHaveBeenCalled()
    })
})
