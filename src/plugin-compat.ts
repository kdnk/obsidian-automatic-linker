export function runAsyncSafely(
    task: () => Promise<void>,
    onError: (error: unknown) => void = console.error,
): void {
    void task().catch(onError)
}
