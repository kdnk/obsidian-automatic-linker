interface ReplaceUrlWithTitleContext {
	getTitle: (url: string) => Promise<string>;
}

interface ReplaceUrlWithTitleOptions {
	body: string;
	debug?: boolean; // Optional debug flag
}

// Regex to find URLs that are not already part of a Markdown link or inside code blocks/inline code.
// Explanation:
// Negative lookbehind `(?<!...)`: Ensures the URL is not preceded by `](` (end of Markdown link text) or `[` (start of Markdown link text/image).
// Negative lookbehind `(?<!\`)`: Ensures the URL is not preceded by a backtick (inline code).
// Main URL matching part: `(https?:\/\/[^\s]+)` captures http/https URLs. It matches protocol, `://`, and then any non-whitespace characters.
// Negative lookahead `(?!...)`: Ensures the URL is not immediately followed by `)` if preceded by `[` (part of `[text](url)`).
// It also ensures the URL is not followed by a backtick.
// We also need to handle code blocks (```...```). This regex doesn't explicitly handle multi-line code blocks,
// so we'll need additional logic for that.
const URL_REGEX =
	/(?<!\]\()(?<!\[)(?<!`)(https?:\/\/[^\s]+)(?![^[]*?\]\()(?![^`]*?`)/g;

// Basic check for code blocks or inline code at a given index
const isInsideCode = (body: string, index: number): boolean => {
	// Check for inline code
	let backtickCount = 0;
	for (let i = 0; i < index; i++) {
		if (body[i] === "`") {
			backtickCount++;
		}
	}
	if (backtickCount % 2 === 1) {
		// Inside inline code if odd number of backticks before index
		const nextBacktick = body.indexOf("`", index);
		if (nextBacktick === -1 || nextBacktick > index) {
			return true;
		}
	}

	// Check for code blocks
	const codeBlockRegex = /```[\s\S]*?```/g;
	let match;
	while ((match = codeBlockRegex.exec(body)) !== null) {
		if (index > match.index && index < match.index + match[0].length) {
			return true; // Inside a code block
		}
	}

	return false;
};

export const replaceUrlWithTitle =
	(context: ReplaceUrlWithTitleContext) =>
	async ({ body, debug = false }: ReplaceUrlWithTitleOptions): Promise<string> => {
		let newBody = body;
		const matches = Array.from(body.matchAll(URL_REGEX));
		const replacements: { startIndex: number; endIndex: number; url: string }[] =
			[];

		if (debug) console.log("replaceUrlWithTitle: Found potential URLs:", matches);

		// Collect valid matches that are not inside code blocks
		for (const match of matches) {
			const url = match[0];
			const startIndex = match.index!;

			if (!isInsideCode(body, startIndex)) {
				replacements.push({ startIndex, endIndex: startIndex + url.length, url });
			} else {
				if (debug) console.log(`Skipping URL inside code: ${url}`);
			}
		}

		if (debug) console.log("replaceUrlWithTitle: Filtered URLs:", replacements);


		// Process replacements from end to start to avoid index issues
		for (let i = replacements.length - 1; i >= 0; i--) {
			const { startIndex, endIndex, url } = replacements[i];
			try {
				if (debug) console.log(`Fetching title for: ${url}`);
				const title = await context.getTitle(url);
				if (title) {
					const markdownLink = `[${title}](${url})`;
					newBody =
						newBody.substring(0, startIndex) +
						markdownLink +
						newBody.substring(endIndex);
					if (debug) console.log(`Replaced ${url} with ${markdownLink}`);
				} else {
					if (debug) console.log(`No title found for: ${url}`);
				}
			} catch (error) {
				console.error(`Error fetching title for ${url}:`, error);
				if (debug) console.log(`Failed to fetch title for: ${url}`);
				// Optionally handle error, e.g., leave the URL as is
			}
		}

		return newBody;
	};
