# Architecture Deepening Design

## Goal

Deepen the architecture of Obsidian Automatic Linker without changing user-visible behavior.

The work should reduce duplicated transformation logic, move Obsidian-specific code toward thin adapters, and concentrate link-formatting behavior in modules with higher locality and leverage.

## Scope

Implement all five architecture-review candidates in a staged sequence:

1. Deepen candidate scanning.
2. Deepen the formatting run.
3. Deepen the settings catalog.
4. Deepen Markdown protected segments.
5. Deepen URL formatting adapters.

Each stage must preserve the existing behavior covered by the current test suite. New tests should be added before production changes when a stage exposes behavior that is currently duplicated, underspecified, or hard to test through the existing interface.

## Non-Goals

- Do not add new user-facing features.
- Do not change existing settings names, defaults, command ids, or manifest metadata.
- Do not change Obsidian link output formats except where an existing test already expects that behavior.
- Do not replace the current test framework or build tooling.
- Do not introduce a Markdown parser dependency unless a later implementation step proves regex segmentation cannot preserve current behavior.

## Architecture

The current codebase has two large centers of gravity:

- `src/main.ts` owns Obsidian lifecycle, command registration, settings access, indexing, URL title fetching, URL formatting, link replacement, and AI command orchestration.
- `src/replace-links/replace-links.ts` owns a deep but broad implementation for link candidate matching and content transformation.

The target architecture keeps the transformation core pure and moves app integration to adapters:

- Obsidian commands, editor reads/writes, notices, network requests, and plugin lifecycle remain in adapter code.
- Link candidate scanning, Markdown segment protection, URL formatting, settings projection, and formatting-run sequencing become testable modules.
- Existing modules are split only where the split concentrates complexity behind a smaller interface.

## Candidate 1: Deepen Candidate Scanning

### Problem

`replaceLinks` and `resolveAmbiguities` both scan note text for possible link candidates.

`replaceLinks` contains the full implementation: protected spans, trie traversal, CJK handling, sentence-case matching, namespace scope, table awareness, and existing-link correction. `resolveAmbiguities` contains a simplified scanner for AI requests. This weakens locality because changing candidate matching requires checking two implementations.

### Design

Create a candidate scanning module used by both link replacement and AI ambiguity resolution.

The module should expose occurrences of linkable text and existing links in terms of the existing data model:

- source text range
- matched text
- candidate key
- candidate data
- whether the occurrence is protected, replaceable, or an existing wikilink
- enough context for AI request construction

`replaceLinks` remains responsible for rendering replacements. `resolveAmbiguities` becomes an adapter that asks the scanner for ambiguous occurrences and sends them to the AI client.

### Testing

Tests should prove that AI ambiguity detection respects the same candidate matching rules as replacement for:

- protected inline code
- existing Markdown links
- case-insensitive candidates
- namespace-scoped candidates
- CJK or sentence-case behavior where currently covered by `replaceLinks`

## Candidate 2: Deepen The Formatting Run

### Problem

`main.ts` currently sequences multiple pure transformations directly:

- GitHub URL formatting
- Jira URL formatting
- Linear URL formatting
- URL title replacement
- frontmatter/body splitting
- link replacement
- settings projection for `replaceLinks`

The file and selection commands duplicate the settings projection. The AI command passes a broader settings object into `replaceLinks`, which makes the transformation interface inconsistent.

### Design

Create a formatting-run module that owns content transformation sequencing.

The Obsidian plugin adapter should supply:

- current file path
- raw content or selected text
- frontmatter when available
- candidate index
- URL title map
- link generator
- projected runtime settings

The formatting-run module should return transformed text and avoid direct Obsidian dependencies.

`main.ts` keeps editor reads/writes, command registration, notices, vault traversal, URL title fetching, and plugin integration.

### Testing

Tests should exercise the formatting run without constructing `AutomaticLinkerPlugin` or mocking Obsidian. Existing `main.ts` tests that only verify pure transformation behavior should move toward the formatting-run module where practical.

## Candidate 3: Deepen The Settings Catalog

### Problem

Adding a setting currently crosses several places:

- `src/settings/settings-info.ts`
- `src/settings/settings.ts`
- `src/main.ts`
- `src/replace-links/replace-links.ts`

The repo's development guide already warns about this. That warning is evidence that the settings module is shallow: the interface nearly matches the implementation, and adding a field lacks locality.

### Design

Create a settings catalog module that owns settings metadata and projections.

The catalog should centralize:

- default values
- setting groups and display metadata used by the settings tab
- whether changing a setting requires index refresh
- projection from `AutomaticLinkerSettings` to link replacement settings
- projection from `AutomaticLinkerSettings` to URL formatting settings, if needed

