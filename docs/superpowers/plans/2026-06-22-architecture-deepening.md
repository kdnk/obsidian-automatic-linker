# Architecture Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the architecture of Obsidian Automatic Linker without changing user-visible behavior.

**Architecture:** Keep Obsidian lifecycle, editor writes, notices, network requests, and command registration in adapter code. Move pure transformation sequencing, candidate scanning, settings projection, Markdown segmentation, and URL formatter orchestration into modules with narrow interfaces and unit tests. Each stage preserves current output strings and leaves the repository in a releasable state.

**Tech Stack:** TypeScript, Obsidian plugin APIs, Vitest, `npm run test -- --reporter=dot`, `npm run tsc`, `npm run lint`.

## Global Constraints

- Do not add new user-facing features.
- Do not change existing settings names, defaults, command ids, or manifest metadata.
- Do not change Obsidian link output formats except where an existing test already expects that behavior.
- Do not replace the current test framework or build tooling.
- Do not introduce a Markdown parser dependency unless a later implementation step proves regex segmentation cannot preserve current behavior.
- Use `git` for version-control operations in this repository.
- Do not access GitHub URLs directly. Use the `gh` CLI for GitHub operations.
- When committing, use English Conventional Commit messages and include a clear description of Why and What.

---

## File Structure

- Create `src/replace-links/candidate-scanner.ts`: owns candidate occurrence discovery shared by link replacement and AI ambiguity resolution.
- Create `src/replace-links/__tests__/candidate-scanner.test.ts`: tests candidate occurrence discovery without AI or rendering.
- Modify `src/replace-links/replace-links.ts`: imports scanner helpers and keeps rendering replacement output.
- Modify `src/utils/resolve-ambiguities.ts`: builds AI requests from candidate scanner output instead of its own simplified trie scan.
- Create `src/formatting-run.ts`: owns pure formatting sequencing for document bodies and whole Markdown documents.
- Create `src/__tests__/formatting-run.test.ts`: tests formatting sequencing without constructing `AutomaticLinkerPlugin`.
- Modify `src/main.ts`: uses formatting run for file, vault, selection, and AI content transformation.
- Create `src/settings/settings-catalog.ts`: owns settings defaults, metadata, refresh rules, and runtime projections.
- Create `src/settings/__tests__/settings-catalog.test.ts`: verifies catalog coverage and projections.
- Modify `src/settings/settings-info.ts`: re-exports settings type and defaults from the catalog.
- Modify `src/settings/settings.ts`: renders settings from catalog metadata while preserving visible labels and descriptions.
- Create `src/markdown-segments.ts`: owns Markdown prose/protected segment splitting and prose mapping.
- Create `src/__tests__/markdown-segments.test.ts`: verifies exact round-trip and prose-only transforms.
- Modify `src/replace-url-with-title/index.ts`: maps URL title replacement over Markdown prose segments.
- Modify `src/replace-url-with-title/utils/list-up-all-urls.ts`: collects URLs only from Markdown prose segments.
- Modify `src/replace-links/replace-links.ts`: uses Markdown segment module for protected regions.
- Create `src/replace-urls/url-formatting.ts`: owns URL formatter adapter ordering and one text pass.
- Create `src/replace-urls/__tests__/url-formatting.test.ts`: tests orchestration across GitHub, Jira, and Linear.
- Modify `src/replace-urls/github.ts`: remove sibling adapter imports from GitHub adapter.
- Modify `src/replace-urls/replace-urls.ts`: keep as compatibility shim that preserves the existing `replaceURLs` interface for current tests and callers.

---

### Task 1: Candidate Scanning Module

**Files:**
- Create: `src/replace-links/candidate-scanner.ts`
- Create: `src/replace-links/__tests__/candidate-scanner.test.ts`
- Modify: `src/replace-links/replace-links.ts`
- Modify: `src/utils/resolve-ambiguities.ts`
- Test: `src/replace-links/__tests__/candidate-scanner.test.ts`
- Test: `src/utils/__tests__/resolve-ambiguities.test.ts`
- Test: `src/replace-links/__tests__/ai-disambiguation.test.ts`

**Interfaces:**
- Consumes: `CandidateData`, `TrieNode`, and `ReplaceLinksSettings`.
- Produces:

```ts
export type CandidateOccurrenceKind = "unlinked" | "existing-wikilink"

export interface CandidateOccurrence {
    kind: CandidateOccurrenceKind
    start: number
    end: number
    text: string
    candidateKey: string
    candidateData: CandidateData
    isInTable: boolean
}

export interface ScanCandidateOccurrencesOptions {
    text: string
    filePath: string
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
    settings?: ReplaceLinksSettings
}

export const scanCandidateOccurrences: (
    options: ScanCandidateOccurrencesOptions,
) => CandidateOccurrence[]

export const getOccurrenceContext: (
    text: string,
    occurrence: CandidateOccurrence,
    maxContext: number,
) => string
```

- Later tasks may import `scanCandidateOccurrences` from `src/replace-links/candidate-scanner.ts`; no later task may recreate candidate matching logic.

- [ ] **Step 1: Write the failing scanner tests**

Create `src/replace-links/__tests__/candidate-scanner.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { buildCandidateTrieForTest } from "./test-helpers"
import {
    getOccurrenceContext,
    scanCandidateOccurrences,
} from "../candidate-scanner"

describe("scanCandidateOccurrences", () => {
    it("reports ambiguous prose candidates and skips inline code", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "work/meeting" },
                { path: "private/meeting" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "`meeting` meeting",
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: { ignoreCase: true, proximityBasedLinking: true },
        })

        expect(occurrences.map(o => ({
            kind: o.kind,
            text: o.text,
            start: o.start,
            end: o.end,
            candidates: o.candidateData.candidates.map(c => c.canonical),
        }))).toEqual([
            {
                kind: "unlinked",
                text: "meeting",
                start: 10,
                end: 17,
                candidates: ["work/meeting", "private/meeting"],
            },
        ])
    })

    it("reports existing wikilinks by their display alias", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "work/meeting" },
                { path: "private/meeting" },
            ],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "Check [[private/meeting|meeting]] notes.",
            filePath: "notes/today",
            trie,
            candidateMap,
            settings: { ignoreCase: true, proximityBasedLinking: true },
        })

        expect(occurrences.map(o => ({
            kind: o.kind,
            text: o.text,
            candidateKey: o.candidateKey,
            candidates: o.candidateData.candidates.map(c => c.canonical),
        }))).toEqual([
            {
                kind: "existing-wikilink",
                text: "[[private/meeting|meeting]]",
                candidateKey: "meeting",
                candidates: ["work/meeting", "private/meeting"],
            },
        ])
    })

    it("filters scoped candidates outside the current namespace", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [
                { path: "pages/team-a/internal" },
                { path: "pages/team-b/internal" },
            ],
            settings: {
                scoped: true,
                baseDir: "pages",
                ignoreCase: true,
            },
        })

        const occurrences = scanCandidateOccurrences({
            text: "internal",
            filePath: "pages/team-a/today",
            trie,
            candidateMap,
            settings: {
                baseDir: "pages",
                ignoreCase: true,
                proximityBasedLinking: true,
            },
        })

        expect(occurrences).toHaveLength(1)
        expect(occurrences[0].candidateData.candidates.map(c => c.canonical)).toEqual([
            "pages/team-a/internal",
        ])
    })
})

describe("getOccurrenceContext", () => {
    it("returns bounded surrounding text for AI requests", () => {
        const occurrence = {
            kind: "unlinked" as const,
            start: 10,
            end: 17,
            text: "meeting",
            candidateKey: "meeting",
            candidateData: { candidates: [] },
            isInTable: false,
        }

        expect(getOccurrenceContext("before -- meeting -- after", occurrence, 4)).toBe(
            " -- meeting -- ",
        )
    })
})
```

