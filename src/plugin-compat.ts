export function sleep(
    ms: number,
    scheduleTimeout: (callback: () => void, delay: number) => unknown = window.setTimeout.bind(window),
): Promise<void> {
    return new Promise((resolve) => {
        scheduleTimeout(resolve, ms)
    })
}

export function runAsyncSafely(
    task: () => Promise<void>,
    onError: (error: unknown) => void = console.error,
): void {
    void task().catch(onError)
}
