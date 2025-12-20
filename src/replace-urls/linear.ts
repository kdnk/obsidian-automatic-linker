import { AutomaticLinkerSettings } from "../settings/settings-info"

type LinearURLInfo = {
    workspace: string
    issueId: string
}

/**
 * Format a Linear URL by converting to Obsidian link format:
 * [[linear/workspace/ISSUE-123]] [🔗](url)
 * @param url The URL to format
 * @param settings Plugin settings
 * @returns The formatted URL in Obsidian link format
 */
export function formatLinearURL(
    url: string,
    settings: AutomaticLinkerSettings,
): string {
    // Check if Linear URL formatting is enabled
    if (!settings.formatLinearURLs) {
        return url
    }

    try {
        // Handle linear:// protocol by converting to https://
        let processedURL = url
        if (url.startsWith("linear://")) {
            processedURL = url.replace("linear://", "https://linear.app/")
        }

        const linearURL = new URL(processedURL)

        // Check if it's a Linear URL
        if (!isLinearURL(linearURL)) {
            return url
        }

        const urlInfo = parseLinearURL(linearURL)
        if (!urlInfo) {
            return url
        }

        const cleanURL = getCleanURL(urlInfo)
        return formatToObsidianLink(urlInfo, cleanURL)
    }
    catch (_e) {
        // If URL is invalid, return original string
        return url
    }
}

/**
 * Parse Linear URL into its components
 */
function parseLinearURL(url: URL): LinearURLInfo | null {
    const parts = url.pathname.split("/").filter(Boolean)

    // Expected pattern: /workspace/issue/ISSUE-123 or /workspace/issue/ISSUE-123/title
    if (parts.length < 3) {
        return null
    }

    const [workspace, type, issueId] = parts

    // Check if the URL matches the expected pattern
    if (type !== "issue") {
        return null
    }

    // Validate issue ID format (should be like PROJ-123)
    const issueIdPattern = /^[A-Z]+-\d+$/
    if (!issueIdPattern.test(issueId)) {
        return null
    }

    return {
        workspace,
        issueId,
    }
}

/**
 * Get clean URL without query parameters, hash fragments, and title
 */
function getCleanURL(urlInfo: LinearURLInfo): string {
    return `https://linear.app/${urlInfo.workspace}/issue/${urlInfo.issueId}`
}

/**
 * Format URL info into Obsidian link format
 */
function formatToObsidianLink(
    urlInfo: LinearURLInfo,
    cleanURL: string,
): string {
    const wikiLink = `[[linear/${urlInfo.workspace}/${urlInfo.issueId}]] [🔗](${cleanURL})`
    return wikiLink
}

/**
 * Check if the URL is a Linear URL
 */
function isLinearURL(url: URL): boolean {
    return url.hostname === "linear.app"
}