- [ ] **Step 2: Run scanner tests to verify RED**

Run:

```bash
npx vitest run src/replace-links/__tests__/candidate-scanner.test.ts
```

Expected: FAIL because `src/replace-links/candidate-scanner.ts` does not exist.

- [ ] **Step 3: Implement candidate scanner**

Create `src/replace-links/candidate-scanner.ts` with the exported interfaces from this task. Move these private helpers from `src/replace-links/replace-links.ts` into the new module, preserving behavior, then import them back into `replace-links.ts`:

```ts
REGEX_PATTERNS
isWordBoundary
isMonthNote
isProtectedLink
isCjkText
isCjkCandidate
isKoreanText
isSentenceStart
buildFallbackIndex
getCurrentNamespace
normalizeCanonicalPath
extractLinkParts
escapeRegExp
extractFencedCodeBlocks
isSelfLink
shouldSkipCandidate
isMarkdownTableLine
isIndexInsideMarkdownTable
findBestCandidateInSameNamespace
```

Implement the exported scanner around those helpers:

```ts
export const scanCandidateOccurrences = ({
    text,
    filePath,
    trie,
    candidateMap,
    settings = {},
}: ScanCandidateOccurrencesOptions): CandidateOccurrence[] => {
    const occurrences: CandidateOccurrence[] = []
    const normalizedText = text.normalize("NFC")
    const fallbackIndex = buildFallbackIndex(candidateMap, settings.ignoreCase)
    const currentNamespace = getCurrentNamespace(filePath, settings.baseDir)

    collectExistingWikilinks(normalizedText, candidateMap, occurrences)
    collectUnlinkedOccurrences({
        text: normalizedText,
        filePath,
        trie,
        candidateMap,
        fallbackIndex,
        currentNamespace,
        settings,
        occurrences,
    })

    return occurrences.sort((a, b) => a.start - b.start)
}

export const getOccurrenceContext = (
    text: string,
    occurrence: CandidateOccurrence,
    maxContext: number,
): string => {
    const start = Math.max(0, occurrence.start - maxContext)
    const end = Math.min(text.length, occurrence.end + maxContext)
    return text.slice(start, end)
}
```

`collectUnlinkedOccurrences` must use the same trie traversal, fallback search, word-boundary, CJK, sentence-case, namespace, date, month-note, and self-link checks that `processStandardText` currently uses. Keep the scanner pure; it must not call a `LinkGenerator` or produce final wiki link strings.

Modify `src/replace-links/replace-links.ts` to import the moved helpers from `./candidate-scanner` and delete their local duplicate definitions. Keep `replaceLinks` rendering behavior unchanged.

- [ ] **Step 4: Run scanner tests to verify GREEN**

Run:

```bash
npx vitest run src/replace-links/__tests__/candidate-scanner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Route AI ambiguity detection through scanner**

Modify `src/utils/resolve-ambiguities.ts` so it no longer scans the trie directly:

```ts
import { CandidateData, TrieNode } from "../trie"
import { AutomaticLinkerSettings } from "../settings/settings-info"
import { resolveAmbiguitiesBatch, AIResolveRequest } from "./ai-client"
import {
    getOccurrenceContext,
    scanCandidateOccurrences,
} from "../replace-links/candidate-scanner"

export const resolveAmbiguities = async (
    text: string,
    candidateMap: Map<string, CandidateData>,
    trie: TrieNode,
    settings: AutomaticLinkerSettings,
): Promise<Map<string, string>> => {
    const occurrences = scanCandidateOccurrences({
        text,
        filePath: "",
        trie,
        candidateMap,
        settings,
    })

    const requests: AIResolveRequest[] = occurrences
        .filter(occurrence => occurrence.candidateData.candidates.length > 1)
        .map((occurrence) => ({
            word: occurrence.text,
            text: getOccurrenceContext(text, occurrence, settings.aiMaxContext),
            candidates: occurrence.candidateData.candidates.map(c => c.canonical),
        }))

    const uniqueRequests = Array.from(new Map(requests.map(r => [r.word, r])).values())
    return await resolveAmbiguitiesBatch(settings, uniqueRequests)
}
```

For existing wikilinks, `occurrence.text` must be the full wikilink string, because `replaceLinks` already uses full wikilink text as the key for replacement.

- [ ] **Step 6: Run focused AI and replacement tests**

Run:

```bash
npx vitest run src/utils/__tests__/resolve-ambiguities.test.ts src/replace-links/__tests__/ai-disambiguation.test.ts src/replace-links/__tests__/replace-links.basic.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full verification for the stage**

Run:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit candidate scanning stage**

Run:

```bash
git add src/replace-links/candidate-scanner.ts src/replace-links/__tests__/candidate-scanner.test.ts src/replace-links/replace-links.ts src/utils/resolve-ambiguities.ts
MSG_FILE=$(mktemp)
cat > "$MSG_FILE" <<'EOF'
refactor(replace-links): centralize candidate scanning

Why:
- Candidate detection was duplicated between link replacement and AI ambiguity resolution, which made matching behavior hard to reason about.
- A single scanner improves locality for namespace, protected-span, case, and CJK matching rules.

What:
- Add a shared candidate scanner module for unlinked text and existing wikilinks.
- Route AI ambiguity request construction through the scanner.
- Keep link rendering behavior unchanged and covered by existing replacement tests.
EOF
git commit -F "$MSG_FILE"
rm -f "$MSG_FILE"
```

---

### Task 2: Formatting Run Module

