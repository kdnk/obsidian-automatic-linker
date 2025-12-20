import { describe, expect, it } from "vitest"
import { excludeLinks } from ".."

describe("exclude links", () => {
    it("replaces links", () => {
        const result = excludeLinks("[[hello]]")
        expect(result).toBe("hello")
    })

    it("replaces links with space", () => {
        const result = excludeLinks("[[tidy first]]")
        expect(result).toBe("tidy first")
    })

    it("replaces links with bullet", () => {
        const result = excludeLinks("- hello")
        expect(result).toBe("- hello")
    })

    it("replaces multiple links", () => {
        const result = excludeLinks("[[hello]] [[world]]")
        expect(result).toBe("hello world")
    })

    it("replaces multiple lines", () => {
        const result = excludeLinks("[[hello]]\n[[world]]")
        expect(result).toBe("hello\nworld")
    })

    it("replaces CJK links", () => {
        const result = excludeLinks("[[你好]]")
        expect(result).toBe("你好")
    })

    it("ignores inline code", () => {
        const result = excludeLinks("`[[hello]]`")
        expect(result).toBe("`[[hello]]`")
    })

    it("ignores code block", () => {
        const result = excludeLinks("```\n[[hello]]\n```")
        expect(result).toBe("```\n[[hello]]\n```")
    })

    it("replaces alias", () => {
        const result = excludeLinks("[[hello|world]]")
        expect(result).toBe("world")
    })

    it("extracts basename from path-style links", () => {
        const result = excludeLinks("[[xxx/yyy/zzz]]")
        expect(result).toBe("zzz")
    })

    it("extracts basename from two-level path links", () => {
        const result = excludeLinks("[[folder/file]]")
        expect(result).toBe("file")
    })

    it("uses alias for path-style links when provided", () => {
        const result = excludeLinks("[[xxx/yyy/zzz|alias]]")
        expect(result).toBe("alias")
    })

    it("handles multiple path-style links", () => {
        const result = excludeLinks("[[path/to/file1]] and [[another/path/to/file2]]")
        expect(result).toBe("file1 and file2")
    })
})
