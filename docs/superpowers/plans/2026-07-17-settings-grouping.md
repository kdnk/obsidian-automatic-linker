# Settings Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定画面と README の28設定を、利用目的に基づく同一の6グループへ再編する。

**Architecture:** SETTINGS_CATALOG を設定画面のグループ名と表示順の単一の情報源として維持し、既存の PluginSettingTab はそのカタログを機械的に描画する。保存キー、既定値、制御種別、更新処理は変えず、README の Configuration だけを同じ分類へ同期する。

**Tech Stack:** TypeScript、Obsidian Plugin API、Vitest、ESLint、npm、GitButler CLI。

## Global Constraints

- 各設定項目のキー、表示名、説明文、既定値を変更しない。
- 設定値の保存形式、読み込み処理、実行時動作を変更しない。
- 折りたたみ、タブ、入れ子の見出し、独自 CSS、依存関係による表示切り替えを追加しない。
- 設定画面と README は、同じ6グループ、同じ所属、同じ順序を持つ。
- README の Configuration は28個の永続設定だけを列挙する。
- automatic-linker-disable-url-title は Configuration から重複を除き、既存の Frontmatter Options で引き続き説明する。
- AGENTS.md の既存変更は今回のコミットへ含めない。
- バージョン管理の書き込みには but を使う。
- コミットは英語の Conventional Commits とし、Why と What を本文に記載する。
- GitHub URL へ直接アクセスしない。

---

## File Structure

- Modify: src/settings/__tests__/settings-catalog.test.ts
  - グループ名、所属、表示順、グループの連続性を一つの期待値で固定する。
  - テキストエリアのサイズ指定テストを、表示順から独立した検証へ直す。
- Modify: src/settings/settings-catalog.ts
  - 既存の28エントリを6つの連続したグループへ並べ替える。
  - group 以外のメタデータは変更しない。
- Modify: README.md
  - Configuration を設定画面と同じ6見出し、同じ設定順へ置き換える。
  - 未掲載の Match sentence case、Ignore headings、Ignore Markdown tables を追加する。

---

### Task 1: 設定カタログのグループ契約

**Files:**
- Modify: src/settings/__tests__/settings-catalog.test.ts:10-44
- Modify: src/settings/settings-catalog.ts:81-352
- Test: src/settings/__tests__/settings-catalog.test.ts

**Interfaces:**
- Consumes: 既存の SETTINGS_CATALOG と DEFAULT_SETTINGS。
- Produces: 既存の readonly SettingCatalogEntry[] インターフェースを保った、6グループの連続した設定カタログ。
- Produces: 設定タブが先頭から描画できる確定済みの表示順。

- [ ] **Step 1: グループ構成を固定する失敗テストを書く**

src/settings/__tests__/settings-catalog.test.ts のカタログ網羅テスト直後へ、次のテストを追加する。

~~~ts
it("groups settings by user workflow in display order", () => {
    const expectedGroups = [
        {
            group: "Formatting Workflow",
            keys: [
                "formatOnSave",
                "formatDelayMs",
                "runPrettierAfterFormatting",
                "runLinterAfterFormatting",
            ],
        },
        {
            group: "Link Behavior",
            keys: [
                "respectNewFileFolderPath",
                "proximityBasedLinking",
                "includeAliases",
                "removeAliasInDirs",
                "ignoreCase",
                "matchSentenceCase",
            ],
        },
        {
            group: "Exclusions",
            keys: [
                "preventSelfLinking",
                "ignoreDateFormats",
                "ignoreHeadings",
                "ignoreMarkdownTables",
                "excludeDirsFromAutoLinking",
            ],
        },
        {
            group: "URL Formatting",
            keys: [
                "formatGitHubURLs",
                "githubEnterpriseURLs",
                "formatJiraURLs",
                "jiraURLs",
                "formatLinearURLs",
                "replaceUrlWithTitle",
                "replaceUrlWithTitleIgnoreDomains",
            ],
        },
        {
            group: "AI Link Enhancement (Beta)",
            keys: [
                "aiEnabled",
                "aiEndpoint",
                "aiModel",
                "aiMaxContext",
            ],
        },
        {
            group: "Diagnostics",
            keys: ["showNotice", "debug"],
        },
    ]

    const actualGroups = SETTINGS_CATALOG.reduce<Array<{
        group: string
        keys: Array<keyof typeof DEFAULT_SETTINGS>
    }>>((groups, entry) => {
        const currentGroup = groups[groups.length - 1]
        if (currentGroup?.group === entry.group) {
            currentGroup.keys.push(entry.key)
            return groups
        }

        groups.push({
            group: entry.group,
            keys: [entry.key],
        })
        return groups
    }, [])

    expect(actualGroups).toEqual(expectedGroups)
})
~~~