**Files:**
- Create: `src/formatting-run.ts`
- Create: `src/__tests__/formatting-run.test.ts`
- Modify: `src/main.ts`
- Modify: `src/__tests__/main-url-title-frontmatter.test.ts`
- Test: `src/__tests__/formatting-run.test.ts`
- Test: `src/__tests__/main-url-title-frontmatter.test.ts`
- Test: `src/__tests__/main-link-generator.test.ts`

**Interfaces:**
- Consumes: `AutomaticLinkerSettings`, `ReplaceLinksSettings`, `TrieNode`, `CandidateData`, `LinkGenerator`, and URL title map.
- Produces:

```ts
export interface CandidateIndex {
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
}

export interface FormattingRunOptions {
    content: string
    filePath: string
    contentStart?: number
    frontmatter?: Record<string, unknown>
    settings: AutomaticLinkerSettings
    baseDir?: string
    candidateIndex?: CandidateIndex
    urlTitleMap?: Map<string, string>
    linkGenerator?: LinkGenerator
}

export const toReplaceLinksSettings: (
    settings: AutomaticLinkerSettings,
    baseDir?: string,
) => ReplaceLinksSettings

export const formatMarkdownDocument: (options: FormattingRunOptions) => string

export const formatMarkdownBody: (
    options: Omit<FormattingRunOptions, "content"> & { body: string },
) => string
```

- `formatMarkdownDocument` handles frontmatter splitting.
- `formatMarkdownBody` transforms a body or selection without frontmatter splitting.

- [ ] **Step 1: Write formatting-run tests**

Create `src/__tests__/formatting-run.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { formatMarkdownBody, formatMarkdownDocument, toReplaceLinksSettings } from "../formatting-run"
import { buildCandidateTrieForTest } from "../replace-links/__tests__/test-helpers"
import { DEFAULT_SETTINGS } from "../settings/settings-info"

describe("toReplaceLinksSettings", () => {
    it("projects only replacement settings and applies baseDir", () => {
        expect(toReplaceLinksSettings({
            ...DEFAULT_SETTINGS,
            proximityBasedLinking: false,
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        }, "pages")).toEqual({
            proximityBasedLinking: false,
            baseDir: "pages",
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        })
    })
})

describe("formatMarkdownDocument", () => {
    it("preserves frontmatter and respects URL title opt-out", () => {
        const result = formatMarkdownDocument({
            content: "---\nautomatic-linker-disable-url-title: true\n---\nhttps://example.com",
            filePath: "current-file.md",
            frontmatter: { "automatic-linker-disable-url-title": true },
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: false,
                formatJiraURLs: false,
                formatLinearURLs: false,
                replaceUrlWithTitle: true,
            },
            urlTitleMap: new Map([["https://example.com", "Example Title"]]),
        })

        expect(result).toBe(
            "---\nautomatic-linker-disable-url-title: true\n---\nhttps://example.com",
        )
    })

    it("runs URL formatting, URL titles, and link replacement in order", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const result = formatMarkdownDocument({
            content: "Read TypeScript at https://example.com",
            filePath: "current-file.md",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: false,
                formatJiraURLs: false,
                formatLinearURLs: false,
                replaceUrlWithTitle: true,
                ignoreCase: true,
            },
            candidateIndex: { candidateMap, trie },
            urlTitleMap: new Map([["https://example.com", "Example Title"]]),
        })

        expect(result).toBe("Read [[notes/TypeScript|TypeScript]] at [Example Title](https://example.com)")
    })
})

describe("formatMarkdownBody", () => {
    it("formats selected body text without frontmatter splitting", () => {
        const { candidateMap, trie } = buildCandidateTrieForTest({
            files: [{ path: "notes/TypeScript" }],
            settings: {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            },
        })

        const result = formatMarkdownBody({
            body: "TypeScript",
            filePath: "current-file.md",
            settings: {
                ...DEFAULT_SETTINGS,
                formatGitHubURLs: false,
                formatJiraURLs: false,
                formatLinearURLs: false,
                replaceUrlWithTitle: false,
                ignoreCase: true,
            },
            candidateIndex: { candidateMap, trie },
        })

        expect(result).toBe("[[notes/TypeScript|TypeScript]]")
    })
})
```

- [ ] **Step 2: Run formatting-run tests to verify RED**

Run:

```bash
npx vitest run src/__tests__/formatting-run.test.ts
```

Expected: FAIL because `src/formatting-run.ts` does not exist.

- [ ] **Step 3: Implement formatting-run module**

Create `src/formatting-run.ts`:

```ts
import {
    isUrlTitleReplacementOff,
} from "./frontmatter-utils"
import { replaceLinks, LinkGenerator } from "./replace-links/replace-links"
import { replaceUrlWithTitle } from "./replace-url-with-title"
import { formatGitHubURL } from "./replace-urls/github"
import { formatJiraURL } from "./replace-urls/jira"
import { formatLinearURL } from "./replace-urls/linear"
import { replaceURLs } from "./replace-urls/replace-urls"
import { AutomaticLinkerSettings } from "./settings/settings-info"
import { CandidateData, TrieNode } from "./trie"
import { ReplaceLinksSettings } from "./replace-links/replace-links"

export interface CandidateIndex {
    trie: TrieNode
    candidateMap: Map<string, CandidateData>
}

export interface FormattingRunOptions {
    content: string
    filePath: string
    contentStart?: number
    frontmatter?: Record<string, unknown>
    settings: AutomaticLinkerSettings
    baseDir?: string
    candidateIndex?: CandidateIndex
    urlTitleMap?: Map<string, string>
    linkGenerator?: LinkGenerator
}

export const toReplaceLinksSettings = (
    settings: AutomaticLinkerSettings,
    baseDir?: string,
): ReplaceLinksSettings => ({
    proximityBasedLinking: settings.proximityBasedLinking,
    baseDir,
    ignoreDateFormats: settings.ignoreDateFormats,
    ignoreCase: settings.ignoreCase,
    matchSentenceCase: settings.matchSentenceCase,
    preventSelfLinking: settings.preventSelfLinking,
    removeAliasInDirs: settings.removeAliasInDirs,
    ignoreHeadings: settings.ignoreHeadings,
    ignoreMarkdownTables: settings.ignoreMarkdownTables,
})

export const formatMarkdownBody = ({
    body,
    filePath,
    frontmatter,
    settings,
    baseDir,
    candidateIndex,
    urlTitleMap = new Map(),
    linkGenerator,
}: Omit<FormattingRunOptions, "content"> & { body: string }): string => {
    let updatedBody = body

    if (settings.formatGitHubURLs) {
        updatedBody = replaceURLs(updatedBody, settings, formatGitHubURL)
    }
    if (settings.formatJiraURLs) {
        updatedBody = replaceURLs(updatedBody, settings, formatJiraURL)
    }
    if (settings.formatLinearURLs) {
        updatedBody = replaceURLs(updatedBody, settings, formatLinearURL)
    }
    if (settings.replaceUrlWithTitle && !isUrlTitleReplacementOff(frontmatter)) {
        updatedBody = replaceUrlWithTitle({ body: updatedBody, urlTitleMap })
    }
    if (candidateIndex) {
        updatedBody = replaceLinks({
            body: updatedBody,
            linkResolverContext: {
                filePath: filePath.replace(/\.md$/, ""),
                trie: candidateIndex.trie,
                candidateMap: candidateIndex.candidateMap,
            },
            settings: toReplaceLinksSettings(settings, baseDir),
            linkGenerator,
        })
    }

    return updatedBody
}

const inferContentStart = (content: string): number => {
    const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
    return frontmatter?.[0].length ?? 0
}

export const formatMarkdownDocument = ({
    content,
    contentStart = inferContentStart(content),
    ...options
}: FormattingRunOptions): string => {
    const frontmatterText = content.slice(0, contentStart)
    const body = content.slice(contentStart)
    return frontmatterText + formatMarkdownBody({ ...options, body })
}
```

