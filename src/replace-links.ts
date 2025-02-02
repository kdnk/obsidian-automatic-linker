export const replaceLinks = async ({
	fileContent,
	allFileNames,
	getFrontMatterInfo,
	// List of directories to treat specially. Defaults to ["pages"].
	specialDirs = ["pages"],
}: {
	fileContent: string;
	allFileNames: string[];
	getFrontMatterInfo: (fileContent: string) => { contentStart: number };
	specialDirs?: string[];
}): Promise<string> => {
	// Function to escape special characters for use in regex.
	const escapeRegExp = (str: string) =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Sort candidate filenames in descending order so that longer names match first.
	const sortedFileNames = allFileNames
		.slice()
		.sort((a, b) => b.length - a.length);

	// Create regex patterns for each candidate.
	// For names under any of the specialDirs, make the directory part optional.
	const filePathPatterns = sortedFileNames.map((name) => {
		for (const specialDir of specialDirs) {
			const prefix = `${specialDir}/`;
			if (name.startsWith(prefix)) {
				// Example: "pages/tags" → pattern: (?:pages/)?tags
				return `(?:${escapeRegExp(specialDir)}/)?${escapeRegExp(name.slice(prefix.length))}`;
			}
		}
		return escapeRegExp(name);
	});

	// Concatenate multiple candidate patterns with "|" to form a single regex pattern.
	const combinedPattern = filePathPatterns.join("|");
	// Create a regex to match candidate strings (global flag).
	const candidateRegex = new RegExp(`(${combinedPattern})`, "g");

	// Get the starting index of the content (excluding frontmatter).
	const { contentStart } = getFrontMatterInfo(fileContent);
	// Preserve the frontmatter portion.
	const frontmatter = fileContent.slice(0, contentStart);
	// Extract the content without the frontmatter.
	const contentWithoutFrontMatter = fileContent.slice(contentStart);

	// Define a regex to match protected links: either wiki links ([[...]]) or Markdown links ([title](url)).
	// We want to keep these unchanged.
	const protectedLinkRegex = /(\[\[.*?\]\])|(\[[^\]]+\]\([^)]+\))/g;

	// Callback function to wrap candidate strings with wiki link syntax ([[...]])
	// unless the candidate appears to be part of a URL.
	// Note: The callback receives arguments (match, captured, offset, string) due to capture groups.
	const replaceCallback = (
		m: string,
		captured: string,
		offset: number,
		s: string,
	) => {
		// Get the 8 and 7 characters immediately preceding the match.
		const preceding8 = s.substring(Math.max(0, offset - 8), offset);
		const preceding7 = s.substring(Math.max(0, offset - 7), offset);
		// If the match is immediately preceded by "https://" or "http://",
		// then it is considered part of a URL and should not be replaced.
		if (preceding8 === "https://" || preceding7 === "http://") {
			return m;
		}
		return `[[${m}]]`;
	};

	// Process the content while preserving protected links.
	let result = "";
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while (
		(match = protectedLinkRegex.exec(contentWithoutFrontMatter)) !== null
	) {
		// Process the segment before the protected link by replacing candidate matches.
		const segment = contentWithoutFrontMatter.slice(lastIndex, match.index);
		const replacedSegment = segment.replace(
			candidateRegex,
			replaceCallback,
		);
		result += replacedSegment;
		// Append the protected link unchanged.
		result += match[0];
		lastIndex = match.index + match[0].length;
	}
	// Process any remaining content after the last protected link.
	result += contentWithoutFrontMatter
		.slice(lastIndex)
		.replace(candidateRegex, replaceCallback);

	// Return the frontmatter concatenated with the processed content.
	return frontmatter + result;
};