同じファイルのテキストエリアサイズ検証は、表示順ではなく対象キーだけを検証する形へ置き換える。

~~~ts
it("marks only the URL textarea settings for explicit sizing", () => {
    const sizedTextareaKeys = SETTINGS_CATALOG
        .filter(entry => entry.control === "textarea")
        .filter(entry => (entry as { rows?: number }).rows === 4)
        .filter(entry => (entry as { cols?: number }).cols === 50)
        .map(entry => entry.key)
        .sort()

    expect(sizedTextareaKeys).toEqual([
        "githubEnterpriseURLs",
        "jiraURLs",
        "replaceUrlWithTitleIgnoreDomains",
    ])
})
~~~

- [ ] **Step 2: 集中的なテストを実行して RED を確認する**

Run:

~~~bash
npm run test -- src/settings/__tests__/settings-catalog.test.ts
~~~

Expected: FAIL。

groups settings by user workflow in display order が、現在の Formatting、Integrations、サービス別 URL グループとの差分を報告する。

- [ ] **Step 3: SETTINGS_CATALOG を承認済みの順序へ置き換える**

src/settings/settings-catalog.ts の SETTINGS_CATALOG 定義全体を、次の内容へ置き換える。

~~~ts
export const SETTINGS_CATALOG = [
    {
        key: "formatOnSave",
        group: "Formatting Workflow",
        name: "Format on save",
        description:
            "When enabled, the file will be automatically formatted (links replaced) when saving.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "formatDelayMs",
        group: "Formatting Workflow",
        name: "Format delay (ms)",
        description:
            "Delay in milliseconds before formatting. Increase this value if the linter/prettier runs before the file is fully saved.",
        control: "text",
        placeholder: "e.g. 100",
        refreshesIndex: false,
    },
    {
        key: "runPrettierAfterFormatting",
        group: "Formatting Workflow",
        name: "Run Prettier after formatting",
        description:
            "When enabled, Prettier will be executed after Automatic Linker formatting. This requires prettier-format plugin to be installed. https://github.com/dylanarmstrong/obsidian-prettier-plugin",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "runLinterAfterFormatting",
        group: "Formatting Workflow",
        name: "Run Obsidian Linter after formatting",
        description:
            "When enabled, Obsidian Linter will be executed after Automatic Linker formatting. This requires the Obsidian Linter plugin to be installed.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "respectNewFileFolderPath",
        group: "Link Behavior",
        name: "Respect 'Folder to create new notes in' setting",
        description:
            "When enabled, the plugin will use Obsidian's 'Folder to create new notes in' setting as the base directory for omitting folder prefixes in links.",
        control: "toggle",
        refreshesIndex: true,
    },
    {
        key: "proximityBasedLinking",
        group: "Link Behavior",
        name: "Proximity-based linking",
        description:
            "When enabled, the plugin will automatically resolve namespaces for shorthand links. If multiple candidates share the same shorthand, the candidate with the most common path segments relative to the current file will be selected.",
        control: "toggle",
        refreshesIndex: true,
    },
    {
        key: "includeAliases",
        group: "Link Behavior",
        name: "Include aliases",
        description:
            "When enabled, aliases will be included when processing links. Note: A restart is required for changes to take effect.",
        control: "toggle",
        refreshesIndex: true,
    },
    {
        key: "removeAliasInDirs",
        group: "Link Behavior",
        name: "Remove aliases in directories",
        description:
            "Directories where link aliases should be removed, one per line (e.g. 'dir' will convert [[dir/xxx|yyy]] to [[dir/xxx]]). This affects both auto-generated aliases and frontmatter aliases.",
        control: "textarea",
        placeholder: "dir1\ndir2/subdir",
        multiline: true,
        refreshesIndex: true,
    },
    {
        key: "ignoreCase",
        group: "Link Behavior",
        name: "Ignore case",
        description:
            "When enabled, link matching will be case-insensitive. The original case of the text will be preserved in the link.",
        control: "toggle",
        refreshesIndex: true,
    },
    {
        key: "matchSentenceCase",
        group: "Link Behavior",
        name: "Match sentence case",
        description:
            "When 'Ignore case' is OFF, match text that is capitalized at the start of a sentence. For example, 'My name' at a sentence start will match the file 'my name'. This setting is ignored when 'Ignore case' is ON.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "preventSelfLinking",
        group: "Exclusions",
        name: "Prevent self-linking",
        description:
            "When enabled, text will not be linked to its own file. For example, the word 'VPN' inside VPN.md will not be converted to a link.",
        control: "toggle",
        refreshesIndex: true,
    },
    {
        key: "ignoreDateFormats",
        group: "Exclusions",
        name: "Ignore date formats",
        description:
            "When enabled, links that match date formats (e.g. 2025-02-10) will be ignored. This helps maintain compatibility with Obsidian Tasks.",
        control: "toggle",
        refreshesIndex: true,
    },
    {
        key: "ignoreHeadings",
        group: "Exclusions",
        name: "Ignore headings",
        description:
            "When enabled, headings (lines starting with #) will not have links added to them.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "ignoreMarkdownTables",
        group: "Exclusions",
        name: "Ignore Markdown tables",
        description:
            "When enabled, Markdown table rows will not have links added to them.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "excludeDirsFromAutoLinking",
        group: "Exclusions",
        name: "Exclude directories from automatic linking",
        description:
            "Directories to be excluded from automatic linking, one per line (e.g. 'Templates')",
        control: "textarea",
        placeholder: "Templates\nArchive",
        multiline: true,
        refreshesIndex: true,
    },
    {
        key: "formatGitHubURLs",
        group: "URL Formatting",
        name: "Format GitHub URLs on save",
        description:
            "When enabled, GitHub URLs will be formatted when saving the file.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "githubEnterpriseURLs",
        group: "URL Formatting",
        name: "GitHub Enterprise URLs",
        description:
            "Add your GitHub Enterprise URLs, one per line (e.g. github.enterprise.com)",
        control: "textarea",
        placeholder: "github.enterprise.com\ngithub.company.com",
        multiline: true,
        rows: 4,
        cols: 50,
        refreshesIndex: false,
    },
    {
        key: "formatJiraURLs",
        group: "URL Formatting",
        name: "Format JIRA URLs on save",
        description:
            "When enabled, JIRA URLs will be formatted when saving the file.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "jiraURLs",
        group: "URL Formatting",
        name: "JIRA URLs",
        description:
            "Add your JIRA URLs, one per line (e.g. jira.enterprise.com)",
        control: "textarea",
        placeholder: "jira.enterprise.com\njira.company.com",
        multiline: true,
        rows: 4,
        cols: 50,
        refreshesIndex: false,
    },
    {
        key: "formatLinearURLs",
        group: "URL Formatting",
        name: "Format Linear URLs on save",
        description:
            "When enabled, Linear URLs will be formatted when saving the file.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "replaceUrlWithTitle",
        group: "URL Formatting",
        name: "Replace URL with title",
        description:
            "When enabled, raw URLs will be replaced with [Page Title](URL). Requires fetching the URL content.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "replaceUrlWithTitleIgnoreDomains",
        group: "URL Formatting",
        name: "Ignore domains",
        description:
            "Ignore domains for replacing URLs with titles, one per line (e.g. x.com)",
        control: "textarea",
        placeholder: "",
        multiline: true,
        rows: 4,
        cols: 50,
        refreshesIndex: false,
    },
    {
        key: "aiEnabled",
        group: "AI Link Enhancement (Beta)",
        name: "Enable AI Link Enhancement",
        description:
            "When enabled, an AI-powered link enhancer command will be available. It uses a local LLM to resolve ambiguous links and correct existing ones.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "aiEndpoint",
        group: "AI Link Enhancement (Beta)",
        name: "AI API Endpoint",
        description:
            "The URL of your OpenAI-compatible AI server (e.g. LM Studio, Ollama).",
        control: "text",
        placeholder: "http://localhost:1234/v1",
        refreshesIndex: false,
    },
    {
        key: "aiModel",
        group: "AI Link Enhancement (Beta)",
        name: "AI Model",
        description: "The name of the model to use (e.g. gemma-4-7b).",
        control: "text",
        placeholder: "gemma-4-7b",
        refreshesIndex: false,
    },
    {
        key: "aiMaxContext",
        group: "AI Link Enhancement (Beta)",
        name: "Max Context Length",
        description:
            "Number of characters around the link to provide as context to the AI.",
        control: "text",
        placeholder: "500",
        refreshesIndex: false,
    },
    {
        key: "showNotice",
        group: "Diagnostics",
        name: "Show load notice",
        description: "Display a notice when markdown files are loaded.",
        control: "toggle",
        refreshesIndex: false,
    },
    {
        key: "debug",
        group: "Diagnostics",
        name: "Debug mode",
        description:
            "When enabled, debug information will be logged to the console.",
        control: "toggle",
        refreshesIndex: false,
    },
] as const satisfies readonly SettingCatalogEntry[]
~~~