- [ ] **Step 4: Run formatting-run tests to verify GREEN**

Run:

```bash
npx vitest run src/__tests__/formatting-run.test.ts
```

Expected: PASS.

- [ ] **Step 5: Route `main.ts` through formatting-run**

Modify `src/main.ts`:

```ts
import {
    formatMarkdownBody,
    formatMarkdownDocument,
    toReplaceLinksSettings,
} from "./formatting-run"
```

In `modifyLinks`, replace the URL and link transformation sequence with:

```ts
const baseDir = this.settings.respectNewFileFolderPath ? this.app.vault.getConfig("newFileFolderPath") : undefined
const candidateIndex = this.trie && this.candidateMap
    ? { trie: this.trie, candidateMap: this.candidateMap }
    : undefined

return formatMarkdownDocument({
    content: fileContent,
    filePath,
    contentStart: getFrontMatterInfo(fileContent).contentStart,
    frontmatter,
    settings: this.settings,
    baseDir,
    candidateIndex,
    urlTitleMap: this.urlTitleMap,
    linkGenerator: candidateIndex ? this.createLinkGenerator(filePath) : undefined,
})
```

In `mofifyLinksSelection`, replace the direct `replaceLinks` call with:

```ts
const updatedText = formatMarkdownBody({
    body: selectedText,
    filePath: activeFile.path,
    settings: this.settings,
    baseDir,
    candidateIndex: {
        trie: this.trie,
        candidateMap: this.candidateMap,
    },
    linkGenerator,
})
```

In the AI command, keep `resolvedAmbiguities` rendering in `replaceLinks` until Task 1 scanner output supports direct formatting-run AI rendering. Use `toReplaceLinksSettings(this.settings, baseDir)` rather than passing `this.settings` directly.

- [ ] **Step 6: Move pure URL-title frontmatter test coverage**

In `src/__tests__/main-url-title-frontmatter.test.ts`, keep only the test that verifies `buildUrlTitleMap` does not fetch when active-file frontmatter disables URL titles. Remove the `plugin.modifyLinks` pure transformation test because `src/__tests__/formatting-run.test.ts` now covers it without Obsidian mocks.

- [ ] **Step 7: Run focused main and formatting tests**

Run:

```bash
npx vitest run src/__tests__/formatting-run.test.ts src/__tests__/main-url-title-frontmatter.test.ts src/__tests__/main-link-generator.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full verification for the stage**

Run:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit formatting-run stage**

Run:

```bash
git add src/formatting-run.ts src/__tests__/formatting-run.test.ts src/main.ts src/__tests__/main-url-title-frontmatter.test.ts
MSG_FILE=$(mktemp)
cat > "$MSG_FILE" <<'EOF'
refactor: extract pure formatting run

Why:
- main.ts mixed Obsidian adapter work with pure transformation sequencing, which made formatting behavior require plugin mocks to test.
- A pure formatting run increases locality for URL formatting, URL title replacement, and link replacement order.

What:
- Add a formatting-run module with document and body formatting entry points.
- Route file and selection formatting through the new module.
- Move pure frontmatter URL-title coverage out of main adapter tests.
EOF
git commit -F "$MSG_FILE"
rm -f "$MSG_FILE"
```

---

### Task 3: Settings Catalog Module

**Files:**
- Create: `src/settings/settings-catalog.ts`
- Create: `src/settings/__tests__/settings-catalog.test.ts`
- Modify: `src/settings/settings-info.ts`
- Modify: `src/settings/settings.ts`
- Modify: `src/formatting-run.ts`
- Test: `src/settings/__tests__/settings-catalog.test.ts`

**Interfaces:**
- Produces:

```ts
export type AutomaticLinkerSettings = {
    formatOnSave: boolean
    showNotice: boolean
    respectNewFileFolderPath: boolean
    includeAliases: boolean
    proximityBasedLinking: boolean
    ignoreDateFormats: boolean
    ignoreHeadings: boolean
    formatGitHubURLs: boolean
    githubEnterpriseURLs: string[]
    formatJiraURLs: boolean
    jiraURLs: string[]
    formatLinearURLs: boolean
    debug: boolean
    ignoreCase: boolean
    matchSentenceCase: boolean
    replaceUrlWithTitle: boolean
    replaceUrlWithTitleIgnoreDomains: string[]
    excludeDirsFromAutoLinking: string[]
    preventSelfLinking: boolean
    removeAliasInDirs: string[]
    ignoreMarkdownTables: boolean
    runLinterAfterFormatting: boolean
    runPrettierAfterFormatting: boolean
    formatDelayMs: number
    aiEnabled: boolean
    aiEndpoint: string
    aiModel: string
    aiMaxContext: number
}

export type SettingControl = "toggle" | "text" | "textarea"

export interface SettingCatalogEntry<K extends keyof AutomaticLinkerSettings = keyof AutomaticLinkerSettings> {
    key: K
    group: string
    name: string
    description: string
    control: SettingControl
    placeholder?: string
    multiline?: boolean
    refreshesIndex: boolean
    runtimeOnly?: boolean
}

export const DEFAULT_SETTINGS: AutomaticLinkerSettings
export const SETTINGS_CATALOG: readonly SettingCatalogEntry[]
export const settingRefreshesIndex: (key: keyof AutomaticLinkerSettings) => boolean
export const projectReplaceLinksSettings: (
    settings: AutomaticLinkerSettings,
    baseDir?: string,
) => ReplaceLinksSettings
export const projectUrlFormattingSettings: (
    settings: AutomaticLinkerSettings,
) => Pick<AutomaticLinkerSettings, "formatGitHubURLs" | "githubEnterpriseURLs" | "formatJiraURLs" | "jiraURLs" | "formatLinearURLs">
```

- [ ] **Step 1: Write settings catalog tests**

Create `src/settings/__tests__/settings-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
    DEFAULT_SETTINGS,
    SETTINGS_CATALOG,
    projectReplaceLinksSettings,
    projectUrlFormattingSettings,
    settingRefreshesIndex,
} from "../settings-catalog"

