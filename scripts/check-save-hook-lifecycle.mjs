// Run from this checkout: node scripts/check-save-hook-lifecycle.mjs [linter-checkout]
// This loads both current source implementations; neither bundle nor vault is changed.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const linkerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const linterRoot = resolve(process.argv[2] ?? resolve(linkerRoot, "../obsidian-linter"))
const linterRequire = createRequire(resolve(linterRoot, "package.json"))
const importGlobPlugin = linterRequire("esbuild-plugin-import-glob").default

class Stub {}
class Plugin {
    constructor(app) { this.app = app }
    addCommand() {}
    addSettingTab() {}
    registerEvent() {}
}
const obsidian = new Proxy({
    Plugin,
    moment: linterRequire("moment"),
    debounce: callback => callback,
    normalizePath: path => path,
}, { get: (values, key) => values[key] ?? Stub })

globalThis.window = globalThis
window.CodeMirrorAdapter = { commands: {} }
globalThis.document = { createElement: () => ({}), documentElement: {} }
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null }, configurable: true })

async function loadSource(root, plugins = []) {
    const result = await build({
        absWorkingDir: root,
        entryPoints: ["src/main.ts"],
        bundle: true,
        write: false,
        format: "cjs",
        platform: "node",
        external: ["obsidian"],
        plugins,
    })
    const loaded = { exports: {} }
    const require = createRequire(resolve(root, "package.json"))
    new Function("module", "exports", "require", result.outputFiles[0].text)(
        loaded, loaded.exports, name => name === "obsidian" ? obsidian : require(name),
    )
    return loaded.exports.default
}

const AutomaticLinker = await loadSource(linkerRoot)
const Linter = await loadSource(linterRoot, [importGlobPlugin()])

function fixture() {
    const events = []
    const file = { path: "note.md", extension: "md" }
    const editor = { cm: {}, getValue: () => "fixture" }
    const native = (checking) => {
        if (!checking) events.push("native")
        return true
    }
    const save = { checkCallback: native }
    const app = {
        plugins: { plugins: {} },
        workspace: {
            on: () => ({}),
            offref: () => {},
            onLayoutReady: () => {},
            getActiveFile: () => file,
            getActiveViewOfType: () => ({ file, editor }),
        },
        metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: {} }) },
        commands: { commands: { "editor:save-file": save } },
    }
    const active = new Map()
    function load(name) {
        const plugin = name === "A" ? new AutomaticLinker(app, {}) : new Linter(app, {})
        active.set(name, plugin)
        if (name === "A") {
            plugin.settings = {
                formatOnSave: true, formatDelayMs: 0, replaceUrlWithTitle: false,
                runPrettierAfterFormatting: false, runLinterAfterFormatting: true,
            }
            // The formatter boundaries record invocations; lifecycle methods and
            // the complete Automatic Linker scheduling/integration path are real.
            plugin.modifyLinksForTarget = () => events.push("linker")
            plugin.initializePlugin()
        }
        else {
            plugin.settings = { lintOnSave: false, foldersToIgnore: [], filesToIgnore: [] }
            plugin.runLinterEditor = async () => {
                events.push("linter")
            }
            app.plugins.plugins["obsidian-linter"] = plugin
            plugin.registerEventsAndSaveCallback()
        }
    }
    async function unload(name) {
        await active.get(name).onunload()
        active.delete(name)
        if (name === "L") delete app.plugins.plugins["obsidian-linter"]
    }
    async function check(expected = active.has("A") ? ["linker", "linter"] : ["native"]) {
        events.length = 0
        assert.equal(save.checkCallback(true), true)
        assert.deepEqual(events, [], "availability checks must not format or save")
        save.checkCallback(false)
        // Save callbacks intentionally return before the async pipeline completes.
        // Yield past its zero-delay timer, then await the plugin's completion task.
        await new Promise(resolve => setTimeout(resolve, 0))
        if (active.has("A")) await active.get("A").formattingTask
        assert.deepEqual(events, expected)
    }
    return { active, load, unload, check, save, file }
}

let scenarios = 0
for (const loadOrder of [["A", "L"], ["L", "A"]]) {
    for (const reloadOrder of [["A", "L"], ["L", "A"]]) {
        const f = fixture()
        loadOrder.forEach(f.load)
        await f.check()
        for (const name of [...reloadOrder, ...reloadOrder]) {
            await f.unload(name)
            f.load(name)
            await f.check()
        }
        // Insert a third-party wrapper after both plugins. Unloading either
        // plugin must keep the wrapper and the other plugin reachable.
        const previous = f.save.checkCallback
        const thirdParty = checking => previous(checking)
        f.save.checkCallback = thirdParty
        await f.unload("A")
        assert.equal(f.save.checkCallback, thirdParty)
        await f.check()
        f.load("A")
        await f.check()
        await f.unload("L")
        f.load("L")
        await f.check()
        await f.unload("A")
        await f.unload("L")
        await f.check()
        scenarios++
    }
}
console.log(`PASS: ${scenarios} load/reload permutations using current Automatic Linker and Linter source, including third-party wrappers`)

const ignored = fixture()
ignored.load("A")
ignored.load("L")
ignored.active.get("L").settings.foldersToIgnore = ["templates"]
ignored.active.get("L").settings.filesToIgnore = [{ match: "^archive/.*\\.md$", flags: "i" }]
for (const path of ["templates/note.md", "ARCHIVE/private.md"]) {
    ignored.file.path = path
    assert.equal(ignored.active.get("L").shouldIgnoreFile(ignored.file), true)
    await ignored.check(["linker"])
}
ignored.file.path = "templates-other/note.md"
await ignored.check(["linker", "linter"])
await ignored.unload("A")
await ignored.unload("L")
console.log("PASS: current Linter folder and filename exclusions are honored by the Automatic Linker pipeline")
