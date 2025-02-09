import { buildCandidateTrie, TrieNode } from "./trie";

/**
 * Replaces plain text with wikilinks using the provided Trie and candidateMap.
 *
 * @param filePath - The path of the current file.
 * @param body - The content of the file to process.
 * @param trie - The pre-built Trie for candidate lookup.
 * @param candidateMap - Mapping from candidate string to its canonical replacement.
 * @param minCharCount - Minimum character count required to perform replacement.
 * @param getFrontMatterInfo - Function to get the front matter info.
 * @param namespaceResolution - If false, automatic namespace resolution is skipped.
 * @returns The file content with replaced links.
 */
export const replaceLinks = async ({
	body,
	frontmatter,
	linkResolverContext: { filePath, trie, candidateMap },
	settings = {
		minCharCount: 0,
		namespaceResolution: true,
	},
}: {
	body: string;
	frontmatter: string;
	linkResolverContext: {
		filePath: string;
		trie: TrieNode;
		candidateMap: Map<string, string>;
	};
	settings?: {
		minCharCount?: number;
		namespaceResolution?: boolean;
	};
}): Promise<string> => {
	// Return content as-is if it's shorter than the minimum character count.
	if (body.length <= (settings.minCharCount ?? 0)) {
		return frontmatter + body;
	}

	// Determine if a character is a word boundary.
	// (Considers any Unicode letter or number, underscore, slash, or hyphen as part of a word.)
	const isWordBoundary = (char: string | undefined): boolean => {
		if (char === undefined) return true;
		return !/[\p{L}\p{N}_/-]/u.test(char);
	};

	// Determine if the candidate string represents a month note (e.g. "1", "01", ..., "12")
	const isMonthNote = (candidate: string): boolean =>
		!candidate.includes("/") &&
		/^[0-9]{1,2}$/.test(candidate) &&
		parseInt(candidate, 10) >= 1 &&
		parseInt(candidate, 10) <= 12;

	// Regex to match protected segments (code blocks, inline code, wikilinks, Markdown links)
	const protectedRegex =
		/(```[\s\S]*?```|`[^`]*`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;

	// Normalize the body text to NFC.
	body = body.normalize("NFC");

	// If the body consists solely of a protected link, return it unchanged.
	if (/^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/.test(body)) {
		return frontmatter + body;
	}

	// Helper function to process a plain text segment.
	const replaceInSegment = (text: string): string => {
		let result = "";
		let i = 0;
		outer: while (i < text.length) {
			// If a URL is found, copy it unchanged.
			const urlMatch = text.slice(i).match(/^(https?:\/\/[^\s]+)/);
			if (urlMatch) {
				result += urlMatch[0];
				i += urlMatch[0].length;
				continue;
			}

			// Use the Trie to find a candidate.
			let node = trie;
			let lastCandidate: { candidate: string; length: number } | null =
				null;
			let j = i;
			while (j < text.length) {
				const ch = text[j];
				const child = node.children.get(ch);
				if (!child) break;
				node = child;
				if (node.candidate) {
					lastCandidate = {
						candidate: node.candidate,
						length: j - i + 1,
					};
				}
				j++;
			}
			if (lastCandidate) {
				// Get the candidate string matched from the current position.
				const candidate = text.substring(i, i + lastCandidate.length);

				// If it's a month note, do not convert.
				if (isMonthNote(candidate)) {
					result += candidate;
					i += lastCandidate.length;
					continue;
				}

				if (candidateMap.has(candidate)) {
					// 判定用の正規表現：
					// isCjkCandidate は中国語・ひらがな・カタカナ・ハングルのいずれのみで構成されるか
					const isCjkCandidate =
						/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(
							candidate,
						);
					// isKorean はハングルのみで構成されるか
					const isKorean = /^[\p{Script=Hangul}]+$/u.test(candidate);
					// 非 CJK もしくは、CJK であっても韓国語（ハングル）の場合は単語境界チェックを行う
					if (!isCjkCandidate || isKorean) {
						const left = i > 0 ? text[i - 1] : undefined;
						const right =
							i + lastCandidate.length < text.length
								? text[i + lastCandidate.length]
								: undefined;
						if (!isWordBoundary(left) || !isWordBoundary(right)) {
							// 韓国語の場合、許容接尾辞 (例: "이다", "이다.") をチェック
							if (isKorean) {
								const remaining = text.slice(
									i + candidate.length,
								);
								const suffixMatch =
									remaining.match(/^(이다\.?)/);
								if (suffixMatch) {
									const canonical =
										candidateMap.get(candidate) ??
										candidate;
									result +=
										`[[${canonical}]]` + suffixMatch[0];
									i +=
										candidate.length +
										suffixMatch[0].length;
									continue outer;
								}
							}
							// 接尾辞がなければ変換せず、現在の文字を出力して先に進む
							result += text[i];
							i++;
							continue outer;
						}
						// 単語境界チェックが通れば変換
						const canonical =
							candidateMap.get(candidate) ?? candidate;
						result += `[[${canonical}]]`;
						i += lastCandidate.length;
						continue outer;
					} else {
						// 中国語、ひらがな、カタカナなどの非韓国語 CJK はそのまま変換
						const canonical =
							candidateMap.get(candidate) ?? candidate;
						result += `[[${canonical}]]`;
						i += lastCandidate.length;
						continue outer;
					}
				}
			}

			// Fallback: namespace resolution if enabled.
			// Fallback: namespace resolution if enabled.
			if (settings.namespaceResolution) {
				const fallbackRegex = /^([\p{L}\p{N}_-]+)/u;
				const fallbackMatch = text.slice(i).match(fallbackRegex);
				if (fallbackMatch) {
					const word = fallbackMatch[1];

					// For date formats: if the candidate is 2 digits and the result ends with YYYY-MM-, skip conversion.
					if (/^\d{2}$/.test(word) && /\d{4}-\d{2}-$/.test(result)) {
						result += text[i];
						i++;
						continue;
					}

					// Skip conversion for month notes.
					if (isMonthNote(word)) {
						result += word;
						i += word.length;
						continue;
					}

					// Only use the direct candidateMap replacement if there is a single candidate.
					{
						let count = 0;
						let singleCandidate: string | undefined;
						for (const key of candidateMap.keys()) {
							const slashIndex = key.lastIndexOf("/");
							if (slashIndex !== -1) {
								const shorthand = key.slice(slashIndex + 1);
								if (shorthand === word) {
									count++;
									singleCandidate = key;
								}
							}
						}
						if (count === 1 && singleCandidate !== undefined) {
							result += `[[${singleCandidate}]]`;
							i += word.length;
							continue;
						}
					}

					// Otherwise, try to resolve namespaces by selecting the candidate
					// whose full path is closest to the current file's path.
					let bestCandidate: string | null = null;
					let bestScore = -1;
					const filePathDir = filePath.includes("/")
						? filePath.slice(0, filePath.lastIndexOf("/"))
						: "";
					// If there is no directory (i.e. filePath is top‑level), we want to use a different tie-breaker.
					const useLongerCandidate = filePathDir === "";
					const filePathSegments = filePathDir
						? filePathDir.split("/")
						: [];
					for (const [key] of candidateMap.entries()) {
						const slashIndex = key.lastIndexOf("/");
						if (slashIndex !== -1) {
							const shorthand = key.slice(slashIndex + 1);
							if (shorthand === word) {
								const candidateDir = key.slice(0, slashIndex);
								const candidateSegments =
									candidateDir.split("/");
								let score = 0;
								for (
									let idx = 0;
									idx <
									Math.min(
										candidateSegments.length,
										filePathSegments.length,
									);
									idx++
								) {
									if (
										candidateSegments[idx] ===
										filePathSegments[idx]
									) {
										score++;
									} else {
										break;
									}
								}
								if (score > bestScore) {
									bestScore = score;
									bestCandidate = key;
								} else if (
									score === bestScore &&
									bestCandidate !== null
								) {
									// Tie-breaker:
									if (useLongerCandidate) {
										// When there is no namespace in the file path,
										// choose the candidate with the greater key length.
										if (key.length > bestCandidate.length) {
											bestCandidate = key;
										}
									} else {
										// Otherwise, choose the candidate with fewer directory segments.
										const currentBestDir =
											bestCandidate.slice(
												0,
												bestCandidate.lastIndexOf("/"),
											);
										const currentBestSegments =
											currentBestDir.split("/");
										if (
											candidateSegments.length <
											currentBestSegments.length
										) {
											bestCandidate = key;
										}
									}
								}
							}
						}
					}
					if (bestCandidate !== null) {
						result += `[[${bestCandidate}]]`;
						i += word.length;
						continue outer;
					}

					// If no candidate is found, advance one character.
					result += text[i];
					i++;
					continue;
				}
			}

			// If no rules apply, output the current character as is.
			result += text[i];
			i++;
		}
		return result;
	};

	// Process the body while preserving protected segments.
	let resultBody = "";
	let lastIndex = 0;
	for (const m of body.matchAll(protectedRegex)) {
		const mIndex = m.index ?? 0;
		const segment = body.slice(lastIndex, mIndex);
		resultBody += replaceInSegment(segment);
		resultBody += m[0];
		lastIndex = mIndex + m[0].length;
	}
	resultBody += replaceInSegment(body.slice(lastIndex));

	return frontmatter + resultBody;
};

if (import.meta.vitest) {
	const { it, expect, describe } = import.meta.vitest;

	// Helper to sort file names and create file objects.
	const getSortedFiles = (fileNames: string[]) => {
		const sortedFileNames = fileNames
			.slice()
			.sort((a, b) => b.length - a.length);
		return sortedFileNames.map((path) => ({ path, aliases: null }));
	};

	describe("basic", () => {
		it("replaces links", async () => {
			const fileNames = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					frontmatter: "",
					body: "hello",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings: {
						minCharCount: 0,
					},
				}),
			).toBe("[[hello]]");
		});

		it("replaces links with bullet", async () => {
			const fileNames = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					frontmatter: "",
					body: "- hello",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("- [[hello]]");
		});

		it("replaces links with other texts", async () => {
			{
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: "world hello",
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe("world [[hello]]");
			}
			{
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: "hello world",
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe("[[hello]] world");
			}
		});

		it("replaces links with other texts and bullet", async () => {
			{
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: "- world hello",
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe("- world [[hello]]");
			}
			{
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: "- hello world",
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe("- [[hello]] world");
			}
		});

		it("replaces multiple links", async () => {
			{
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: "hello world",
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe("[[hello]] [[world]]");
			}
			{
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: `\nhello\nworld\n`,
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe(`\n[[hello]]\n[[world]]\n`);
			}
			{
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: `\nhello\nworld aaaaa\n`,
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe(`\n[[hello]]\n[[world]] aaaaa\n`);
			}
			{
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: `\n aaaaa hello\nworld bbbbb\n`,
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe(`\n aaaaa [[hello]]\n[[world]] bbbbb\n`);
			}
		});
	});

	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "namespace",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("namespace");
		});

		it("single namespace", async () => {
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "namespace/tag1",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[namespace/tag1]]");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
				"namespace",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "namespace/tag1 namespace/tag2",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]]");
		});
	});

	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFiles(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "namespace",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("namespace");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
				"namespace/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "namespace/tag1 namespace/tag2 namespace/タグ3",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]] [[namespace/タグ3]]");
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFiles(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "名前空間",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("名前空間");
		});

		it("single namespace", async () => {
			const fileNames = getSortedFiles([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "名前空間/tag1",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[名前空間/tag1]]");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFiles([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]");
		});

		it("multiple CJK words", async () => {
			const fileNames = getSortedFiles(["漢字", "ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "- 漢字　ひらがな",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("- [[漢字]]　[[ひらがな]]");
		});

		it("multiple same CJK words", async () => {
			const fileNames = getSortedFiles(["ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "- ひらがなとひらがな",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("- [[ひらがな]]と[[ひらがな]]");
		});
	});

	describe("CJK - Korean", () => {
		it("converts Korean words to links", async () => {
			// テスト用の韓国語ファイル名を登録
			const fileNames = getSortedFiles(["한글", "테스트", "예시"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "한글 테스트 예시",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[한글]] [[테스트]] [[예시]]");
		});

		it("converts Korean words within sentence", async () => {
			// 文章中に韓国語の候補が含まれるケース
			const fileNames = getSortedFiles(["문서"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "이 문서는 문서이다.",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("이 문서는 [[문서]]이다.");
		});
	});

	describe("CJK - Chinese", () => {
		it("converts Chinese words to links", async () => {
			// テスト用の中国語ファイル名を登録
			const fileNames = getSortedFiles(["汉字", "测试", "示例"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "汉字 测试 示例",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",

						trie,
						candidateMap,
					},
				}),
			).toBe("[[汉字]] [[测试]] [[示例]]");
		});

		it("converts Chinese words within sentence", async () => {
			// 文章中に中国語の候補が含まれるケース
			const fileNames = getSortedFiles(["文档"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "这个文档很好。",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("这个[[文档]]很好。");
		});
	});

	describe("base character (pages)", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFiles(["pages/tags"]);
			// Pass baseDirs to buildCandidateTrie so that the short candidate is created.
			const { candidateMap, trie } = buildCandidateTrie(fileNames, [
				"pages",
			]);
			expect(
				await replaceLinks({
					body: "tags",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[tags]]");
		});
	});

	it("multiple links in the same line", async () => {
		const fileNames = getSortedFiles(["pages/tags", "サウナ", "tags"]);
		const { candidateMap, trie } = buildCandidateTrie(fileNames, ["pages"]);
		expect(
			await replaceLinks({
				body: "サウナ tags pages/tags",
				frontmatter: "",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			}),
		).toBe("[[サウナ]] [[tags]] [[pages/tags]]");
	});

	describe("nested links", () => {
		it("", async () => {
			const fileNames = getSortedFiles([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "アジャイルリーダーコンピテンシーマップ",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});

		it("existing links", async () => {
			const fileNames = getSortedFiles([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "[[アジャイルリーダーコンピテンシーマップ]]",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
	});

	describe("with space", () => {
		it("", async () => {
			const fileNames = getSortedFiles([
				"obsidian/automatic linker",
				"obsidian",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "obsidian/automatic linker",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[obsidian/automatic linker]]");
		});
	});

	describe("ignore url", () => {
		it("one url", async () => {
			{
				const fileNames = getSortedFiles(["example", "http", "https"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: "- https://example.com",
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe("- https://example.com");
			}
			{
				const fileNames = getSortedFiles(["st"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						body: "- https://x.com/xxxx/status/12345?t=25S02Tda",
						frontmatter: "",
						linkResolverContext: {
							filePath: "journals/2022-01-01",
							trie,
							candidateMap,
						},
					}),
				).toBe("- https://x.com/xxxx/status/12345?t=25S02Tda");
			}
		});

		it("multiple urls", async () => {
			const fileNames = getSortedFiles([
				"example",
				"example1",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "- https://example.com https://example1.com",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("- https://example.com https://example1.com");
		});

		it("multiple urls with links", async () => {
			const fileNames = getSortedFiles([
				"example1",
				"example",
				"link",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "- https://example.com https://example1.com link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("- https://example.com https://example1.com [[link]]");
		});
	});

	describe("ignore markdown url", () => {
		it("one url", async () => {
			const fileNames = getSortedFiles([
				"example",
				"title",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "- [title](https://example.com)",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("- [title](https://example.com)");
		});

		it("multiple urls", async () => {
			const fileNames = getSortedFiles([
				"example1",
				"example2",
				"title1",
				"title2",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "- [title1](https://example1.com) [title2](https://example2.com)",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com)",
			);
		});

		it("multiple urls with links", async () => {
			const fileNames = getSortedFiles([
				"example1",
				"example2",
				"title1",
				"title2",
				"https",
				"http",
				"link",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "- [title1](https://example1.com) [title2](https://example2.com) link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com) [[link]]",
			);
		});
	});

	describe("ignore code", () => {
		it("inline code", async () => {
			const fileNames = getSortedFiles(["example", "code"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "`code` example",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("`code` [[example]]");
		});

		it("code block", async () => {
			const fileNames = getSortedFiles(["example", "typescript"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "```typescript\nexample\n```",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("```typescript\nexample\n```");
		});
		it("skips replacement when content is too short", async () => {
			const fileNames = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			// When minCharCount is higher than the body length, no replacement should occur.
			expect(
				await replaceLinks({
					body: "hello",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings: {
						minCharCount: 10,
					},
				}),
			).toBe("hello");
		});
	});

	describe("aliases", () => {
		it("replaces alias with canonical form using file path and alias", async () => {
			// File information with aliases
			const files = [
				{ path: "pages/HelloWorld", aliases: ["Hello", "HW"] },
			];
			const { candidateMap, trie } = buildCandidateTrie(files, ["pages"]);
			// "Hello" is registered as an alias with canonical value "pages/HelloWorld|Hello"
			expect(
				await replaceLinks({
					body: "Hello",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[pages/HelloWorld|Hello]]");
			// "HW" is treated the same way
			expect(
				await replaceLinks({
					body: "HW",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[pages/HelloWorld|HW]]");
			// The normal candidate "HelloWorld" is registered normally
			expect(
				await replaceLinks({
					body: "HelloWorld",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[HelloWorld]]");
		});

		it("replaces multiple occurrences of alias and normal candidate", async () => {
			// File information with aliases
			const files = [{ path: "pages/HelloWorld", aliases: ["Hello"] }];
			const { candidateMap, trie } = buildCandidateTrie(files, ["pages"]);
			// Verify replacement when alias and normal candidate coexist in the text
			expect(
				await replaceLinks({
					body: "Hello HelloWorld",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				}),
			).toBe("[[pages/HelloWorld|Hello]] [[HelloWorld]]");
		});
	});

	describe("namespace resolution", () => {
		it("replaces candidate with namespace when full candidate is provided", async () => {
			// Test that a candidate including a namespace is correctly replaced when the full candidate string is used in the content.
			const fileNames = getSortedFiles(["namespaces/link"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "namespaces/link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("[[namespaces/link]]");
		});

		it("replaces candidate without namespace correctly", async () => {
			// Test that a candidate without any namespace is correctly replaced.
			const fileNames = getSortedFiles(["link"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("[[link]]");
		});

		it("should not replace YYY-MM-DD formatted text when it doesn't match the candidate's shorthand", async () => {
			// Test that if the candidate has a namespace, using a YYY-MM-DD formatted date
			// (with hyphens instead of slashes) does not trigger a replacement.
			const fileNames = getSortedFiles(["2025/02/08"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					body: "2025-02-08",
					frontmatter: "",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("2025-02-08");
		});
	});

	describe("namespace resolution nearlest file path", () => {
		const fileNames = getSortedFiles([
			"namespace1/subnamespace/link",
			"namespace2/super-super-long-long-directory/link",
			"namespace3/link",
			"namespace4/a/b/c/d/link",
			"namespace4/a/b/c/d/e/f/link",
			"namespace4/a/b/c/link",
		]);
		const { candidateMap, trie } = buildCandidateTrie(fileNames);

		it("closest siblings namespace should be used", async () => {
			// Test that if the candidate has a namespace, using only the shorthand (without the namespace) in the content expands to the full namespaced candidate.

			// siblings
			expect(
				await replaceLinks({
					body: "link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "namespace4/a/b/c/current-file",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("[[namespace4/a/b/c/link]]");

			// siblings
			expect(
				await replaceLinks({
					body: "link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "namespace4/a/b/c/d/current-file",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("[[namespace4/a/b/c/d/link]]");

			// closest namespace should be used
			expect(
				await replaceLinks({
					body: "link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "namespace2/current-file",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("[[namespace2/super-super-long-long-directory/link]]");
		});

		it("closest children namespace should be used", async () => {
			// closest children
			expect(
				await replaceLinks({
					body: "link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "namespace4/a/b/current-file",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("[[namespace4/a/b/c/link]]");
		});

		it("usual process if no closest namespace", async () => {
			expect(
				await replaceLinks({
					body: "link",
					frontmatter: "",
					linkResolverContext: {
						filePath: "current-file",
						trie,
						candidateMap,
					},
					settings: {
						namespaceResolution: true,
					},
				}),
			).toBe("[[namespace2/super-super-long-long-directory/link]]");
		});
	});

	it("ignore month notes", async () => {
		const fileNames = getSortedFiles([
			"01",
			"02",
			"03",
			"04",
			"05",
			"06",
			"07",
			"08",
			"09",
			"10",
			"11",
			"12",
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"namespace/01",
			"namespace/02",
			"namespace/03",
			"namespace/04",
			"namespace/05",
			"namespace/06",
			"namespace/07",
			"namespace/08",
			"namespace/09",
			"namespace/10",
			"namespace/11",
			"namespace/12",
			"namespace/1",
			"namespace/2",
			"namespace/3",
			"namespace/4",
			"namespace/5",
			"namespace/6",
			"namespace/7",
			"namespace/8",
			"namespace/9",
		]);
		const { candidateMap, trie } = buildCandidateTrie(fileNames);
		expect(
			await replaceLinks({
				body: "01 1 12 namespace/01",
				frontmatter: "",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			}),
		).toBe("01 1 12 [[namespace/01]]");
	});
}