describe("SETTINGS_CATALOG", () => {
    it("covers every default setting exactly once", () => {
        const defaultKeys = Object.keys(DEFAULT_SETTINGS).sort()
        const catalogKeys = SETTINGS_CATALOG.map(entry => entry.key).sort()

        expect(catalogKeys).toEqual(defaultKeys)
        expect(new Set(catalogKeys).size).toBe(catalogKeys.length)
    })

    it("marks current index-refresh settings", () => {
        expect(settingRefreshesIndex("respectNewFileFolderPath")).toBe(true)
        expect(settingRefreshesIndex("includeAliases")).toBe(true)
        expect(settingRefreshesIndex("proximityBasedLinking")).toBe(true)
        expect(settingRefreshesIndex("ignoreDateFormats")).toBe(true)
        expect(settingRefreshesIndex("ignoreCase")).toBe(true)
        expect(settingRefreshesIndex("preventSelfLinking")).toBe(true)
        expect(settingRefreshesIndex("excludeDirsFromAutoLinking")).toBe(true)
        expect(settingRefreshesIndex("removeAliasInDirs")).toBe(true)
        expect(settingRefreshesIndex("debug")).toBe(false)
    })
})

describe("settings projections", () => {
    it("projects link replacement settings", () => {
        expect(projectReplaceLinksSettings({
            ...DEFAULT_SETTINGS,
            proximityBasedLinking: false,
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        }, "pages")).toEqual({
            proximityBasedLinking: false,
            baseDir: "pages",
            ignoreDateFormats: false,
            ignoreCase: false,
            matchSentenceCase: false,
            preventSelfLinking: true,
            removeAliasInDirs: ["archive"],
            ignoreHeadings: true,
            ignoreMarkdownTables: true,
        })
    })

    it("projects URL formatting settings", () => {
        expect(projectUrlFormattingSettings({
            ...DEFAULT_SETTINGS,
            formatGitHubURLs: false,
            githubEnterpriseURLs: ["github.enterprise.com"],
            formatJiraURLs: false,
            jiraURLs: ["jira.example.com"],
            formatLinearURLs: true,
        })).toEqual({
            formatGitHubURLs: false,
            githubEnterpriseURLs: ["github.enterprise.com"],
            formatJiraURLs: false,
            jiraURLs: ["jira.example.com"],
            formatLinearURLs: true,
        })
    })
})
```

- [ ] **Step 2: Run catalog tests to verify RED**

Run:

```bash
npx vitest run src/settings/__tests__/settings-catalog.test.ts
```

Expected: FAIL because `src/settings/settings-catalog.ts` does not exist.

- [ ] **Step 3: Implement settings catalog**

Create `src/settings/settings-catalog.ts` by moving the `AutomaticLinkerSettings` type and `DEFAULT_SETTINGS` object from `src/settings/settings-info.ts` into the new file. Add `SETTINGS_CATALOG` entries for every setting. Preserve every current name, description, placeholder, default, and refresh behavior from `src/settings/settings.ts`.

The projection functions must be:

```ts
export const projectReplaceLinksSettings = (
    settings: AutomaticLinkerSettings,
    baseDir?: string,
): ReplaceLinksSettings => ({
    proximityBasedLinking: settings.proximityBasedLinking,
    baseDir,
    ignoreDateFormats: settings.ignoreDateFormats,
    ignoreCase: settings.ignoreCase,
    matchSentenceCase: settings.matchSentenceCase,
    preventSelfLinking: settings.preventSelfLinking,
    removeAliasInDirs: settings.removeAliasInDirs,
    ignoreHeadings: settings.ignoreHeadings,
    ignoreMarkdownTables: settings.ignoreMarkdownTables,
})

export const projectUrlFormattingSettings = (
    settings: AutomaticLinkerSettings,
) => ({
    formatGitHubURLs: settings.formatGitHubURLs,
    githubEnterpriseURLs: settings.githubEnterpriseURLs,
    formatJiraURLs: settings.formatJiraURLs,
    jiraURLs: settings.jiraURLs,
    formatLinearURLs: settings.formatLinearURLs,
})

export const settingRefreshesIndex = (
    key: keyof AutomaticLinkerSettings,
): boolean => SETTINGS_CATALOG.find(entry => entry.key === key)?.refreshesIndex ?? false
```

Modify `src/settings/settings-info.ts` to preserve imports from existing callers:

```ts
export type { AutomaticLinkerSettings } from "./settings-catalog"
export { DEFAULT_SETTINGS } from "./settings-catalog"
```

Modify `src/formatting-run.ts` to import `projectReplaceLinksSettings` and remove its local `toReplaceLinksSettings` implementation. Re-export the projection for existing imports:

```ts
export { projectReplaceLinksSettings as toReplaceLinksSettings } from "./settings/settings-catalog"
```

- [ ] **Step 4: Run catalog tests to verify GREEN**

Run:

```bash
npx vitest run src/settings/__tests__/settings-catalog.test.ts src/__tests__/formatting-run.test.ts
```

Expected: PASS.

- [ ] **Step 5: Render settings tab from catalog metadata**

Modify `src/settings/settings.ts` so the `display()` method iterates grouped catalog entries. Keep save behavior identical:

```ts
import { App, PluginSettingTab, Setting } from "obsidian"
import AutomaticLinkerPlugin from "../main"
import {
    AutomaticLinkerSettings,
    SETTINGS_CATALOG,
    SettingCatalogEntry,
    settingRefreshesIndex,
} from "./settings-catalog"
```

Add private helpers to `AutomaticLinkerPluginSettingsTab`:

```ts
private async setSettingValue<K extends keyof AutomaticLinkerSettings>(
    key: K,
    value: AutomaticLinkerSettings[K],
) {
    this.plugin.settings[key] = value
    await this.plugin.saveData(this.plugin.settings)
    if (settingRefreshesIndex(key)) {
        this.plugin.refreshFileDataAndTrie()
    }
}

