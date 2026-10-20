import { describe, expect, it, vi } from "vitest"
import { runAsyncSafely } from "../plugin-compat"

describe("plugin-compat", () => {
    it("runAsyncSafely reports rejected tasks", async () => {
        const onError = vi.fn()

        runAsyncSafely(async () => {
            throw new Error("boom")
        }, onError)

        await vi.waitFor(() => {
            expect(onError).toHaveBeenCalledTimes(1)
        })
    })
})
