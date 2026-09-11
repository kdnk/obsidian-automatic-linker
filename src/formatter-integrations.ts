import { App, Editor, TFile } from "obsidian"
import { AutomaticLinkerSettings } from "./settings/settings-info"

type FormatterId = "prettier-format" | "obsidian-linter"

interface FormatterPlugin {
    format?: () => unknown
    runLinterEditor?: (editor: Editor) => unknown
    shouldIgnoreFile?: (file: TFile) => boolean
    settings?: { formatOnSave?: boolean, lintOnSave?: boolean }
}

function getFormatter(app: App, id: FormatterId): FormatterPlugin | undefined {
    // Neither Obsidian's public API nor these plugins expose typed integration
    // contracts. Keep the guarded private API access at this single boundary.
    const registry = (app as unknown as {
        plugins?: { plugins?: Record<string, FormatterPlugin | undefined> }
    }).plugins?.plugins
    return registry?.[id]
}

const names = { "prettier-format": "Prettier", "obsidian-linter": "Obsidian Linter" }

export async function runFormatter(app: App, id: FormatterId, editor: Editor, file?: TFile): Promise<void> {
    const plugin = getFormatter(app, id)
    const method = id === "prettier-format" ? plugin?.format : plugin?.runLinterEditor
    if (typeof method !== "function") {
        throw new Error(`${names[id]} integration is unavailable. Enable a compatible plugin or disable its Automatic Linker integration.`)
    }
    // Linter's editor API leaves exclusion checks to its callers (including its
    // own save hook). Older integrations may not expose the predicate.
    if (id === "obsidian-linter" && typeof plugin?.shouldIgnoreFile === "function") {
        const target = file ?? app.workspace.getActiveFile()
        if (target && plugin.shouldIgnoreFile(target)) return
    }
    // Commands return an availability boolean, not the formatter's Promise.
    // Verified with prettier-format 0.2.0 and obsidian-linter 1.32.0.
    const completion = method.call(plugin, editor)
    if (!completion || typeof (completion as PromiseLike<unknown>).then !== "function") {
        throw new Error(`${names[id]} did not return a completion Promise. Stopping the formatting chain to avoid overlapping edits.`)
    }
    await completion
}

export function formatterSaveConflicts(app: App, settings: AutomaticLinkerSettings): string[] {
    if (!settings.formatOnSave) return []
    const conflicts: string[] = []
    if (settings.runPrettierAfterFormatting && getFormatter(app, "prettier-format")?.settings?.formatOnSave) {
        conflicts.push(names["prettier-format"])
    }
    if (settings.runLinterAfterFormatting && getFormatter(app, "obsidian-linter")?.settings?.lintOnSave) {
        conflicts.push(names["obsidian-linter"])
    }
    return conflicts
}
