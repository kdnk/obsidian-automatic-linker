export const replaceLinks = async (
	fileContent: string,
	allFileNames: string[],
	getFrontMatterInfo: (fileContent: string) => { contentStart: number },
) => {
	// 特殊文字をエスケープする関数
	const escapeRegExp = (str: string) =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// allFileNames から正規表現パターンを作成
	const filePathPatterns = allFileNames.map((name) => escapeRegExp(name));
	const combinedPattern = filePathPatterns.join("|");

	// CJK対応の境界チェック：
	// ・マッチの直前は行頭または空白（キャプチャグループで保持）
	// ・マッチの直後は行末または空白
	//
	// ※既にリンク化されている場合は ([[...]] の中) にはマッチさせないため、
	//    (?!\[\[) と (?!\]\]) を利用しています。
	const regex = new RegExp(
		`(^|\\s)(?!\\[\\[)(${combinedPattern})(?!\\]\\])(?=$|\\s)`,
		"g",
	);

	// FrontMatterを除いた本文部分で置換する
	const { contentStart } = getFrontMatterInfo(fileContent);
	const contentWithoutFrontMatter = fileContent.slice(contentStart);
	const updatedContent = contentWithoutFrontMatter.replace(
		regex,
		(match, preceding, link) => {
			return `${preceding}[[${link}]]`;
		},
	);
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
					["namespace/tag1", "namespace/tag2", "namespace"],
					getFrontMatterInfo,
				),
			).toBe("[[namespace/tag1]] [[namespace/tag2]]");
		});
	});

	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks(
					"namespace",
					["namespace/タグ"],
					getFrontMatterInfo,
				),
			).toBe("namespace");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks(
					"namespace/tag1 namespace/tag2 namespace/タグ3",
					["namespace/tag1", "namespace/tag2", "namespace/タグ3"],
					getFrontMatterInfo,
				),
			).toBe("[[namespace/tag1]] [[namespace/tag2]] [[namespace/タグ3]]");
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks(
					"名前空間",
					["namespace/タグ"],
					getFrontMatterInfo,
				),
			).toBe("名前空間");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks(
					"名前空間/tag1",
					["名前空間/tag1", "名前空間/tag2", "名前空間/タグ3"],
					getFrontMatterInfo,
				),
			).toBe("[[名前空間/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks(
					"名前空間/tag1 名前空間/tag2 名前空間/タグ3",
					["名前空間/tag1", "名前空間/tag2", "名前空間/タグ3"],
					getFrontMatterInfo,
				),
			).toBe("[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]");
		});
	});
}