The settings tab remains an Obsidian UI adapter that renders catalog entries into `Setting` controls.

### Testing

Tests should cover:

- every default setting has catalog metadata or an explicit reason it is runtime-only
- link replacement projection includes all fields expected by `ReplaceLinksSettings`
- refresh-required settings match current behavior

## Candidate 4: Deepen Markdown Protected Segments

### Problem

Markdown protection rules appear in multiple modules:

- `replaceLinks` protects code blocks, inline code, existing wikilinks, Markdown links, headings, tables, and callouts.
- URL title replacement and URL discovery perform their own context checks.

The URL title module also documents an incomplete fenced-code check. This is locality friction and an opportunity to put Markdown segmentation behind one module.

### Design

Create a Markdown segment module that divides text into transformable prose and protected segments.

The module should preserve exact text and ordering. Adapters can then transform only prose segments:

- link replacement adapter
- URL discovery adapter
- URL title replacement adapter

This stage should be conservative. If extracting all segment rules at once is too risky, start with fenced code, inline code, Markdown links, and wikilinks, then fold headings, tables, and callouts into the same module after tests are in place.

### Testing

Tests should cover exact round-trip reconstruction and per-segment transformation for:

- inline code
- fenced code blocks, including unclosed fences
- existing wikilinks
- Markdown links
- headings when ignored
- Markdown tables when ignored
- Obsidian callouts

## Candidate 5: Deepen URL Formatting Adapters

### Problem

URL formatting has separate adapter modules for GitHub, Jira, and Linear, but orchestration is split:

- `main.ts` chooses individual passes.
- `replaceURLs` runs a formatter over URL matches.
- `github.ts` imports sibling formatters through `formatURL`, creating adapter coupling.

This is a shallow seam: there are already multiple adapters, but the module that should own ordering and one pass over URLs does not yet own them fully.

### Design

Create a URL formatting module that owns:

- URL discovery in transformable prose
- adapter ordering
- selecting the first adapter that changes a URL
- preserving current output formats

GitHub, Jira, and Linear modules become independent adapters. They should not import each other.

### Testing

Tests should prove:

- all existing GitHub, Jira, and Linear outputs remain unchanged
- a text body can be processed in one URL formatting call
- adapter ordering is deterministic
- disabled settings prevent matching adapters from changing text

## Data Flow

The target formatting flow is:

1. Obsidian adapter reads active file, selection, or vault file.
2. Obsidian adapter gathers frontmatter, candidate index, settings, URL title map, and link generator.
3. Formatting-run module splits frontmatter from body when needed.
4. Formatting-run module runs URL formatting, URL title replacement, and link replacement using pure modules.
5. Obsidian adapter writes the result back to the editor or vault.
6. Optional plugin integrations such as Prettier and Obsidian Linter remain in `main.ts`.

## Error Handling

Preserve current error behavior:

- Obsidian command callbacks catch and log unexpected errors.
- URL title fetching failures are logged only when debug mode is enabled.
- AI API errors continue to surface through the AI command catch block and notice.
- Pure transformation modules should not create `Notice` instances or call Obsidian APIs.

## Test Strategy

Use TDD for each implementation stage.

The expected test layers are:

- pure module tests for candidate scanning, Markdown segmentation, formatting run, settings projection, and URL formatting orchestration
- existing integration-style tests around `AutomaticLinkerPlugin` only where Obsidian adapter behavior is the subject
- full regression suite after each stage

The baseline regression command is:

```bash
npm run test -- --reporter=dot
```

## Migration Strategy

Each stage should be reversible and independently reviewable.

1. Add tests for the behavior being centralized.
2. Add the new module with minimal implementation.
3. Route one existing caller through the new module.
4. Run focused tests.
5. Route the second caller through the same module.
6. Run the full test suite.
7. Commit the stage.

## Risks

- Candidate scanning is the highest-risk stage because it touches the most behavior in `replaceLinks`.
- Markdown segmentation can accidentally change exact output if placeholder restoration differs from current code.
- Settings catalog work can create broad churn in `settings.ts`; keep the UI adapter mechanical and avoid visual changes.
- URL formatting must preserve current output strings, including the existing link icon and Enterprise URL handling.

## Success Criteria

- All current tests pass after each stage.
- `main.ts` no longer owns pure transformation sequencing.
- `resolveAmbiguities` no longer has a separate simplified candidate scanner.
- Link replacement settings projection exists in one place.
- URL formatting can process all configured adapters through one module call.
- Git status shows only intentional source, test, and documentation changes for each stage.
