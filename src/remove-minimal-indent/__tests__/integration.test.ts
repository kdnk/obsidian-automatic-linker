import { describe, expect, it } from "vitest"
import { excludeLinks } from "../../exclude-links"
import { removeMinimalIndent } from ".."

describe("copy selection integration test", () => {
    it("removes indent and wikilinks from list selection", () => {
        const text = "    - [[item1]]\n      - [[item2]]\n    - [[item3]]"
        const withoutIndent = removeMinimalIndent(text)
        const result = excludeLinks(withoutIndent)
        expect(result).toBe("- item1\n  - item2\n- item3")
    })

    it("removes indent and path-style wikilinks", () => {
        const text = "  - [[path/to/file1]]\n  - [[another/file2]]"
        const withoutIndent = removeMinimalIndent(text)
        const result = excludeLinks(withoutIndent)
        expect(result).toBe("- file1\n- file2")
    })

    it("handles mixed content with links and code", () => {
        const text
            = "    Some text with [[link]]\n    `[[code link]]` should stay\n    Another [[path/to/file]]"
        const withoutIndent = removeMinimalIndent(text)
        const result = excludeLinks(withoutIndent)
        expect(result).toBe(
            "Some text with link\n`[[code link]]` should stay\nAnother file",
        )
    })

    it("preserves relative indent in nested lists", () => {
        const text
            = "      - [[item1]]\n        - [[subitem1]]\n        - [[subitem2]]\n      - [[item2]]"
        const withoutIndent = removeMinimalIndent(text)
        const result = excludeLinks(withoutIndent)
        expect(result).toBe("- item1\n  - subitem1\n  - subitem2\n- item2")
    })

    it("handles empty lines in selection", () => {
        const text = "  [[link1]]\n\n  [[link2]]"
        const withoutIndent = removeMinimalIndent(text)
        const result = excludeLinks(withoutIndent)
        expect(result).toBe("link1\n\nlink2")
    })

    it("", () => {
        const text = `
            - hello
            - hello [[world]]`
        const withoutIndent = removeMinimalIndent(text)
        const result = excludeLinks(withoutIndent)
        const expected = `
- hello
    - hello world`
        expect(result).toBe(expected)
    })
})
