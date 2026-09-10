# Tab-only List Indentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer opt-in final-stage list indentation cleanup after Automatic Linker's save/format workflow.

**Architecture:** A conservative line scanner returns prefix-only CodeMirror changes. Apply all prefixes in one unfiltered transaction, preserving mapped selection and native undo. The existing serialized workflow runs this after awaited external formatters and rechecks its target.

**Tech Stack:** TypeScript, CodeMirror 6, Vitest; Node 22.23.1.

**Spec:** User-approved design in this conversation: use tabs for list hierarchy at four-column tab stops, discard remainder spaces, preserve marker separators/body/continuations/code/frontmatter, run after Prettier and Linter. Rounding down may make hierarchy shallower.

## Global Constraints

- Opt-in setting defaults off; no personal settings or note migration.
- Only contiguous list runs with a recognizable root are normalized; standalone indentation of four or more columns and ambiguous runs after blank/prose lines remain untouched as potential code.
- Protect fenced code (including list fences), YAML, HTML/comments and math. Leave blockquotes/callouts unchanged.
- Do not change the existing link diff applicator. No whole-document replacement.
- Use GitButler writes on `codex/tab-only-list-indent`; do not release or land without a new request.

### Task 1: Implement and integrate conservative prefix cleanup

**Files:** Create `src/list-indent.ts`, `src/__tests__/list-indent.test.ts`; modify `src/main.ts`, `src/settings/settings-catalog.ts`, `src/__tests__/main-formatting-safety.test.ts`, `README.md`.

**Interfaces:** `listIndentChanges(text: string, contentStart: number): ChangeSpec[]`; `normalizeListIndent(editor: Editor, contentStart: number): void`. Setting: `normalizeListIndent: boolean`.

- [x] Write table-driven prefix and protected-content tests, using literals such as `"- root\n      - child"` → `"- root\n\t- child"` and `"- root\n\t \t- child"` → `"- root\n\t\t- child"`. Assert idempotence, CRLF, ordered/task/bare markers, and no changes inside fenced/indented code, YAML, HTML, math or continuation text.
- [x] Run `n exec 22.23.1 npm test -- src/__tests__/list-indent.test.ts` and observe failure before adding implementation.
- [x] Implement scanner with four-column tab stops and conservative list-run classification. Emit only changed indentation ranges. Dispatch `editor.cm.dispatch({ changes, filter: false })` once only if there are edits.
- [x] Add tests proving final normalization sees Linter output, stays off by default, and does not edit after navigation/unload while Linter is pending. Run them failing before integrating.
- [x] Add the setting and final guarded pipeline step. Document rounding, conservative exclusions, and disabling other plugins' own save triggers.
- [x] Test real CodeMirror state selection mapping, one-step Undo/Redo and no-op dispatch. Run all tests, `npm run tsc`, `npm run lint`, and `npm run build` using Node 22.23.1.
- [x] Request read-only independent review, resolve important findings, rerun checks, and commit via `but` with English Conventional Commit Why/What details.

### Verification boundary

Real Obsidian zoom testing uses only the Bullet repository's test vault and a temporary scratch note, preserving/restoring settings and plugin artifacts. If unavailable, explicitly report it unverified rather than claiming zoom compatibility from unit tests alone.

Verified with Obsidian 1.14.1 and Bullet 5.19.0 using `n exec 22.23.1 node scripts/verify-list-indent.cjs`: normalization + save retains zoom, YAML and exact caret position; next typing edits the focused item; one Undo restores all prefixes after a no-diff run; Redo restores normalized text and caret. Bullet deliberately exits zoom for native Undo/Redo of hidden prefixes. The harness loads the actual normalization module in memory, not the entire plugin; workflow ordering is covered separately by integration-style tests. Scratch notes are trashed and the original leaf is restored. No plugins or personal settings were changed.

Automated verification: 477 tests across 44 files; TypeScript, ESLint, production build and whitespace check pass. Independent review reproduced protection bugs in raw HTML across blank lines, nested list fence openers, over-indented/outdented fence closers, and successive comments; each received a failing regression test before its fix. Additional tests cover multiline inline code and comments beginning mid-prose. Re-review found no outstanding important findings.
