type Url = string;

// Regular expression to find URLs starting with http:// or https://
// This is a simplified regex and might need refinement for edge cases.
const URL_REGEX = /https?:\/\/[^\s<>"'`]+/g;
export const listupAllUrls = (
	body: string,
	replaceUrlWithTitleIgnoreDomains?: string[],
): Set<Url> => {
	const urls = new Set<Url>();
	let match;

	while ((match = URL_REGEX.exec(body)) !== null) {
		const url = match[0];
		const matchIndex = match.index;

		// --- Context Check ---
		let isBareUrl = true;

		// 1. Check if already part of a Markdown link: [...](url)
		// Look for `](` immediately before the URL.
		// Need to be careful with index boundaries.
		if (matchIndex >= 2) {
			const precedingChars = body.substring(matchIndex - 2, matchIndex);
			// Check if the character immediately following the URL is ')'
			const followingChar = body[matchIndex + url.length];
			if (precedingChars === "](" && followingChar === ")") {
				isBareUrl = false;
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

		// --- Add URL if context checks pass ---
		if (isBareUrl) {
			urls.add(url);
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
