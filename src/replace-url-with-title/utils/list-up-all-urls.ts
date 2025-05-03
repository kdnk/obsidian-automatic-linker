type Url = string;

// Regular expression to find URLs starting with http:// or https://
// It avoids matching URLs immediately preceded by `](` or `<` or followed by `)` or `>`
// It also tries to avoid including common trailing punctuation as part of the URL.
// Still simplified and might need refinement for complex edge cases.
const URL_REGEX = /https?:\/\/[^\s<>"'`]+/g; // Keep the original regex for broad matching, context checks handle specifics.

// Regex to identify common trailing punctuation that shouldn't be part of the URL
const TRAILING_PUNCTUATION_REGEX = /[.,;!?)\]}]+$/;
export const listupAllUrls = (
	body: string,
	ignoredDomains?: string[],
): Set<Url> => {
	const urls = new Set<Url>();
	let match;

	// --- Pre-calculate Fenced Code Block Ranges ---
	const codeBlockRanges: { start: number; end: number }[] = [];
	// Regex to find fenced code blocks (handles different fence lengths and optional language specifiers)
	// Matches from ``` or ~~~ at the start of a line to the next ``` or ~~~ at the start of a line
	const codeBlockRegex =
		/^(?:```|~~~)[^\r\n]*?\r?\n([\s\S]*?)\r?\n^(?:```|~~~)$/gm;
	let blockMatch;
	while ((blockMatch = codeBlockRegex.exec(body)) !== null) {
		codeBlockRanges.push({
			start: blockMatch.index,
			end: blockMatch.index + blockMatch[0].length,
		});
	}
	// Reset regex state if needed, though new exec calls should handle this
	codeBlockRegex.lastIndex = 0;

	while ((match = URL_REGEX.exec(body)) !== null) {
		const url = match[0];
		const matchIndex = match.index;

		// --- Fenced Code Block Check ---
		// Check if the match index falls within any calculated code block range
		let isInCodeBlock = false;
		for (const range of codeBlockRanges) {
			if (matchIndex >= range.start && matchIndex < range.end) {
				isInCodeBlock = true;
				break;
			}
		}
		if (isInCodeBlock) {
			continue; // Skip this URL if it's inside a fenced code block
		}

		// --- Context Check ---
		let isBareUrl = true;

		// 1. Check if already part of a Markdown link: [...](url)
		if (matchIndex >= 2) { // Need space for "]("
			// Check if the URL is potentially followed by ')'
			const followingCharIndex = matchIndex + url.length;
			if (followingCharIndex < body.length && body[followingCharIndex] === ')') {
				// If followed by ')', check if preceded by "]("
				const precedingChars = body.substring(matchIndex - 2, matchIndex);
				if (precedingChars === "](") {
					// Only if both conditions are met, it's a Markdown link
					isBareUrl = false;
				}
			}
		}

		// 2. Check if enclosed in angle brackets: <url>
		if (isBareUrl && matchIndex >= 1) {
			const precedingChar = body[matchIndex - 1];
			const followingChar = body[matchIndex + url.length];
			if (precedingChar === "<" && followingChar === ">") {
				isBareUrl = false;
			}
		}

		// 3. Check if inside inline code: `... url ...`
		// Count non-escaped backticks before the match. Odd count means inside code.
		if (isBareUrl) {
			const segmentBefore = body.substring(0, matchIndex);
			// Count non-escaped backticks `(?<!\\)` ensures we don't count escaped ones like \`
			const backticksCount = (segmentBefore.match(/(?<!\\)`/g) || [])
				.length;

			if (backticksCount % 2 !== 0) {
				// Odd number of backticks means we might be inside a code span.
				// We need to ensure the code span doesn't close *before* our match.
				const lastBacktickIndex = segmentBefore.lastIndexOf("`");
				// Check if there's another backtick between the last one and the match.
				// If not, we are inside the code span.
				if (
					lastBacktickIndex !== -1 &&
					!segmentBefore
						.substring(lastBacktickIndex + 1)
						.includes("`")
				) {
					isBareUrl = false;
				}
			}
		}

		// 4. Check if inside fenced code block: ``` ... url ... ```
		// This check remains complex. A simple heuristic: check if the line
		// containing the URL is within a ``` block. This is not foolproof.
		// For now, we'll skip this check for simplicity, but acknowledge it's a limitation.
		// A more robust solution would involve parsing the Markdown structure.

		// --- Check Ignored Domains & Clean URL ---
		if (isBareUrl) {
			let finalUrl = url;
			let shouldAdd = true;

			// 5. Check Ignored Domains
			if (ignoredDomains && ignoredDomains.length > 0) {
				try {
					const parsedUrl = new URL(url);
					const hostname = parsedUrl.hostname;
					if (
						ignoredDomains.some(
							(domain) =>
								hostname === domain ||
								hostname.endsWith(`.${domain}`),
						)
					) {
						shouldAdd = false;
					}
				} catch (e) {
					// If URL parsing fails, it's likely not a valid URL to add anyway
					console.warn(
						`Failed to parse URL for domain check: ${url}`,
						e,
					);
					shouldAdd = false;
				}
			}

			// 6. Clean Trailing Punctuation (only if not ignored)
			if (shouldAdd) {
				finalUrl = url.replace(TRAILING_PUNCTUATION_REGEX, "");
				// Ensure cleaning didn't make it invalid (e.g., just "http://")
				if (!finalUrl.includes("//")) {
					shouldAdd = false;
				}
			}

			// --- Add URL if context checks pass and not ignored ---
			if (shouldAdd) {
				urls.add(finalUrl);
			}
		}

		// Reset regex lastIndex to avoid issues with overlapping matches or zero-length matches
		// Although our URL regex shouldn't produce zero-length matches.
		// If the regex finds a match at index `i`, the next search starts at `i + 1`.
		// If the match was length `l`, `exec` updates `lastIndex` to `i + l`.
		// We need to ensure progress even if `l` is 0, but `URL_REGEX` won't match empty.
		// If `isBareUrl` logic modified the string or indices, care would be needed.
	}

	return urls;
};
