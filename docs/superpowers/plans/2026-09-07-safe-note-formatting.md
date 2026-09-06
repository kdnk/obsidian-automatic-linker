# Safe Note Formatting Implementation Plan

> **For agentic workers:** Execute task-by-task using test-driven development; review the integrated diff before landing.

**Goal:** Protect frontmatter, preserve canonical link targets, pin asynchronous formatting to its initiating editor, and honor per-note opt-out for every formatting command.

**Architecture:** Keep document rules in formatting-run and the Obsidian adapter in main. Pass canonical target identity separately from rendered link paths. Capture the file, path, editor, and initial content before asynchronous work; cancel if the target changes and use the latest editor text when applying formatting.

**Tech Stack:** TypeScript, Obsidian API, Vitest, GitButler.

**Spec:** User-approved review items 1, 2, 4, and 5 in this task.

## Constraints

- Preserve existing save callback semantics: do not call the original save action.
- Preserve unrelated manifest.json changes.
- No new dependencies. Use but for commits and land.

## Tasks

- [x] Preserve frontmatter byte-for-byte in formatMarkdownDocument. Update the existing URL-in-frontmatter test and cover CRLF and body formatting.
- [x] Carry canonical targetPath through link generation; test baseDir, aliases, case preservation, and duplicate root paths without changing default wiki-link rendering.
- [x] Capture editor target before save delay and URL requests. Validate file/path/editor before applying or invoking Prettier/Linter, read current editor content, and test tab changes, edits during requests, and delayed saves.
- [x] Centralize opt-out checks for full-document, selection, and URL fetching; test disabled vault notes, selection, and no network/integration calls.
- [x] Update README with protected frontmatter and interrupted formatting behavior. Run full tests, build, lint, and diff checks; review the final diff.

## Verification

Run new regression tests against the old behavior first, then implement and rerun. Finish with `pnpm test`, `pnpm build`, `pnpm lint`, and `git diff --check`. Review integration edges using mocked Obsidian editor/file transitions. Commit with English Conventional Commit subject and Why/What description, then `but land codex/safe-note-formatting --yes`.

## Results

391 tests across 42 files pass; production build, type checking, lint, and diff checks pass. Independent review found no blocking issues. Original save callback suppression has regression coverage and remains unchanged.
