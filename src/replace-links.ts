export const replaceLinks = async ({
	fileContent,
	allFileNames,
	getFrontMatterInfo,
	// Directories to treat specially. Defaults to ["pages"].
	baseDirs = ["pages"],
}: {
	fileContent: string;
	allFileNames: string[];
	getFrontMatterInfo: (fileContent: string) => { contentStart: number };
	baseDirs?: string[];
}): Promise<string> => {
	// Escape special regex characters.
	const escapeRegExp = (str: string) =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Sort file names in descending order (longest first) so that longer matches are prioritized.
	const sortedFileNames = allFileNames.slice().sort((a, b) => b.length - a.length);

	// Regex to check if a candidate is "safe" (only contains alphanumerics, underscore, hyphen, slash, and space)
	const safePatternRegex = /^[A-Za-z0-9_\/\- ]+$/;

	// Build regex patterns for each candidate file name.
	// If a file name starts with one of the baseDirs, the directory part is made optional.
	// Additionally, if the candidate consists only of safe characters, wrap it with word boundaries.
	const candidatePatterns = sortedFileNames.map((name) => {
		let pattern: string | null = null;
		for (const specialDir of baseDirs) {
			const prefix = `${specialDir}/`;
			if (name.startsWith(prefix)) {
				// Example: "pages/tags" becomes pattern: (?:pages/)?tags
				pattern = `(?:${escapeRegExp(specialDir)}/)?${escapeRegExp(name.slice(prefix.length))}`;
				break;
			}
		}
		if (!pattern) {
			pattern = escapeRegExp(name);
		}
		if (safePatternRegex.test(name)) {
			pattern = `\\b${pattern}\\b`;
		}
		return pattern;
	});

	// Combine candidate patterns with the OR operator.
	const candidateAlternative = candidatePatterns.join("|");

	// Create the combined regex with the following groups:
	// Group 1: Plain URLs (http:// or https:// followed by non-space characters)
	// Group 2: Wiki links ([[...]])
	// Group 3: Markdown links ([text](url))
	// Group 4: Candidate words (only if not immediately preceded by "http://" or "https://")
	const combinedRegex = new RegExp(
		`(https?:\\/\\/[^\s]+)|(\\[\\[.*?\\]\\])|(\\[[^\\]]+\\]\\([^)]+\\))|(?<!https?:\\/\\/)(` +
			candidateAlternative +
			`)`,
		"gu"
	);

	// Split the file into frontmatter and body using contentStart.
	const { contentStart } = getFrontMatterInfo(fileContent);
	const frontmatter = fileContent.slice(0, contentStart);
	const body = fileContent.slice(contentStart);

	let result = "";
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	// Process the body in one pass.
	while ((match = combinedRegex.exec(body)) !== null) {
		// Append unchanged text from the end of the last match to the start of the current match.
		result += body.slice(lastIndex, match.index);

		// If any of groups 1-3 matched (URLs, Wiki links, or Markdown links), leave the match unchanged.
		if (match[1] || match[2] || match[3]) {
			result += match[0];
		} else {
			// Otherwise, group 4 matched a candidate word; wrap it in double brackets.
			result += `[[${match[0]}]]`;
		}
		lastIndex = combinedRegex.lastIndex;
	}
	// Append any remaining text after the last match.
	result += body.slice(lastIndex);

	// Return the frontmatter concatenated with the processed body.
	return frontmatter + result;
};