if (import.meta.vitest) {
	const { it, expect, describe } = import.meta.vitest;

	const getFrontMatterInfo = (fileContent: string) => ({ contentStart: 0 });

	describe("basic", () => {
		it("replaces links", async () => {
			expect(
				await replaceLinks({
					fileContent: "hello",
					allFileNames: ["hello"],
					getFrontMatterInfo,
				}),
			).toBe("[[hello]]");
		});
		it("replaces links with bullet", async () => {
			expect(
				await replaceLinks({
					fileContent: "- hello",
					allFileNames: ["hello"],
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]]");
		});
		it("replaces links with other texts", async () => {
			expect(
				await replaceLinks({
					fileContent: "world hello",
					allFileNames: ["hello"],
					getFrontMatterInfo,
				}),
			).toBe("world [[hello]]");
			expect(
				await replaceLinks({
					fileContent: "hello world",
					allFileNames: ["hello"],
					getFrontMatterInfo,
				}),
			).toBe("[[hello]] world");
		});
		it("replaces links with other texts and bullet", async () => {
			expect(
				await replaceLinks({
					fileContent: "- world hello",
					allFileNames: ["hello"],
					getFrontMatterInfo,
				}),
			).toBe("- world [[hello]]");
			expect(
				await replaceLinks({
					fileContent: "- hello world",
					allFileNames: ["hello"],
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]] world");
		});

		it("replaces multiple links", async () => {
			expect(
				await replaceLinks({
					fileContent: "hello world",
					allFileNames: ["hello", "world"],
					getFrontMatterInfo,
				}),
			).toBe("[[hello]] [[world]]");
			expect(
				await replaceLinks({
					fileContent: `\nhello\nworld\n`,
					allFileNames: ["hello", "world"],
					getFrontMatterInfo,
				}),
			).toBe(`\n[[hello]]\n[[world]]\n`);
			expect(
				await replaceLinks({
					fileContent: `\nhello\nworld aaaaa\n`,
					allFileNames: ["hello", "world"],
					getFrontMatterInfo,
				}),
			).toBe(`\n[[hello]]\n[[world]] aaaaa\n`);
			expect(
				await replaceLinks({
					fileContent: `\n aaaaa hello\nworld bbbbb\n`,
					allFileNames: ["hello", "world"],
					getFrontMatterInfo,
				}),
			).toBe(`\n aaaaa [[hello]]\n[[world]] bbbbb\n`);
		});
	});

	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace",
					allFileNames: ["namespace/tag1", "namespace/tag2"],
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1",
					allFileNames: ["namespace/tag1", "namespace/tag2"],
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1 namespace/tag2",
					allFileNames: [
						"namespace/tag1",
						"namespace/tag2",
						"namespace",
					],
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]]");
		});
	});

	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace",
					allFileNames: ["namespace/タグ"],
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"namespace/tag1 namespace/tag2 namespace/タグ3",
					allFileNames: [
						"namespace/tag1",
						"namespace/tag2",
						"namespace/タグ3",
					],
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]] [[namespace/タグ3]]");
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間",
					allFileNames: ["namespace/タグ"],
					getFrontMatterInfo,
				}),
			).toBe("名前空間");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1",
					allFileNames: [
						"名前空間/tag1",
						"名前空間/tag2",
						"名前空間/タグ3",
					],
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
					allFileNames: [
						"名前空間/tag1",
						"名前空間/tag2",
						"名前空間/タグ3",
					],
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]");
		});
		it("multiple CJK words", async () => {
			expect(
				await replaceLinks({
					fileContent: "- 漢字　ひらがな",
					allFileNames: ["漢字", "ひらがな"],
					getFrontMatterInfo,
				}),
			).toBe("- [[漢字]]　[[ひらがな]]");
		});
		it("multiple same CJK words", async () => {
			expect(
				await replaceLinks({
					fileContent: "- ひらがなとひらがな",
					allFileNames: ["ひらがな"],
					getFrontMatterInfo,
				}),
			).toBe("- [[ひらがな]]と[[ひらがな]]");
		});
	});

	describe("special character (pages)", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "tags",
					allFileNames: ["pages/tags"],
					getFrontMatterInfo,
					specialDirs: ["pages"],
				}),
			).toBe("[[tags]]");
		});
	});

	it("multiple links in the same line", async () => {
		expect(
			await replaceLinks({
				fileContent: "サウナ tags pages/tags",
				allFileNames: ["pages/tags", "サウナ", "tags"],
				getFrontMatterInfo,
				specialDirs: ["pages"],
			}),
		).toBe("[[サウナ]] [[tags]] [[pages/tags]]");
	});

	describe("nested links", () => {
		it("", async () => {
			expect(
				await replaceLinks({
					fileContent: "アジャイルリーダーコンピテンシーマップ",
					allFileNames: [
						"アジャイルリーダーコンピテンシーマップ",
						"リーダー",
					],
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
		it("exsiting links", async () => {
			expect(
				await replaceLinks({
					fileContent: "[[アジャイルリーダーコンピテンシーマップ]]",
					allFileNames: [
						"アジャイルリーダーコンピテンシーマップ",
						"リーダー",
					],
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
	});

	describe("with space", () => {
		it("", async () => {
			expect(
				await replaceLinks({
					fileContent: "obsidian/automatic linker",
					allFileNames: ["obsidian/automatic linker", "obsidian"],
					getFrontMatterInfo,
				}),
			).toBe("[[obsidian/automatic linker]]");
		});
	});

	describe("ignore url", () => {
		it("one url", async () => {
			expect(
				await replaceLinks({
					fileContent: "- https://example.com",
					allFileNames: ["example"],
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com");
		});
		it("multiple urls", async () => {
			expect(
				await replaceLinks({
					fileContent: "- https://example.com https://example1.com",
					allFileNames: ["example", "example1"],
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com");
		});
		it("multiple urls with links", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- https://example.com https://example1.com link",
					allFileNames: ["example1", "example", "link"],
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com [[link]]");
		});
	});

	describe("ignore markdown url", () => {
		it("one url", async () => {
			expect(
				await replaceLinks({
					fileContent: "- [title](https://example.com)",
					allFileNames: ["example", "title"],
					getFrontMatterInfo,
				}),
			).toBe("- [title](https://example.com)");
		});
		it("multiple urls", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- [title1](https://example1.com) [title2](https://example2.com)",
					allFileNames: ["example1", "example2", "title1", "title2"],
					getFrontMatterInfo,
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com)",
			);
		});
		it("multiple urls with links", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- [title1](https://example1.com) [title2](https://example2.com) link",
					allFileNames: [
						"example1",
						"example2",
						"title1",
						"title2",
						"link",
					],
					getFrontMatterInfo,
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com) [[link]]",
			);
		});
	});
}
