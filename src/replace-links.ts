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
	// Function to escape special characters for use in regular expressions.
	const escapeRegExp = (str: string) =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Sort candidate filenames in descending order so that longer ones match first.
	const sortedFileNames = allFileNames
		.slice()
		.sort((a, b) => b.length - a.length);

	// Create regex patterns for each candidate. For names that fall under any of the specialDirs,
	// make the directory part optional.
	const filePathPatterns = sortedFileNames.map((name) => {
		for (const specialDir of specialDirs) {
			const prefix = `${specialDir}/`;
			if (name.startsWith(prefix)) {
				// Example: "pages/tags" → pattern: (?:pages/)?tags
				return `(?:${escapeRegExp(specialDir)}/)?${escapeRegExp(
					name.slice(prefix.length),
				)}`;
			}
		}
		return escapeRegExp(name);
	});

	// Concatenate multiple candidate patterns with "|" to form a single pattern.
	const combinedPattern = filePathPatterns.join("|");
	// Regular expression to match candidate strings (global flag).
	const candidateRegex = new RegExp(`(${combinedPattern})`, "g");

	// Process the text body excluding the FrontMatter section.
	const { contentStart } = getFrontMatterInfo(fileContent);
	const contentWithoutFrontMatter = fileContent.slice(contentStart);

	// To leave existing links ([[...]]), split the text by existing links and process separately.
	const existingLinkRegex = /\[\[.*?\]\]/g;
	let result = "";
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while (
		(match = existingLinkRegex.exec(contentWithoutFrontMatter)) !== null
	) {
		// Replace only the segment immediately preceding the current existing link using candidateRegex.
		const segment = contentWithoutFrontMatter.slice(lastIndex, match.index);
		const replacedSegment = segment.replace(
			candidateRegex,
			(m) => `[[${m}]]`,
		);
		result += replacedSegment;
		// Append the existing link unchanged.
		result += match[0];
		lastIndex = match.index + match[0].length;
	}
	// Replace the segment after the last existing link using candidateRegex.
	result += contentWithoutFrontMatter
		.slice(lastIndex)
		.replace(candidateRegex, (m) => `[[${m}]]`);

	return result;
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
}
