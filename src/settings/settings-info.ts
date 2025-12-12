export type AutomaticLinkerSettings = {
	formatOnSave: boolean;
	baseDir: string;
	showNotice: boolean;
	minCharCount: number; // Minimum character count setting
	considerAliases: boolean; // Consider aliases when linking
	namespaceResolution: boolean; // Automatically resolve namespaces for shorthand links
	ignoreDateFormats: boolean; // Ignore date formatted links (e.g. 2025-02-10)
	formatGitHubURLs: boolean; // Format GitHub URLs on save
	githubEnterpriseURLs: string[]; // List of GitHub Enterprise URLs
	formatJiraURLs: boolean; // Format Jira URLs on save
	jiraURLs: string[]; // List of Jira URLs (domains)
	formatLinearURLs: boolean; // Format Linear URLs on save
	debug: boolean; // Enable debug logging
	ignoreCase: boolean; // Ignore case when matching links
	replaceUrlWithTitle: boolean; // Replace raw URLs with [Title](URL)
	replaceUrlWithTitleIgnoreDomains: string[]; // List of domains to ignore when replacing URLs with titles
	excludeDirsFromAutoLinking: string[]; // Optional: List of directories to exclude from auto-linking
	preventSelfLinking: boolean; // Prevent linking text to its own file
	removeAliasInDirs: string[]; // Remove aliases for links in specified directories
	runLinterAfterFormatting: boolean; // Run Obsidian Linter after automatic linker formatting
	runPrettierAfterFormatting: boolean; // Run Prettier after automatic linker formatting
	formatDelayMs: number; // Delay in milliseconds before running linter after formatting
};

export const DEFAULT_SETTINGS: AutomaticLinkerSettings = {
	formatOnSave: false,
	baseDir: "pages",
	showNotice: false,
	minCharCount: 0, // Default value: 0 (always replace links)
	considerAliases: true, // Default: consider aliases
	namespaceResolution: true, // Default: enable automatic namespace resolution
	ignoreDateFormats: true, // Default: ignore date formats (e.g. 2025-02-10)
	formatGitHubURLs: true, // Default: format GitHub URLs
	githubEnterpriseURLs: [], // Default: empty list
	formatJiraURLs: true, // Default: format Jira URLs
	jiraURLs: [], // Default: empty list
	formatLinearURLs: false, // Default: format Linear URLs
	debug: false, // Default: disable debug logging
	ignoreCase: true, // Default: case-sensitive matching
	replaceUrlWithTitle: true, // Default: enable replacing URLs with titles
	replaceUrlWithTitleIgnoreDomains: [],
	excludeDirsFromAutoLinking: [], // Default: no excluded directories
	preventSelfLinking: false, // Default: allow self-linking (backward compatibility)
	removeAliasInDirs: [], // Default: no directories for alias removal
	runLinterAfterFormatting: false, // Default: do not run linter after formatting
	runPrettierAfterFormatting: false, // Run Prettier after automatic linker formatting
	formatDelayMs: 1, // Default: 1ms delay before running linter
};
