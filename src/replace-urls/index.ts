import { AutomaticLinkerSettings } from "../settings-info";

type GitHubURLInfo = {
	owner: string;
	repository: string;
	type?: "pull" | "issues";
	id?: string;
};

/**
 * Format a GitHub URL by normalizing the format and converting to Obsidian link format:
 * [[github_id/repository/{pull or issue}/{id}]] [🔗](url)
 * @param url The URL to format
 * @param settings Plugin settings
 * @returns The formatted URL in Obsidian link format
 */
export function formatGitHubURL(
	url: string,
	settings: AutomaticLinkerSettings,
): string {
	try {
		const githubURL = new URL(url);

		// Check if it's a GitHub URL (including Enterprise)
		if (!isGitHubURL(githubURL, settings.githubEnterpriseURLs)) {
			return url;
		}

		const urlInfo = parseGitHubURL(githubURL);
		if (!urlInfo) {
			return url;
		}

		const cleanURL = getCleanURL(githubURL, urlInfo);
		return formatToObsidianLink(urlInfo, cleanURL);
	} catch (e) {
		// If URL is invalid, return original string
		return url;
	}
}

/**
 * Parse GitHub URL into its components
 */
function parseGitHubURL(url: URL): GitHubURLInfo | null {
	const parts = url.pathname.split("/").filter(Boolean);
	if (parts.length < 2) {
		return null;
	}

	const [owner, repository, type, id] = parts;
	const urlInfo: GitHubURLInfo = {
		owner,
		repository,
	};

	if (isPullRequestOrIssueURL(url)) {
		urlInfo.type = type as "pull" | "issues";
		urlInfo.id = id;
	}

	return urlInfo;
}

/**
 * Get clean URL without query parameters and trailing slashes
 */
function getCleanURL(url: URL, urlInfo: GitHubURLInfo): string {
	if (urlInfo.type && urlInfo.id) {
		const basePath = `/${urlInfo.owner}/${urlInfo.repository}/${urlInfo.type}/${urlInfo.id}`;
		return `${url.origin}${basePath}`;
	}
	return `${url.origin}/${urlInfo.owner}/${urlInfo.repository}`.replace(
		/\/$/,
		"",
	);
}

/**
 * Format URL info into Obsidian link format
 */
function formatToObsidianLink(
	urlInfo: GitHubURLInfo,
	cleanURL: string,
): string {
	const url = new URL(cleanURL);
	const isEnterpriseURL = url.hostname !== "github.com";
	let domainPrefix = "";

	if (isEnterpriseURL && (urlInfo.type || urlInfo.id)) {
		// For github.enterprise.com -> enterprise
		// For github.company.com -> company
		domainPrefix = url.hostname.split(".")[1] + "/";
	}

	let wikiLink = `[[${domainPrefix}${urlInfo.owner}/${urlInfo.repository}`;
	if (urlInfo.type && urlInfo.id) {
		wikiLink += `/${urlInfo.type}/${urlInfo.id}`;
	}
	wikiLink += `]] [🔗](${cleanURL})`;
	return wikiLink;
}

/**
 * Check if the URL is a GitHub URL (including Enterprise)
 */
function isGitHubURL(url: URL, enterpriseURLs: string[]): boolean {
	// Check if it's github.com
	if (url.hostname === "github.com") {
		return true;
	}

	// Check if it matches any of the configured enterprise URLs
	return enterpriseURLs.some((enterpriseURL) => {
		// Remove any protocol and trailing slashes from the enterprise URL
		const cleanEnterpriseURL = enterpriseURL
			.replace(/^https?:\/\//, "")
			.replace(/\/$/, "");
		return url.hostname === cleanEnterpriseURL;
	});
}

/**
 * Check if the URL is a pull request or issue URL
 */
function isPullRequestOrIssueURL(url: URL): boolean {
	const path = url.pathname.toLowerCase();
	return path.includes("/pull/") || path.includes("/issues/");
}