private renderSetting(containerEl: HTMLElement, entry: SettingCatalogEntry) {
    const setting = new Setting(containerEl)
        .setName(entry.name)
        .setDesc(entry.description)

    const value = this.plugin.settings[entry.key]
    if (entry.control === "toggle") {
        setting.addToggle((toggle) => {
            toggle
                .setValue(Boolean(value))
                .onChange(async nextValue => {
                    await this.setSettingValue(entry.key, nextValue as never)
                })
        })
    }
    if (entry.control === "text") {
        setting.addText((text) => {
            text.setPlaceholder(entry.placeholder ?? "")
                .setValue(String(value))
                .onChange(async nextValue => {
                    const parsedValue = typeof value === "number"
                        ? parseInt(nextValue)
                        : nextValue
                    if (typeof value === "number" && (isNaN(parsedValue as number) || (parsedValue as number) < 0)) {
                        return
                    }
                    await this.setSettingValue(entry.key, parsedValue as never)
                })
        })
    }
    if (entry.control === "textarea") {
        setting.addTextArea((text) => {
            text.setPlaceholder(entry.placeholder ?? "")
                .setValue(Array.isArray(value) ? value.join("\n") : String(value))
                .onChange(async nextValue => {
                    await this.setSettingValue(
                        entry.key,
                        nextValue.split("\n").map(item => item.trim()).filter(Boolean) as never,
                    )
                })
            text.inputEl.rows = 4
            text.inputEl.cols = 50
        })
    }
}
```

In `display()`, render groups in catalog order:

```ts
const renderedGroups = new Set<string>()
for (const entry of SETTINGS_CATALOG) {
    if (!renderedGroups.has(entry.group)) {
        new Setting(containerEl).setName(entry.group).setHeading()
        renderedGroups.add(entry.group)
    }
    this.renderSetting(containerEl, entry)
}
```

Keep the current special side effects by encoding them in catalog-driven rendering:

- `replaceUrlWithTitleIgnoreDomains` on change calls `await this.plugin.buildUrlTitleMap()` after saving.
- Numeric settings reject invalid values. `formatDelayMs` accepts `0`; `aiMaxContext` accepts values greater than `0`.

- [ ] **Step 6: Run settings and full adapter tests**

Run:

```bash
npx vitest run src/settings/__tests__/settings-catalog.test.ts src/__tests__/main-link-generator.test.ts src/__tests__/main-url-title-frontmatter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full verification for the stage**

Run:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit settings catalog stage**

Run:

```bash
git add src/settings/settings-catalog.ts src/settings/__tests__/settings-catalog.test.ts src/settings/settings-info.ts src/settings/settings.ts src/formatting-run.ts
MSG_FILE=$(mktemp)
cat > "$MSG_FILE" <<'EOF'
refactor(settings): centralize settings catalog

Why:
- Adding a setting required coordinated edits across defaults, UI, index refresh behavior, and runtime projections.
- A catalog gives settings changes one locality point while preserving current user-facing labels and defaults.

What:
- Move settings defaults and metadata into a catalog module.
- Add projection helpers for link replacement and URL formatting.
- Render the settings tab from catalog entries without changing visible settings.
EOF
git commit -F "$MSG_FILE"
rm -f "$MSG_FILE"
```

---

### Task 4: Markdown Segment Module

**Files:**
- Create: `src/markdown-segments.ts`
- Create: `src/__tests__/markdown-segments.test.ts`
- Modify: `src/replace-links/replace-links.ts`
- Modify: `src/replace-url-with-title/index.ts`
- Modify: `src/replace-url-with-title/utils/list-up-all-urls.ts`
- Test: `src/__tests__/markdown-segments.test.ts`
- Test: `src/replace-links/__tests__/replace-links.code.test.ts`
- Test: `src/replace-links/__tests__/replace-links.callout.test.ts`
- Test: `src/replace-url-with-title/utils/__tests__/list-up-all-urls.test.ts`

**Interfaces:**
- Produces:

```ts
export type MarkdownSegmentKind = "prose" | "protected"
export type MarkdownProtectedKind =
    | "inline-code"
    | "fenced-code"
    | "wikilink"
    | "markdown-link"
    | "single-bracket"
    | "url"
    | "heading"
    | "callout"
    | "table-row"

export interface MarkdownSegment {
    kind: MarkdownSegmentKind
    protectedKind?: MarkdownProtectedKind
    start: number
    end: number
    text: string
}

export interface SegmentMarkdownOptions {
    protectHeadings?: boolean
    protectCallouts?: boolean
    protectTableRows?: boolean
    protectUrls?: boolean
}

export const segmentMarkdown: (
    text: string,
    options?: SegmentMarkdownOptions,
) => MarkdownSegment[]

export const mapMarkdownProse: (
    text: string,
    transform: (segmentText: string, segment: MarkdownSegment) => string,
    options?: SegmentMarkdownOptions,
) => string
```

- [ ] **Step 1: Write Markdown segment tests**

Create `src/__tests__/markdown-segments.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { mapMarkdownProse, segmentMarkdown } from "../markdown-segments"

describe("segmentMarkdown", () => {
    it("round-trips prose and protected inline code", () => {
        const text = "Use `TypeScript` with TypeScript"
        const segments = segmentMarkdown(text)

        expect(segments.map(segment => ({
            kind: segment.kind,
            protectedKind: segment.protectedKind,
            text: segment.text,
        }))).toEqual([
            { kind: "prose", protectedKind: undefined, text: "Use " },
            { kind: "protected", protectedKind: "inline-code", text: "`TypeScript`" },
            { kind: "prose", protectedKind: undefined, text: " with TypeScript" },
        ])
        expect(segments.map(segment => segment.text).join("")).toBe(text)
    })

    it("protects fenced code blocks including unclosed blocks", () => {
        const text = "before\n```ts\nTypeScript"
        const segments = segmentMarkdown(text)

        expect(segments.map(segment => ({
            kind: segment.kind,
            protectedKind: segment.protectedKind,
            text: segment.text,
        }))).toEqual([
            { kind: "prose", protectedKind: undefined, text: "before\n" },
            { kind: "protected", protectedKind: "fenced-code", text: "```ts\nTypeScript" },
        ])
    })

    it("protects headings, tables, and callouts when requested", () => {
        const text = "# TypeScript\n| TypeScript |\n> [!note]\n> TypeScript\nTypeScript"
        const segments = segmentMarkdown(text, {
            protectHeadings: true,
            protectTableRows: true,
            protectCallouts: true,
        })

        expect(segments.filter(segment => segment.kind === "protected").map(segment => segment.protectedKind)).toEqual([
            "heading",
            "table-row",
            "callout",
        ])
        expect(segments.map(segment => segment.text).join("")).toBe(text)
    })
})

