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
};

export const DEFAULT_SETTINGS: AutomaticLinkerSettings = {
	formatOnSave: false,
	baseDir: "pages",
	showNotice: false,
	minCharCount: 0, // Default value: 0 (always replace links)
	considerAliases: false, // Default: do not consider aliases
	namespaceResolution: false, // Default: disable automatic namespace resolution
	ignoreDateFormats: true, // Default: ignore date formats (e.g. 2025-02-10)
	formatGitHubURLs: true, // Default: format GitHub URLs
	githubEnterpriseURLs: [], // Default: empty list
	formatJiraURLs: true, // Default: format Jira URLs
	jiraURLs: [], // Default: empty list
	formatLinearURLs: true, // Default: format Linear URLs
	debug: false, // Default: disable debug logging
	ignoreCase: false, // Default: case-sensitive matching
	replaceUrlWithTitle: false, // Default: disable replacing URLs with titles
	replaceUrlWithTitleIgnoreDomains: [],
	excludeDirsFromAutoLinking: [], // Default: no excluded directories
	preventSelfLinking: false, // Default: allow self-linking (backward compatibility)
};
