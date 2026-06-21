# Task 2 Report: Formatting Run Module

## Scope

Implemented Task 2 only:

- Added `src/formatting-run.ts`
- Added `src/__tests__/formatting-run.test.ts`
- Updated `src/main.ts` to route document and selection formatting through the new module
- Reduced duplicated adapter-level URL-title/frontmatter coverage in `src/__tests__/main-url-title-frontmatter.test.ts`

Preserved Task 1 behavior:

- `resolveAmbiguities()` still receives the normalized current file path
- AI command still renders via `replaceLinks(...)`
- AI command now uses `toReplaceLinksSettings(this.settings, baseDir)`
- Link replacement still normalizes source file paths by removing a trailing `.md`

## TDD Evidence

### RED

Command:

```bash
npx vitest run src/__tests__/formatting-run.test.ts
```

Result:

- Failed as expected
- Error: `Cannot find module '../formatting-run'`

### GREEN

Command:

```bash
npx vitest run src/__tests__/formatting-run.test.ts
```

Result:

- Passed: `4` tests in `src/__tests__/formatting-run.test.ts`

## Focused Verification

Command:

```bash
npx vitest run src/__tests__/formatting-run.test.ts src/__tests__/main-url-title-frontmatter.test.ts src/__tests__/main-link-generator.test.ts
```

Result:

- Passed: `3` test files, `6` tests

## Full Stage Verification

Commands:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Results:

- `npm run test -- --reporter=dot`: passed `39` test files, `334` tests
- `npm run tsc`: exit `0`
- `npm run lint`: exit `0`

## Implementation Notes

- `formatMarkdownDocument(...)` owns frontmatter splitting and delegates body formatting
- `formatMarkdownBody(...)` sequences GitHub/Jira/Linear URL formatting, URL-title replacement, then link replacement
- `toReplaceLinksSettings(...)` projects only the settings required by `replaceLinks(...)` and carries `baseDir`
- `modifyLinks(...)` now uses the pure formatter for both indexed and non-indexed runs
- `mofifyLinksSelection(...)` now uses `formatMarkdownBody(...)`
- Adapter-only URL-title fetch opt-out coverage remains in `main-url-title-frontmatter.test.ts`

## Concerns

None.

## Fix: Selection Formatting Regression

Selection formatting was accidentally routed through `formatMarkdownBody(...)`, which let URL-formatting behavior leak into the selection command.

### RED

Command:

```bash
npx vitest run src/__tests__/main-link-generator.test.ts
```

Result:

- Failed as expected
- Failure showed `mofifyLinksSelection()` was formatting a GitHub URL instead of leaving it unchanged:
  `[[notes/TypeScript|TypeScript]] [[github/openai/openai/issues/1]] [🔗](https://github.com/openai/openai/issues/1)`

### GREEN

Changes:

- Added `formatMarkdownSelection(...)` in `src/formatting-run.ts`
- Updated `mofifyLinksSelection()` in `src/main.ts` to call the selection-only helper
- Added a unit guard in `src/__tests__/formatting-run.test.ts`

### Verification

Commands:

```bash
npx vitest run src/__tests__/formatting-run.test.ts src/__tests__/main-link-generator.test.ts
npm run tsc
npm run lint
```

Results:

- `npx vitest run src/__tests__/formatting-run.test.ts src/__tests__/main-link-generator.test.ts`: passed `2` files, `7` tests
- `npm run tsc`: exit `0`
- `npm run lint`: exit `0`

### Concerns

- Selection formatting now has its own helper; any future selection-specific behavior should be added there, not to `formatMarkdownBody(...)`.