describe("mapMarkdownProse", () => {
    it("transforms only prose segments", () => {
        const result = mapMarkdownProse(
            "TypeScript `TypeScript` [[TypeScript]]",
            text => text.replaceAll("TypeScript", "TS"),
        )

        expect(result).toBe("TS `TypeScript` [[TypeScript]]")
    })
})
```

- [ ] **Step 2: Run Markdown segment tests to verify RED**

Run:

```bash
npx vitest run src/__tests__/markdown-segments.test.ts
```

Expected: FAIL because `src/markdown-segments.ts` does not exist.

- [ ] **Step 3: Implement Markdown segment module**

Create `src/markdown-segments.ts`. Implement `segmentMarkdown` as a single ordered scanner:

```ts
const PROTECTED_PATTERN = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`]*`|\[\[([^\]]+)\]\]|\[[^\]]+\]\([^)]+\)|\[[^\]]+\])/g
```

Before applying `PROTECTED_PATTERN`, collect optional block ranges for headings, callouts, and table rows. Merge overlapping protected ranges, sort by start index, and emit alternating prose/protected segments. `mapMarkdownProse` must join transformed prose with original protected text:

```ts
export const mapMarkdownProse = (
    text: string,
    transform: (segmentText: string, segment: MarkdownSegment) => string,
    options: SegmentMarkdownOptions = {},
): string => {
    return segmentMarkdown(text, options)
        .map(segment => segment.kind === "prose" ? transform(segment.text, segment) : segment.text)
        .join("")
}
```

- [ ] **Step 4: Run Markdown segment tests to verify GREEN**

Run:

```bash
npx vitest run src/__tests__/markdown-segments.test.ts
```

Expected: PASS.

- [ ] **Step 5: Route URL title modules through Markdown prose mapping**

Modify `src/replace-url-with-title/index.ts`:

```ts
import { mapMarkdownProse } from "../markdown-segments"
```

Wrap the existing URL replacement loop so it only receives prose:

```ts
return mapMarkdownProse(resultBody, replaceUrlsInProse)
```

Move the current loop body into:

```ts
const replaceUrlsInProse = (prose: string): string => {
    let resultBody = prose
    // current sorted URL replacement loop
    return resultBody
}
```

Modify `src/replace-url-with-title/utils/list-up-all-urls.ts` to iterate prose segments:

```ts
import { segmentMarkdown } from "../../markdown-segments"

for (const segment of segmentMarkdown(body)) {
    if (segment.kind === "protected") continue
    URL_REGEX.lastIndex = 0
    while ((match = URL_REGEX.exec(segment.text)) !== null) {
        const url = match[0]
        const matchIndex = segment.start + match.index
        // preserve existing markdown-link, angle-bracket, inline-code, domain, and punctuation checks that still apply
    }
}
```

- [ ] **Step 6: Route replace-links protected regions through Markdown segments**

Modify `src/replace-links/replace-links.ts` so `replaceLinks` calls `mapMarkdownProse` instead of manually replacing code blocks, headings, callouts, protected links, and table rows with placeholders:

```ts
import { mapMarkdownProse } from "../markdown-segments"
```

The final body processing should become:

```ts
return mapMarkdownProse(
    body,
    processTableAwareTextSegment,
    {
        protectHeadings: settings.ignoreHeadings,
        protectCallouts: true,
        protectTableRows: settings.ignoreMarkdownTables,
        protectUrls: true,
    },
)
```

Keep existing-link replacement behavior for `resolvedAmbiguities` by allowing wikilinks to be handled before protected mapping when `resolvedAmbiguities` has the full wikilink key. Preserve the current tests in `src/replace-links/__tests__/ai-disambiguation.test.ts`.

- [ ] **Step 7: Run focused Markdown and transformation tests**

Run:

```bash
npx vitest run src/__tests__/markdown-segments.test.ts src/replace-links/__tests__/replace-links.code.test.ts src/replace-links/__tests__/replace-links.callout.test.ts src/replace-links/__tests__/replace-links.table.test.ts src/replace-url-with-title/utils/__tests__/list-up-all-urls.test.ts src/replace-url-with-title/__tests__/replace-url-with-title.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full verification for the stage**

Run:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit Markdown segment stage**

Run:

```bash
git add src/markdown-segments.ts src/__tests__/markdown-segments.test.ts src/replace-links/replace-links.ts src/replace-url-with-title/index.ts src/replace-url-with-title/utils/list-up-all-urls.ts
MSG_FILE=$(mktemp)
cat > "$MSG_FILE" <<'EOF'
refactor(markdown): centralize protected segment handling

Why:
- Link replacement and URL title code each carried their own Markdown context checks, which made protected text behavior hard to keep consistent.
- A shared Markdown segment module improves locality for prose-only transformations.

What:
- Add a pure Markdown segment module with prose mapping.
- Route link replacement and URL title flows through shared protected segment handling.
- Preserve exact output for code blocks, links, tables, headings, and callouts.
EOF
git commit -F "$MSG_FILE"
rm -f "$MSG_FILE"
```

---

### Task 5: URL Formatting Module

**Files:**
- Create: `src/replace-urls/url-formatting.ts`
- Create: `src/replace-urls/__tests__/url-formatting.test.ts`
- Modify: `src/replace-urls/github.ts`
- Modify: `src/replace-urls/replace-urls.ts`
- Modify: `src/formatting-run.ts`
- Test: `src/replace-urls/__tests__/url-formatting.test.ts`
- Test: `src/replace-urls/__tests__/replace-urls.github.test.ts`
- Test: `src/replace-urls/__tests__/replace-urls.jira.test.ts`
- Test: `src/replace-urls/__tests__/replace-urls.linear.test.ts`

**Interfaces:**
- Produces:

```ts
export type UrlFormatter = (
    url: string,
    settings: AutomaticLinkerSettings,
) => string

export interface FormatURLsInTextOptions {
    text: string
    settings: AutomaticLinkerSettings
    formatters?: UrlFormatter[]
}

export const DEFAULT_URL_FORMATTERS: readonly UrlFormatter[]
export const formatURLWithAdapters: (
    url: string,
    settings: AutomaticLinkerSettings,
    formatters?: readonly UrlFormatter[],
) => string
export const formatURLsInText: (options: FormatURLsInTextOptions) => string
```

- [ ] **Step 1: Write URL formatting orchestration tests**

