export const replaceLinks = async (
	fileContent: string,
	allFileNames: string[],
	getFrontMatterInfo: (fileContent: string) => { contentStart: number },
) => {
	const escapeRegExp = (str: string) =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const filePathPatterns = allFileNames.map((name) => escapeRegExp(name));
	const combinedPattern = filePathPatterns.join("|");
	const regex = new RegExp(
		`\\b(?!\\[\\[)(${combinedPattern})(?!\\]\\])\\b`,
		"g",
	);
	const { contentStart } = getFrontMatterInfo(fileContent);
	const contentWithoutFrontMatter = fileContent.slice(contentStart);
	const updatedContent = contentWithoutFrontMatter.replace(regex, "[[$1]]");
	return updatedContent;
};

if (import.meta.vitest) {
	const { it, expect, describe } = import.meta.vitest;

	const getFrontMatterInfo = (fileContent: string) => ({ contentStart: 0 });

	describe("basic", () => {
		it("replaces links", async () => {
			expect(
				await replaceLinks("hello", ["hello"], getFrontMatterInfo),
			).toBe("[[hello]]");
		});
		it("replaces links with bullet", async () => {
			expect(
				await replaceLinks("- hello", ["hello"], getFrontMatterInfo),
			).toBe("- [[hello]]");
		});
		it("replaces links with other texts", async () => {
			expect(
				await replaceLinks(
					"world hello",
					["hello"],
					getFrontMatterInfo,
				),
			).toBe("world [[hello]]");
			expect(
				await replaceLinks(
					"hello world",
					["hello"],
					getFrontMatterInfo,
				),
			).toBe("[[hello]] world");
		});
		it("replaces links with other texts and bullet", async () => {
			expect(
				await replaceLinks(
					"- world hello",
					["hello"],
					getFrontMatterInfo,
				),
			).toBe("- world [[hello]]");
			expect(
				await replaceLinks(
					"- hello world",
					["hello"],
					getFrontMatterInfo,
				),
			).toBe("- [[hello]] world");
		});

		it("replaces multiple links", async () => {
			expect(
				await replaceLinks(
					"hello world",
					["hello", "world"],
					getFrontMatterInfo,
				),
			).toBe("[[hello]] [[world]]");
			expect(
				await replaceLinks(
					`\nhello\nworld\n`,
					["hello", "world"],
					getFrontMatterInfo,
				),
			).toBe(`\n[[hello]]\n[[world]]\n`);
			expect(
				await replaceLinks(
					`\nhello\nworld aaaaa\n`,
					["hello", "world"],
					getFrontMatterInfo,
				),
			).toBe(`\n[[hello]]\n[[world]] aaaaa\n`);
			expect(
				await replaceLinks(
					`\n aaaaa hello\nworld bbbbb\n`,
					["hello", "world"],
					getFrontMatterInfo,
				),
			).toBe(`\n aaaaa [[hello]]\n[[world]] bbbbb\n`);
		});
	});

	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks(
					"namespace",
					["namespace/tag1", "namespace/tag2"],
					getFrontMatterInfo,
				),
			).toBe("namespace");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks(
					"namespace/tag1",
					["namespace/tag1", "namespace/tag2"],
					getFrontMatterInfo,
				),
			).toBe("[[namespace/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks(
					"namespace/tag1 namespace/tag2",
					["namespace", "namespace/tag1", "namespace/tag2"],
					getFrontMatterInfo,
				),
			).toBe("[[namespace/tag1]] [[namespace/tag2]]");
		});
	});
}
