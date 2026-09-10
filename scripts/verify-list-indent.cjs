// Uses only the neighboring Bullet repository's guarded test vault. Execute the
// real normalization module in memory without enabling/installing a plugin.
/* eslint-disable @typescript-eslint/no-require-imports */
/* global app */
const assert = require("node:assert/strict")
const path = require("node:path")
const { randomUUID } = require("node:crypto")
const { evaluate } = require("../../obsidian-bullet/scripts/obsidian-scroll-driver.cjs")
const source = require("esbuild").buildSync({ entryPoints: [path.resolve(__dirname, "../src/list-indent.ts")], bundle: true, write: false, format: "cjs" }).outputFiles[0].text
const note = `list-indent-${randomUUID()}.md`
const before = "---\ntags:\n  - kept\n---\n- work\n    - project\n         - task\n    - other\n- personal"
const after = "---\ntags:\n  - kept\n---\n- work\n\t- project\n\t\t- task\n\t- other\n- personal"
const initial = evaluate(() => app.workspace.activeLeaf.id)

function sample() {
    return evaluate(() => {
        const editor = window.__listIndentCheck.leaf.view.editor
        return {
            doc: editor.getValue(),
            zoom: editor.cm.dom.querySelector(".bullet-zoom-breadcrumbs [aria-current=location]")?.textContent,
            line: editor.getLine(editor.getCursor().line),
            visible: editor.cm.contentDOM.textContent,
        }
    })
}

try {
    evaluate(async (source, note, before) => {
        const module = { exports: {} }
        new Function("module", "exports", source)(module, module.exports)
        const file = await app.vault.create(note, before)
        const leaf = app.workspace.getLeaf("tab")
        window.__listIndentCheck = { normalize: module.exports.normalizeListIndent, leaf, file }
        await leaf.openFile(file)
        leaf.view.editor.setCursor({ line: 5, ch: 9 })
        app.commands.executeCommandById("bullet:zoom-in")
        await new Promise(resolve => setTimeout(resolve, 350))
        // zoom-in itself moves the caret to the body's beginning; place the
        // test caret afterwards to verify exact column mapping through cleanup.
        leaf.view.editor.setCursor({ line: 5, ch: 9 })
    }, source, note, before)
    assert.equal(sample().zoom, "project")
    evaluate(async () => {
        const { normalize, leaf } = window.__listIndentCheck
        normalize(leaf.view.editor, leaf.view.editor.getValue().indexOf("- work"))
        await leaf.view.save()
        await new Promise(resolve => setTimeout(resolve, 350))
    })
    assert.equal(sample().doc, after)
    assert.equal(sample().zoom, "project")
    assert.equal(sample().line, "\t- project")
    assert.ok(!sample().visible.includes("personal"))
    console.log("PASS final formatting + save preserves zoom, cursor, YAML and hidden content")

    evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 600))
        window.__listIndentCheck.leaf.view.editor.replaceSelection("X")
    })
    assert.equal(sample().line, "\t- proXject")
    assert.ok(!sample().visible.includes("personal"))
    evaluate(async () => {
        window.__listIndentCheck.leaf.view.editor.undo()
        await new Promise(resolve => setTimeout(resolve, 350))
    })
    assert.equal(sample().doc, after)
    console.log("PASS next input edits the visible focused item, with separate typing Undo")

    evaluate(async () => {
        const { normalize, leaf } = window.__listIndentCheck
        normalize(leaf.view.editor, leaf.view.editor.getValue().indexOf("- work"))
        leaf.view.editor.undo()
        await new Promise(resolve => setTimeout(resolve, 350))
    })
    assert.equal(sample().doc, before)
    console.log("PASS no-diff run adds no undo step; one Undo restores all prefixes")
    evaluate(async () => {
        window.__listIndentCheck.leaf.view.editor.redo()
        await new Promise(resolve => setTimeout(resolve, 350))
    })
    assert.equal(sample().doc, after)
    // Bullet deliberately exits zoom for native Undo/Redo of hidden content.
    assert.equal(sample().zoom, undefined)
    evaluate(() => {
        const editor = window.__listIndentCheck.leaf.view.editor
        editor.replaceSelection("X")
    })
    assert.equal(sample().line, "\t- proXject")
    console.log("PASS Redo restores normalized text and keeps the cursor on the same item")
}
finally {
    evaluate(async (initial, note) => {
        const check = window.__listIndentCheck
        if (check) {
            await check.leaf.view.save()
            check.leaf.detach()
        }
        const file = app.vault.getAbstractFileByPath(note)
        if (file) await app.vault.trash(file, true)
        const leaf = app.workspace.getLeafById(initial)
        if (leaf) app.workspace.setActiveLeaf(leaf, { focus: true })
        delete window.__listIndentCheck
    }, initial, note)
}
