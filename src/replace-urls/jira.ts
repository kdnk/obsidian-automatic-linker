import { AutomaticLinkerSettings } from "../settings/settings-info";

type JiraURLInfo = {
	project: string;
	issueId: string;
};

/**
 * Format a Jira URL by converting to Obsidian link format:
 * [[jira/domain/PROJECT/123]] [🔗](url)
 * @param url The URL to format
 * @param settings Plugin settings
 * @returns The formatted URL in Obsidian link format
 */
export function formatJiraURL(
	url: string,
	settings: AutomaticLinkerSettings,
): string {
	try {
		const jiraURL = new URL(url);

		// Check if it's a configured Jira URL
		if (!isJiraURL(jiraURL, settings.jiraURLs)) {
			return url;
		}

		// Don't format if URL has query parameters (including empty query)
		if (url.includes("?")) {
			return url;
		}

		const urlInfo = parseJiraURL(jiraURL);
		if (!urlInfo) {
			return url;
		}

		const cleanURL = getCleanURL(jiraURL, urlInfo);
		return formatToObsidianLink(jiraURL, urlInfo, cleanURL);
	} catch (e) {
		// If URL is invalid, return original string
		return url;
	}
}

/**
 * Parse Jira URL into its components
 */
function parseJiraURL(url: URL): JiraURLInfo | null {
	const parts = url.pathname.split("/").filter(Boolean);

	// Check if the URL matches the expected pattern /browse/PROJECT-123
	if (parts[0] !== "browse" || parts.length !== 2) {
		return null;
	}

	const issueParts = parts[1].split("-");
	if (issueParts.length !== 2) {
		return null;
	}

	return {
		project: issueParts[0],
		issueId: issueParts[1],
	};
}

/**
 * Get clean URL without query parameters and trailing slashes
 */
function getCleanURL(url: URL, urlInfo: JiraURLInfo): string {
	return `${url.origin}/browse/${urlInfo.project}-${urlInfo.issueId}`;
}

/**
 * Format URL info into Obsidian link format
 */
function formatToObsidianLink(
	url: URL,
	urlInfo: JiraURLInfo,
	cleanURL: string,
): string {
	// Extract domain name (e.g., "work" from "sub-domain.work.com")
	const domain = url.hostname.split(".")[1];
	const wikiLink = `[[${domain}/jira/${urlInfo.project}/${urlInfo.issueId}]] [🔗](${cleanURL})`;
	return wikiLink;
}

/**
 * Check if the URL is a configured Jira URL
 */
function isJiraURL(url: URL, jiraURLs: string[]): boolean {
	return jiraURLs.some((jiraURL) => {
		// Remove any protocol and trailing slashes from the Jira URL
		const cleanJiraURL = jiraURL
			.replace(/^https?:\/\//, "")
			.replace(/\/$/, "");
		return url.hostname === cleanJiraURL;
	});
}