- [ ] **Step 4: 集中的なテストを実行して GREEN を確認する**

Run:

~~~bash
npm run test -- src/settings/__tests__/settings-catalog.test.ts
~~~

Expected: PASS。

Vitest が1ファイル、6テストの成功を報告する。

- [ ] **Step 5: 型検査を実行する**

Run:

~~~bash
npm run tsc
~~~

Expected: exit code 0。

- [ ] **Step 6: カタログとテストだけをコミットする**

Run:

~~~bash
but diff
~~~

出力から src/settings/settings-catalog.ts と src/settings/__tests__/settings-catalog.test.ts のファイル ID を取得する。
その2 ID だけを --changes へ渡し、次のメッセージで settings-grouping ブランチへコミットする。

~~~text
refactor(settings): group options by user workflow

Why:
- The settings tab mixes unrelated options under broad or service-specific headings.

What:
- Reorder the catalog into six contiguous user-facing groups.
- Lock group membership and display order with a focused test.
~~~

Expected: コミット結果に上記2ファイルだけが含まれ、AGENTS.md は uncommitted に残る。

---

### Task 2: README の設定分類

**Files:**
- Modify: README.md:98-142

**Interfaces:**
- Consumes: Task 1 が確定した6グループと28設定の順序。
- Produces: 設定画面と同じ見出し、所属、順序を持つ Configuration。
- Produces: automatic-linker-disable-url-title の説明を既存の Frontmatter Options に一箇所だけ残した README。

