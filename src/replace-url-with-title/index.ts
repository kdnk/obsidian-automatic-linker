type Url = string;
type Title = string;
interface ReplaceUrlWithTitleOptions {
	body: string;
	urlTitleMap: Map<Url, Title>;
}

export const replaceUrlWithTitle = ({
	body,
	urlTitleMap,
}: ReplaceUrlWithTitleOptions): string => {
	if (urlTitleMap.size === 0) {
		return body;
	}

	let resultBody = body;

	// Sort URLs by length descending to replace longer URLs first
	// This helps prevent partial replacements (e.g., replacing 'example.com' before 'sub.example.com')
	const sortedUrls = Array.from(urlTitleMap.keys()).sort(
		(a, b) => b.length - a.length,
	);

	for (const url of sortedUrls) {
		const title = urlTitleMap.get(url);
		// Should not happen with Map iteration, but good practice
		if (!title) continue;

		// Escape backslashes and special characters in title for link text safety if needed
		// For now, assume title is safe.
		const markdownLink = `[${title}](${url})`;
		let currentIndex = 0;
		const newBodyParts: string[] = [];

		// Find all occurrences of the current URL in the resultBody
		// resultBody is updated in each iteration of the outer loop
		while (currentIndex < resultBody.length) {
			// Find the next occurrence of the URL, case-sensitive.
			const nextOccurrence = resultBody.indexOf(url, currentIndex);

			if (nextOccurrence === -1) {
				// No more occurrences found, add the rest of the string
				newBodyParts.push(resultBody.substring(currentIndex));
				break;
			}

			// Add the text segment before the match
			newBodyParts.push(
				resultBody.substring(currentIndex, nextOccurrence),
			);

			// --- Context Check ---
			let shouldReplace = true;

			// 1. Check if already part of a Markdown link: [...](url)
			// Look for `](` immediately before the URL and `)` immediately after.
			const precedingChars = resultBody.substring(
				nextOccurrence - 2,
				nextOccurrence,
			);
			const followingChar = resultBody[nextOccurrence + url.length];
			if (precedingChars === "](" && followingChar === ")") {
				shouldReplace = false;
			}

			// 2. Check if inside inline code: `... url ...`
			// Count non-escaped backticks before the match. Odd count means inside code.
			if (shouldReplace) {
				const segmentBefore = resultBody.substring(0, nextOccurrence);
				// Count non-escaped backticks `(?<!\\)` ensures we don't count escaped ones like \`
				const backticksCount = (segmentBefore.match(/(?<!\\)`/g) || [])
					.length;

				if (backticksCount % 2 !== 0) {
					// Odd number of backticks means we might be inside a code span.
					// We need to ensure the code span doesn't close before our match.
					const lastBacktickIndex = segmentBefore.lastIndexOf("`");
					// Check if there's another backtick between the last one and the match.
					// If not, we are inside the code span.
					if (
						lastBacktickIndex !== -1 &&
						!segmentBefore
							.substring(lastBacktickIndex + 1)
							.includes("`")
					) {
						shouldReplace = false;
					}
				}
			}

			// 3. Check if inside fenced code block: ``` ... url ... ```
			// This check is complex and not implemented here for simplicity.
			// Assumes URLs within fenced code blocks should not be replaced by default.
			// A simple heuristic could check the lines around the match for ```,
			// but a proper parser state would be needed for accuracy.

			// --- Apply Replacement ---
			if (shouldReplace) {
				newBodyParts.push(markdownLink);
			} else {
				// Keep the original URL if context checks failed
				newBodyParts.push(url);
			}

			// Move index past the current match (either the original url or the replaced markdownLink)
			// Use url.length because that's what we searched for.
			currentIndex = nextOccurrence + url.length;
		}
		// Update resultBody for the next URL in the outer loop
		resultBody = newBodyParts.join("");
	}

	return resultBody;
};
