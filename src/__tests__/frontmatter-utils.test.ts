import { describe, expect, it } from "vitest"
import { isUrlTitleReplacementOff } from "../frontmatter-utils"

describe("frontmatter utils", () => {
    it("detects URL title replacement opt-out", () => {
        expect(isUrlTitleReplacementOff({
            "automatic-linker-disable-url-title": true,
        })).toBe(true)
    })

    it("does not disable URL title replacement when the opt-out is absent", () => {
        expect(isUrlTitleReplacementOff(undefined)).toBe(false)
    })
})
