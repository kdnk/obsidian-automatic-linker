export const replaceLinks = async ({
	fileContent,
	allFileNames,
	getFrontMatterInfo,
	// 特別扱いするディレクトリ一覧。省略時は "pages" を特別扱いします。
	specialDirs = [],
}: {
	fileContent: string;
	allFileNames: string[];
	getFrontMatterInfo: (fileContent: string) => { contentStart: number };
	specialDirs?: string[];
}): Promise<string> => {
	// 正規表現用に特殊文字をエスケープする関数
	const escapeRegExp = (str: string) =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// 候補ファイル名を長いものが先にマッチするように降順ソート
	const sortedFileNames = allFileNames
		.slice()
		.sort((a, b) => b.length - a.length);

	// 各候補について、もし specialDirs のいずれかで始まっていれば、ディレクトリ部分が
	// 省略可能となるように正規表現パターンを作成する。
	const filePathPatterns = sortedFileNames.map((name) => {
		for (const specialDir of specialDirs) {
			const prefix = `${specialDir}/`;
			if (name.startsWith(prefix)) {
				// 例："pages/tags" → (?:pages/)?tags
				return `(?:${escapeRegExp(specialDir)}/)?${escapeRegExp(name.slice(prefix.length))}`;
			}
		}
		// 特別扱い外ならそのままエスケープしたパスを返す
		return escapeRegExp(name);
	});

	// 複数候補を "|" で連結
	const combinedPattern = filePathPatterns.join("|");

	// CJK や日本語の場合、\b (単語境界) は意図した動作をしないため、
	// 行頭または空白（^|\s）と、行末または空白（$|\s）で囲まれた部分にマッチさせる。
	// また、既に [[ ]] で囲まれている場合は除外するため (?!\[\[) と (?!\]\]) を利用。
	const regex = new RegExp(
		`(^|\\s)(?!\\[\\[)(${combinedPattern})(?!\\]\\])(?=$|\\s)`,
		"g",
	);

	// FrontMatter 部分を除いた本文で置換を実施
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

	describe("mixed", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "サウナ tags pages/tags",
					allFileNames: ["pages/tags", "サウナ", "tags"],
					getFrontMatterInfo,
					specialDirs: ["pages"],
				}),
			).toBe("[[tags]]");
		});
	});
}
