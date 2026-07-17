import { ReplaceLinksSettings } from "../replace-links/replace-links"

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
    rows?: number
    cols?: number
    refreshesIndex: boolean
    runtimeOnly?: boolean
}

export const DEFAULT_SETTINGS: AutomaticLinkerSettings = {
    formatOnSave: false,
    showNotice: false,
    respectNewFileFolderPath: true,
    includeAliases: true,
    proximityBasedLinking: true,
    ignoreDateFormats: true,
    ignoreHeadings: false,
    formatGitHubURLs: true,
    githubEnterpriseURLs: [],
    formatJiraURLs: true,
    jiraURLs: [],
    formatLinearURLs: false,
    debug: false,
    ignoreCase: true,
    matchSentenceCase: true,
    replaceUrlWithTitle: true,
    replaceUrlWithTitleIgnoreDomains: [],
    excludeDirsFromAutoLinking: [],
    preventSelfLinking: false,
    removeAliasInDirs: [],
    ignoreMarkdownTables: false,
    runLinterAfterFormatting: false,
    runPrettierAfterFormatting: false,
    formatDelayMs: 1,
    aiEnabled: false,
    aiEndpoint: "http://localhost:1234/v1",
    aiModel: "gemma-4-7b",
    aiMaxContext: 500,
}

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

export const settingRefreshesIndex = (
    key: keyof AutomaticLinkerSettings,
): boolean => SETTINGS_CATALOG.find(entry => entry.key === key)?.refreshesIndex ?? false

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
): Pick<
    AutomaticLinkerSettings,
    | "formatGitHubURLs"
    | "githubEnterpriseURLs"
    | "formatJiraURLs"
    | "jiraURLs"
    | "formatLinearURLs"
> => ({
    formatGitHubURLs: settings.formatGitHubURLs,
    githubEnterpriseURLs: settings.githubEnterpriseURLs,
    formatJiraURLs: settings.formatJiraURLs,
    jiraURLs: settings.jiraURLs,
    formatLinearURLs: settings.formatLinearURLs,
})