if (import.meta.vitest) {
	const { it, expect, describe } = import.meta.vitest;

	const getSortedFileNames = (fileNames: string[]) => {
		return fileNames.slice().sort((a, b) => b.length - a.length);
	};

	const getFrontMatterInfo = (fileContent: string) => ({ contentStart: 0 });

	describe("basic", () => {
		it("replaces links", async () => {
			expect(
				await replaceLinks({
					fileContent: "hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("[[hello]]");
		});
		it("replaces links with bullet", async () => {
			expect(
				await replaceLinks({
					fileContent: "- hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]]");
		});
		it("replaces links with other texts", async () => {
			expect(
				await replaceLinks({
					fileContent: "world hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("world [[hello]]");
			expect(
				await replaceLinks({
					fileContent: "hello world",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("[[hello]] world");
		});
		it("replaces links with other texts and bullet", async () => {
			expect(
				await replaceLinks({
					fileContent: "- world hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("- world [[hello]]");
			expect(
				await replaceLinks({
					fileContent: "- hello world",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]] world");
		});

		it("replaces multiple links", async () => {
			expect(
				await replaceLinks({
					fileContent: "hello world",
					allFileNames: getSortedFileNames(["hello", "world"]),
					getFrontMatterInfo,
				}),
			).toBe("[[hello]] [[world]]");
			expect(
				await replaceLinks({
					fileContent: `\nhello\nworld\n`,
					allFileNames: getSortedFileNames(["hello", "world"]),
					getFrontMatterInfo,
				}),
			).toBe(`\n[[hello]]\n[[world]]\n`);
			expect(
				await replaceLinks({
					fileContent: `\nhello\nworld aaaaa\n`,
					allFileNames: getSortedFileNames(["hello", "world"]),
					getFrontMatterInfo,
				}),
			).toBe(`\n[[hello]]\n[[world]] aaaaa\n`);
			expect(
				await replaceLinks({
					fileContent: `\n aaaaa hello\nworld bbbbb\n`,
					allFileNames: getSortedFileNames(["hello", "world"]),
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
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
					]),
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1",
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1 namespace/tag2",
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
						"namespace",
					]),
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
					allFileNames: getSortedFileNames(["namespace/タグ"]),
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"namespace/tag1 namespace/tag2 namespace/タグ3",
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
						"namespace/タグ3",
					]),
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
					allFileNames: getSortedFileNames(["namespace/タグ"]),
					getFrontMatterInfo,
				}),
			).toBe("名前空間");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1",
					allFileNames: getSortedFileNames([
						"名前空間/tag1",
						"名前空間/tag2",
						"名前空間/タグ3",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
					allFileNames: getSortedFileNames([
						"名前空間/tag1",
						"名前空間/tag2",
						"名前空間/タグ3",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]");
		});
		it("multiple CJK words", async () => {
			expect(
				await replaceLinks({
					fileContent: "- 漢字　ひらがな",
					allFileNames: getSortedFileNames(["漢字", "ひらがな"]),
					getFrontMatterInfo,
				}),
			).toBe("- [[漢字]]　[[ひらがな]]");
		});
		it("multiple same CJK words", async () => {
			expect(
				await replaceLinks({
					fileContent: "- ひらがなとひらがな",
					allFileNames: getSortedFileNames(["ひらがな"]),
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
					allFileNames: getSortedFileNames(["pages/tags"]),
					getFrontMatterInfo,
					baseDirs: ["pages"],
				}),
			).toBe("[[tags]]");
		});
	});

	it("multiple links in the same line", async () => {
		expect(
			await replaceLinks({
				fileContent: "サウナ tags pages/tags",
				allFileNames: getSortedFileNames([
					"pages/tags",
					"サウナ",
					"tags",
				]),
				getFrontMatterInfo,
				baseDirs: ["pages"],
			}),
		).toBe("[[サウナ]] [[tags]] [[pages/tags]]");
	});

	describe("nested links", () => {
		it("", async () => {
			expect(
				await replaceLinks({
					fileContent: "アジャイルリーダーコンピテンシーマップ",
					allFileNames: getSortedFileNames([
						"アジャイルリーダーコンピテンシーマップ",
						"リーダー",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
		it("exsiting links", async () => {
			expect(
				await replaceLinks({
					fileContent: "[[アジャイルリーダーコンピテンシーマップ]]",
					allFileNames: getSortedFileNames([
						"アジャイルリーダーコンピテンシーマップ",
						"リーダー",
					]),
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
					allFileNames: getSortedFileNames([
						"obsidian/automatic linker",
						"obsidian",
					]),
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
					allFileNames: getSortedFileNames([
						"example",
						"http",
						"https",
					]),
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com");
			expect(
				await replaceLinks({
					fileContent: "- https://x.com/xxxx/status/12345?t=25S02Tda",
					allFileNames: getSortedFileNames(["st"]),
					getFrontMatterInfo,
				}),
			).toBe("- https://x.com/xxxx/status/12345?t=25S02Tda");
		});
		it("multiple urls", async () => {
			expect(
				await replaceLinks({
					fileContent: "- https://example.com https://example1.com",
					allFileNames: getSortedFileNames([
						"example",
						"example1",
						"https",
						"http",
					]),
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com");
		});
		it("multiple urls with links", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- https://example.com https://example1.com link",
					allFileNames: getSortedFileNames([
						"example1",
						"example",
						"link",
						"https",
						"http",
					]),
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
					allFileNames: getSortedFileNames([
						"example",
						"title",
						"https",
						"http",
					]),
					getFrontMatterInfo,
				}),
			).toBe("- [title](https://example.com)");
		});
		it("multiple urls", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- [title1](https://example1.com) [title2](https://example2.com)",
					allFileNames: getSortedFileNames([
						"example1",
						"example2",
						"title1",
						"title2",
						"https",
						"http",
					]),
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
					allFileNames: getSortedFileNames([
						"example1",
						"example2",
						"title1",
						"title2",
						"https",
						"http",
						"link",
					]),
					getFrontMatterInfo,
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com) [[link]]",
			);
		});
	});
}
