export const replaceLinks = async ({
	fileContent,
	allFileNames,
	getFrontMatterInfo,
	// 特別扱いするディレクトリ一覧。省略時は "pages" を特別扱いします。
	specialDirs = ["pages"],
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

	// specialDirs に該当する場合、ディレクトリ部分が省略可能になるように正規表現パターンを作成
	const filePathPatterns = sortedFileNames.map((name) => {
		for (const specialDir of specialDirs) {
			const prefix = `${specialDir}/`;
			if (name.startsWith(prefix)) {
				// 例："pages/tags" → パターン: (?:pages/)?tags
				return `(?:${escapeRegExp(specialDir)}/)?${escapeRegExp(name.slice(prefix.length))}`;
			}
		}
		return escapeRegExp(name);
	});

	// 複数候補を "|" で連結してひとつのパターンにする
	const combinedPattern = filePathPatterns.join("|");
	// 候補文字列をマッチさせる正規表現（グローバルフラグ）
	const candidateRegex = new RegExp(`(${combinedPattern})`, "g");

	// FrontMatter 部分を除いた本文を処理対象とする
	const { contentStart } = getFrontMatterInfo(fileContent);
	const contentWithoutFrontMatter = fileContent.slice(contentStart);

	// 既存のリンク（[[…]]）をそのまま残すため、一度既存リンクでテキストを分割して処理する
	const existingLinkRegex = /\[\[.*?\]\]/g;
	let result = "";
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while (
		(match = existingLinkRegex.exec(contentWithoutFrontMatter)) !== null
	) {
		// 現在の既存リンクの直前の部分だけ candidateRegex で置換
		const segment = contentWithoutFrontMatter.slice(lastIndex, match.index);
		const replacedSegment = segment.replace(
			candidateRegex,
			(m) => `[[${m}]]`,
		);
		result += replacedSegment;
		// 既存リンク部分はそのまま追加
		result += match[0];
		lastIndex = match.index + match[0].length;
	}
	// 最後の既存リンク以降の部分も candidateRegex で置換
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