- [ ] **Step 1: Configuration を6グループへ置き換える**

README.md の Configuration 見出しから Usage Examples の直前までを、次の内容へ置き換える。

~~~markdown
## Configuration

### Formatting Workflow

- **Format on save**: Automatically format links when saving files.
- **Format delay (ms)**: Delay formatting and post-format integrations by the configured number of milliseconds.
- **Run Prettier after formatting**: Run the Prettier plugin after Automatic Linker formatting.
- **Run Obsidian Linter after formatting**: Run Obsidian Linter after Automatic Linker formatting.

### Link Behavior

- **Respect 'Folder to create new notes in' setting**: Use Obsidian's new-note folder as the base directory when omitting folder prefixes from links.
- **Proximity-based linking**: Resolve shorthand links to the candidate with the most path segments in common with the current file.
- **Include aliases**: Include frontmatter aliases when matching text.
- **Remove aliases in directories**: Remove displayed link aliases for links targeting the configured directories.
- **Ignore case**: Match links without requiring the same letter case.
- **Match sentence case**: When Ignore case is disabled, match text capitalized only because it starts a sentence.

### Exclusions

- **Prevent self-linking**: Do not link text to the current file.
- **Ignore date formats**: Skip date-formatted text such as `2025-02-10`.
- **Ignore headings**: Do not add links inside Markdown headings.
- **Ignore Markdown tables**: Do not add links inside Markdown table rows.
- **Exclude directories from automatic linking**: Skip files in the configured directories when building automatic links.

### URL Formatting

- **Format GitHub URLs on save**: Convert GitHub URLs to readable issue and pull-request links.
- **GitHub Enterprise URLs**: Add custom GitHub Enterprise domains.
- **Format JIRA URLs on save**: Convert JIRA issue URLs to readable links.
- **JIRA URLs**: Add custom JIRA domains.
- **Format Linear URLs on save**: Convert Linear issue URLs to readable links.
- **Replace URL with title**: Replace bare URLs with Markdown links using fetched page titles.
- **Ignore domains**: Exclude configured domains from URL title replacement.