Create `src/replace-urls/__tests__/url-formatting.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "../../settings/settings-info"
import {
    formatURLsInText,
    formatURLWithAdapters,
    UrlFormatter,
} from "../url-formatting"

describe("formatURLWithAdapters", () => {
    it("uses the first adapter that changes the URL", () => {
        const first: UrlFormatter = url => `${url}-first`
        const second: UrlFormatter = url => `${url}-second`

        expect(formatURLWithAdapters("https://example.com", DEFAULT_SETTINGS, [first, second])).toBe(
            "https://example.com-first",
        )
    })

    it("returns the original URL when no adapter changes it", () => {
        const unchanged: UrlFormatter = url => url

        expect(formatURLWithAdapters("https://example.com", DEFAULT_SETTINGS, [unchanged])).toBe(
            "https://example.com",
        )
    })
})

describe("formatURLsInText", () => {
    it("formats GitHub, Jira, and Linear URLs in one text pass", () => {
        const result = formatURLsInText({
            text: [
                "https://github.com/owner/repo/issues/123",
                "https://jira.company.com/browse/ABC-456",
                "https://linear.app/team/issue/BUG-789/title",
            ].join("\n"),
            settings: {
                ...DEFAULT_SETTINGS,
                githubEnterpriseURLs: [],
                jiraURLs: ["jira.company.com"],
                formatGitHubURLs: true,
                formatJiraURLs: true,
                formatLinearURLs: true,
            },
        })

        expect(result).toBe([
            "[[github/owner/repo/issues/123]] [🔗](https://github.com/owner/repo/issues/123)",
            "[[company/jira/ABC/456]] [🔗](https://jira.company.com/browse/ABC-456)",
            "[[linear/team/BUG-789]] [🔗](https://linear.app/team/issue/BUG-789)",
        ].join("\n"))
    })

    it("leaves disabled adapter URLs unchanged", () => {
        const result = formatURLsInText({
            text: "https://linear.app/team/issue/BUG-789/title",
            settings: {
                ...DEFAULT_SETTINGS,
                formatLinearURLs: false,
            },
        })

        expect(result).toBe("https://linear.app/team/issue/BUG-789/title")
    })
})
```

- [ ] **Step 2: Run URL formatting tests to verify RED**

Run:

```bash
npx vitest run src/replace-urls/__tests__/url-formatting.test.ts
```

Expected: FAIL because `src/replace-urls/url-formatting.ts` does not exist.

- [ ] **Step 3: Implement URL formatting module**

Create `src/replace-urls/url-formatting.ts`:

```ts
import { AutomaticLinkerSettings } from "../settings/settings-info"
import { formatGitHubURL } from "./github"
import { formatJiraURL } from "./jira"
import { formatLinearURL } from "./linear"
import { mapMarkdownProse } from "../markdown-segments"

export type UrlFormatter = (
    url: string,
    settings: AutomaticLinkerSettings,
) => string

export interface FormatURLsInTextOptions {
    text: string
    settings: AutomaticLinkerSettings
    formatters?: readonly UrlFormatter[]
}

export const DEFAULT_URL_FORMATTERS: readonly UrlFormatter[] = [
    formatGitHubURL,
    formatJiraURL,
    formatLinearURL,
]

const URL_PATTERN = /(?<!\[\[.*)(https?:\/\/[^\s\]]+|linear:\/\/[^\s\]]+)(?!.*\]\])/g

export const formatURLWithAdapters = (
    url: string,
    settings: AutomaticLinkerSettings,
    formatters: readonly UrlFormatter[] = DEFAULT_URL_FORMATTERS,
): string => {
    for (const formatter of formatters) {
        const formatted = formatter(url, settings)
        if (formatted !== url) {
            return formatted
        }
    }
    return url
}

export const formatURLsInText = ({
    text,
    settings,
    formatters = DEFAULT_URL_FORMATTERS,
}: FormatURLsInTextOptions): string => {
    return mapMarkdownProse(text, prose => prose.replace(URL_PATTERN, match => {
        return formatURLWithAdapters(match, settings, formatters)
    }))
}
```

Modify `src/replace-urls/github.ts` to remove imports from `./jira` and `./linear`, and delete the exported `formatURL` function from that file. `formatGitHubURL` must remain unchanged.

Modify `src/replace-urls/replace-urls.ts` to preserve the existing public helper for tests and compatibility:

```ts
import { AutomaticLinkerSettings } from "../settings/settings-info"

export const replaceURLs = (
    fileContent: string,
    settings: AutomaticLinkerSettings,
    formatter: (url: string, settings: AutomaticLinkerSettings) => string,
) => {
    const urlPattern = /(?<!\[\[.*)(https?:\/\/[^\s\]]+|linear:\/\/[^\s\]]+)(?!.*\]\])/g
    return fileContent.replace(urlPattern, match => formatter(match, settings))
}
```

- [ ] **Step 4: Run URL formatting tests to verify GREEN**

Run:

```bash
npx vitest run src/replace-urls/__tests__/url-formatting.test.ts src/replace-urls/__tests__/replace-urls.github.test.ts src/replace-urls/__tests__/replace-urls.jira.test.ts src/replace-urls/__tests__/replace-urls.linear.test.ts
```

Expected: PASS.

- [ ] **Step 5: Route formatting-run through one URL formatting call**

Modify `src/formatting-run.ts` to import:

```ts
import { formatURLsInText } from "./replace-urls/url-formatting"
```

Replace the three URL formatting passes with:

```ts
updatedBody = formatURLsInText({
    text: updatedBody,
    settings,
})
```

Remove direct imports of `formatGitHubURL`, `formatJiraURL`, `formatLinearURL`, and `replaceURLs` from `src/formatting-run.ts`.

- [ ] **Step 6: Run focused formatting tests**

Run:

```bash
npx vitest run src/__tests__/formatting-run.test.ts src/replace-urls/__tests__/url-formatting.test.ts src/replace-urls/__tests__/replace-urls.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full verification for the stage**

Run:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit URL formatting stage**

Run:

```bash
git add src/replace-urls/url-formatting.ts src/replace-urls/__tests__/url-formatting.test.ts src/replace-urls/github.ts src/replace-urls/replace-urls.ts src/formatting-run.ts
MSG_FILE=$(mktemp)
cat > "$MSG_FILE" <<'EOF'
refactor(replace-urls): centralize URL formatter orchestration

Why:
- URL formatter adapters existed, but ordering and text traversal were split across main formatting code and adapter modules.
- A central URL formatting module gives adapter ordering one locality point.

What:
- Add one-pass URL formatting orchestration for GitHub, Jira, and Linear adapters.
- Remove sibling adapter coupling from the GitHub formatter module.
- Route formatting-run through the central URL formatting module.
EOF
git commit -F "$MSG_FILE"
rm -f "$MSG_FILE"
```

---

## Final Verification

- [ ] **Step 1: Run the full regression suite**

Run:

```bash
npm run test -- --reporter=dot
npm run tsc
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect architecture-focused diffs**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:
- working tree is clean after all stage commits
- recent commits are the five architecture deepening stage commits

- [ ] **Step 3: Confirm success criteria**

Confirm these statements against the final source:

- `src/main.ts` no longer owns pure transformation sequencing.
- `src/utils/resolve-ambiguities.ts` no longer has a direct trie scanning loop.
- `src/settings/settings-catalog.ts` owns settings defaults, metadata, refresh flags, and projections.
- `src/markdown-segments.ts` is used by link replacement and URL title modules.
- `src/replace-urls/url-formatting.ts` owns URL adapter ordering and text traversal.
