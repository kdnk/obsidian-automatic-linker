import { describe, expect, it, vi } from "vitest"
import { runAsyncSafely, sleep } from "../plugin-compat"

describe("plugin-compat", () => {
    it("sleep uses the provided scheduler", async () => {
        let capturedDelay: number | null = null
        const scheduledCallbacks: Array<() => void> = []

        const promise = sleep(25, (callback, delay) => {
            capturedDelay = delay
            scheduledCallbacks.push(callback)
            return 1
        })

        expect(capturedDelay).toBe(25)
        expect(scheduledCallbacks).toHaveLength(1)

        scheduledCallbacks[0]()

        await expect(promise).resolves.toBeUndefined()
    })

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
