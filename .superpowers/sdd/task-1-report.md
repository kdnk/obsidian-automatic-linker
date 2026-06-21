# Task 1 Report: Candidate Scanning Module

## Scope

Implemented Task 1 from `.superpowers/sdd/task-1-brief.md`:

- Created `src/replace-links/candidate-scanner.ts`
- Created `src/replace-links/__tests__/candidate-scanner.test.ts`
- Updated `src/replace-links/replace-links.ts`
- Updated `src/utils/resolve-ambiguities.ts`

No AGENTS.md changes were needed.

## TDD Evidence

### RED

Command:

```bash
npx vitest run src/replace-links/__tests__/candidate-scanner.test.ts
```

Result:

- Failed as expected.
- Failure cause: `Cannot find module '../candidate-scanner'`.

### GREEN

Command:

```bash
npx vitest run src/replace-links/__tests__/candidate-scanner.test.ts
```

Result:

- Passed: `4/4` tests.

## Implementation Summary

- Extracted shared scanning helpers from `replace-links.ts` into `candidate-scanner.ts`.
- Added `scanCandidateOccurrences()` for:
  - unlinked candidate occurrences
  - existing wikilink occurrences
- Added `getOccurrenceContext()` for bounded AI request context.
- Preserved `replaceLinks()` rendering behavior by importing the moved helpers back into `replace-links.ts`.
- Routed `resolveAmbiguities()` through the shared scanner instead of maintaining separate trie scanning logic.

## Focused Verification

Command:

```bash
npx vitest run src/utils/__tests__/resolve-ambiguities.test.ts src/replace-links/__tests__/ai-disambiguation.test.ts src/replace-links/__tests__/replace-links.basic.test.ts
```

Result:

- Passed: `19/19` tests across `3/3` files.

## Full Stage Verification

Commands:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Results:

- `npm run test -- --reporter=dot`: passed, `320/320` tests across `38/38` files
- `npm run tsc`: passed
- `npm run lint`: passed

Note:

- The first full-suite run hit a transient failure in the namespace-resolution performance test.
- Re-running the full stage verification passed cleanly, including that test (`Namespace resolution processed in 290.97ms`, below the `300ms` threshold).

## Commit

Created commit:

- `953688d` `refactor(replace-links): centralize candidate scanning`

## Files Changed

- `src/replace-links/candidate-scanner.ts`
- `src/replace-links/__tests__/candidate-scanner.test.ts`
- `src/replace-links/replace-links.ts`
- `src/utils/resolve-ambiguities.ts`

## Brief Compliance Check

- Used the exact Task 1 file set from the brief.
- Followed RED then GREEN before production code claims.
- Ran the focused tests from the brief.
- Ran the full verification commands from the brief.
- Used the specified Conventional Commit message with `Why` and `What`.

## Review Fix 1

### Scope

Fixed the Task 1 review findings for candidate scanning drift:

- aligned trie-hit namespace handling in `scanCandidateOccurrences()` with current `replaceLinks()` behavior
- aligned scanner protected-region handling with current `replaceLinks()` block-level shielding for fenced code blocks, callouts, and ignored headings
- added regression coverage for both drift cases

No AGENTS.md changes were needed.

### TDD Evidence

#### RED

Commands:

```bash
npx vitest run src/replace-links/__tests__/candidate-scanner.test.ts
npx vitest run src/utils/__tests__/resolve-ambiguities.test.ts
```

Results:

- `candidate-scanner.test.ts` failed on the new trie-hit namespace semantics regression.
- `candidate-scanner.test.ts` failed on the new fenced-code/callout/ignored-heading regression.
- `resolve-ambiguities.test.ts` failed on the new protected-region regression.

#### GREEN

Commands:

```bash
npx vitest run src/replace-links/__tests__/candidate-scanner.test.ts
npx vitest run src/utils/__tests__/resolve-ambiguities.test.ts src/replace-links/__tests__/ai-disambiguation.test.ts src/replace-links/__tests__/replace-links.callout.test.ts src/replace-links/__tests__/replace-links.headings.test.ts src/replace-links/__tests__/replace-links.code.test.ts
```

Results:

- `candidate-scanner.test.ts`: passed `6/6`
- focused AI/replacement suite: passed `47/47` across `5/5` files

### Implementation Summary

- Reworked scanner block protection to skip the same fenced code blocks, callouts, and optional heading regions that `replaceLinks()` excludes before protected-regex scanning.
- Preserved absolute occurrence offsets while scanning only unprotected regions.
- Changed trie-hit scanner behavior to keep the original candidate set and use the first candidate for scoped/self-link checks, matching current `replaceLinks()` semantics.
- Updated scanner regressions to reflect current trie-hit behavior and added AI-side coverage to ensure protected regions are not scanned.

### Full Verification

Commands:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Results:

- `npm run test -- --reporter=dot`: passed, `323/323` tests across `38/38` files
- `npm run tsc`: passed
- `npm run lint`: passed

## Review Fix 2

### Scope

Fixed the remaining Task 1 review finding:

- `scanCandidateOccurrences()` now skips existing wikilinks that fall inside inline code spans, not just block-level protected ranges
- `resolveAmbiguities()` coverage now proves the protected inline wikilink produces no AI request payload

No AGENTS.md changes were needed.

### Focused Verification

Commands:

```bash
npx vitest run src/replace-links/__tests__/candidate-scanner.test.ts
npx vitest run src/utils/__tests__/resolve-ambiguities.test.ts
```

Results:

- `src/replace-links/__tests__/candidate-scanner.test.ts`: passed `7/7`
- `src/utils/__tests__/resolve-ambiguities.test.ts`: passed `4/4`

### Full Verification

Commands:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Results:

- `npm run test -- --reporter=dot`: passed, `325/325` tests across `38/38` files
- `npm run tsc`: passed
- `npm run lint`: passed
