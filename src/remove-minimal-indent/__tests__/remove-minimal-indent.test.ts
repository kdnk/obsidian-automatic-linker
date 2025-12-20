import { describe, expect, it } from "vitest"
import { removeMinimalIndent } from ".."

describe("removeMinimalIndent", () => {
    it("removes common indent from all lines", () => {
        const text = "  line1\n  line2\n  line3"
        const result = removeMinimalIndent(text)
        expect(result).toBe("line1\nline2\nline3")
    })

    it("removes minimal indent when lines have different indentation", () => {
        const text = "    line1\n      line2\n    line3"
        const result = removeMinimalIndent(text)
        expect(result).toBe("line1\n  line2\nline3")
    })

    it("handles tab indentation", () => {
        const text = "\t\tline1\n\t\tline2"
        const result = removeMinimalIndent(text)
        expect(result).toBe("line1\nline2")
    })

    it("handles mixed spaces and tabs by treating tab as single character", () => {
        const text = "\t  line1\n\t  line2"
        const result = removeMinimalIndent(text)
        expect(result).toBe("line1\nline2")
    })

    it("preserves relative indentation", () => {
        const text = "  - item1\n    - subitem\n  - item2"
        const result = removeMinimalIndent(text)
        expect(result).toBe("- item1\n  - subitem\n- item2")
    })

    it("ignores empty lines when calculating minimal indent", () => {
        const text = "  line1\n\n  line2"
        const result = removeMinimalIndent(text)
        expect(result).toBe("line1\n\nline2")
    })

    it("ignores whitespace-only lines when calculating minimal indent", () => {
        const text = "  line1\n    \n  line2"
        const result = removeMinimalIndent(text)
        expect(result).toBe("line1\n\nline2")
    })

    it("returns text as-is when no indent", () => {
        const text = "line1\nline2"
        const result = removeMinimalIndent(text)
        expect(result).toBe("line1\nline2")
    })

    it("handles single line", () => {
        const text = "  single line"
        const result = removeMinimalIndent(text)
        expect(result).toBe("single line")
    })

    it("handles list in the middle of a document", () => {
        const text = "    - item1\n      - subitem1\n      - subitem2\n    - item2"
        const result = removeMinimalIndent(text)
        expect(result).toBe("- item1\n  - subitem1\n  - subitem2\n- item2")
    })
})
