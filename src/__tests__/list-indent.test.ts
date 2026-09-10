import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"
import { listIndentChanges } from "../list-indent"

function normalize(text: string, contentStart = 0) {
    return EditorState.create({ doc: text }).update({ changes: listIndentChanges(text, contentStart) }).state.doc.toString()
}

describe("tab-only list indentation", () => {
    it.each([
        ["- root\n        - child", "- root\n\t\t- child"],
        ["- root\n      - child", "- root\n\t- child"],
        ["- root\n\t \t- child", "- root\n\t\t- child"],
        ["- root\n  \t- child", "- root\n\t- child"],
        ["- root\n\t - child", "- root\n\t- child"],
        ["  - root\n   - child", "- root\n- child"],
        ["- root\n     12.  [x] task  text", "- root\n\t12.  [x] task  text"],
        ["+ root\n     *\n     2.", "+ root\n\t*\n\t2."],
    ])("normalizes only hierarchy whitespace: %j", (input, expected) => {
        expect(normalize(input)).toBe(expected)
        expect(listIndentChanges(expected, 0)).toEqual([])
    })

    it.each([
        "    - standalone code\n      - also code",
        "- root\n\n        - indented code",
        "- root\n    continuation paragraph\n      - ambiguous code",
        "```md\n      - code\n```\n",
        "- ```md\n      - code\n  ```",
        "- root\n    ~~~md\n      - code\n    ~~~",
        "- root\n    ```md\n      - unclosed code",
        "<!--\n- root\n      - comment\n-->",
        "<div>\n- root\n      - HTML\n</div>",
        "<pre>\n\n- root\n      - raw HTML\n</pre>",
        "- - ```md\n        - raw code\n    ```",
        "```md\n    ```\n- root\n      - raw code\n```",
        " ```md\n    ```\n- root\n      - raw code\n```",
        "text `inline\n- root\n      - code\nend`",
        "text <!--\n- root\n      - comment\n-->",
        "- item\n```md\n    ```\n- root\n      - raw code\n```",
        "<!-- first --> <!--\n- root\n      - comment\n-->",
        "<!-- first\n--> <!-- second\n- root\n      - comment\n-->",
        "$$\n- root\n      - math\n$$",
        "> - quote\n>       - child",
        "- root\n    - - -",
    ])("preserves protected or ambiguous text: %j", (input) => {
        expect(listIndentChanges(input, 0)).toEqual([])
    })

    it("skips frontmatter and resumes at the supplied body offset", () => {
        const yaml = "---\ntags:\n  - tag\n---\n"
        expect(normalize(yaml + "- root\n      - child", yaml.length))
            .toBe(yaml + "- root\n\t- child")
    })

    it("returns exact prefix ranges without touching CRLF, body or separators", () => {
        expect(listIndentChanges("- root\r\n      -  child  \r\n", 0))
            .toEqual([{ from: 8, to: 14, insert: "\t" }])
    })

    it("maps a text selection through all prefix edits in a single update", () => {
        const text = "- root\n      - child\n     - sibling"
        const state = EditorState.create({ doc: text, selection: { anchor: 15, head: 20 } })
        const next = state.update({ changes: listIndentChanges(text, 0), filter: false }).state
        expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe("child")
        expect(next.doc.toString()).toBe("- root\n\t- child\n\t- sibling")
    })
})