### AI Link Enhancement (Beta)

- **Enable AI Link Enhancement**: Add a command that uses a local LLM to resolve and correct ambiguous links.
- **AI API Endpoint**: Set the URL of the OpenAI-compatible local AI server.
- **AI Model**: Set the model name sent to the local AI server.
- **Max Context Length**: Set the number of surrounding characters sent for each ambiguous link.

### Diagnostics

- **Show load notice**: Display a notice after the plugin loads Markdown files into its index.
- **Debug mode**: Log debug information to the developer console.
~~~

Frontmatter Options 以下の automatic-linker-disable-url-title の説明は変更しない。

- [ ] **Step 2: 見出しの順序を確認する**

Run:

~~~bash
sed -n '/^## Configuration$/,/^## Usage Examples$/p' README.md | rg '^### '
~~~

Expected:

~~~text
### Formatting Workflow
### Link Behavior
### Exclusions
### URL Formatting
### AI Link Enhancement (Beta)
### Diagnostics
~~~

- [ ] **Step 3: Configuration が28設定を一度ずつ列挙することを確認する**

Run:

~~~bash
sed -n '/^## Configuration$/,/^## Usage Examples$/p' README.md | rg -c '^- \*\*'
~~~

Expected:

~~~text
28
~~~

- [ ] **Step 4: 未掲載だった3設定を確認する**

Run:

~~~bash
sed -n '/^## Configuration$/,/^## Usage Examples$/p' README.md | rg 'Match sentence case|Ignore headings|Ignore Markdown tables'
~~~

Expected:

~~~text
- **Match sentence case**: When Ignore case is disabled, match text capitalized only because it starts a sentence.
- **Ignore headings**: Do not add links inside Markdown headings.
- **Ignore Markdown tables**: Do not add links inside Markdown table rows.
~~~

- [ ] **Step 5: frontmatter の URL タイトル無効化手段が一箇所に残ることを確認する**

Run:

~~~bash
rg -c 'automatic-linker-disable-url-title' README.md
~~~

Expected:

~~~text
1
~~~

- [ ] **Step 6: README だけをコミットする**

Run:

~~~bash
but diff
~~~

出力から README.md のファイル ID を取得する。
その ID だけを --changes へ渡し、次のメッセージで settings-grouping ブランチへコミットする。

~~~text
docs(settings): align configuration with grouped options

Why:
- Readers currently see categories and option coverage that differ from the settings tab.

What:
- Mirror the six settings groups and their display order in the README.
- Document the three previously omitted settings.
~~~

Expected: コミット結果に README.md だけが含まれ、AGENTS.md は uncommitted に残る。

---

### Task 3: 回帰検証

**Files:**
- Verify: src/settings/settings-catalog.ts
- Verify: src/settings/__tests__/settings-catalog.test.ts
- Verify: README.md

**Interfaces:**
- Consumes: Task 1 の設定カタログと Task 2 の README。
- Produces: 既存の保存形式と実行時動作を維持した、検証済みの設定グルーピング変更。

- [ ] **Step 1: 設定カタログのテストを再実行する**

Run:

~~~bash
npm run test -- src/settings/__tests__/settings-catalog.test.ts
~~~

Expected: PASS。

Vitest が1ファイル、6テストの成功を報告する。

- [ ] **Step 2: 全テストを実行する**

Run:

~~~bash
npm run test -- --reporter=dot
~~~

Expected: exit code 0 で全テストが成功する。

- [ ] **Step 3: 型検査を実行する**

Run:

~~~bash
npm run tsc
~~~

Expected: exit code 0。

- [ ] **Step 4: lint を実行する**

Run:

~~~bash
npm run lint
~~~

Expected: exit code 0。

- [ ] **Step 5: 意図しない未コミット変更がないことを確認する**

Run:

~~~bash
but diff
~~~

Expected: src/settings/settings-catalog.ts、src/settings/__tests__/settings-catalog.test.ts、README.md は表示されない。

今回の作業前から存在する AGENTS.md の変更だけが uncommitted に残る。
