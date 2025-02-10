import { PathAndAliases } from "./path-and-aliases.types";
import { buildCandidateTrie, buildTrie, CandidateData, TrieNode } from "./trie";

const getEffectiveNamespace = (filePath: string, baseDir?: string): string => {
	if (baseDir) {
		const prefix = baseDir + "/";
		if (filePath.startsWith(prefix)) {
			const rest = filePath.slice(prefix.length);
			const segments = rest.split("/");
			return segments[0] || "";
		}
	}
	const segments = filePath.split("/");
	return segments[0] || "";
};

export const replaceLinks = async ({
	body,
	linkResolverContext: { filePath, trie, candidateMap },
	settings = {
		minCharCount: 0,
		namespaceResolution: true,
		baseDir: undefined,
		ignoreDateFormats: true,
	},
}: {
	body: string;
	linkResolverContext: {
		filePath: string;
		trie: TrieNode;
		candidateMap: Map<string, CandidateData>;
	};
	settings?: {
		minCharCount?: number;
		namespaceResolution?: boolean;
		baseDir?: string;
		ignoreDateFormats?: boolean;
	};
}): Promise<string> => {
	// Return the body unchanged if its length is below the minimum character count.
	if (body.length <= (settings.minCharCount ?? 0)) {
		return body;
	}

	// Utility: Check if a character is a word boundary.
	const isWordBoundary = (char: string | undefined): boolean => {
		if (char === undefined) return true;
		return !/[\p{L}\p{N}_/-]/u.test(char);
	};

	// Utility: Check if a candidate represents a month note (only digits from 1 to 12).
	const isMonthNote = (candidate: string): boolean =>
		!candidate.includes("/") &&
		/^[0-9]{1,2}$/.test(candidate) &&
		parseInt(candidate, 10) >= 1 &&
		parseInt(candidate, 10) <= 12;

	// Regex to protect code blocks, inline code, wikilinks, and Markdown links.
	const protectedRegex =
		/(```[\s\S]*?```|`[^`]*`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;

	// Normalize the body text to NFC.
	body = body.normalize("NFC");

	// If the body consists solely of a protected link, return it unchanged.
	if (/^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/.test(body)) {
		return body;
	}

	// Precompute the fallback index: Map the candidate's shorthand (the substring after the last "/")
	// to an array of entries from candidateMap.
	const fallbackIndex = new Map<string, Array<[string, CandidateData]>>();
	for (const [key, data] of candidateMap.entries()) {
		const slashIndex = key.lastIndexOf("/");
		if (slashIndex === -1) continue;
		const shorthand = key.slice(slashIndex + 1);
		let arr = fallbackIndex.get(shorthand);
		if (!arr) {
			arr = [];
			fallbackIndex.set(shorthand, arr);
		}
		arr.push([key, data]);
	}

	// Determine the effective namespace of the current file.
	const currentNamespace = settings.baseDir
		? getEffectiveNamespace(filePath, settings.baseDir)
		: (function () {
				const segments = filePath.split("/");
				return segments[0] || "";
			})();

	// Helper function to process an unprotected text segment.
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

			// Use the trie to find a candidate.
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
				const candidate = text.substring(i, i + lastCandidate.length);
				// If ignoreDateFormats is enabled and the candidate matches YYYY-MM-DD, skip conversion.
				if (
					settings.ignoreDateFormats &&
					/^\d{4}-\d{2}-\d{2}$/.test(candidate)
				) {
					result += candidate;
					i += lastCandidate.length;
					continue outer;
				}
				// Skip conversion for month notes.
				if (isMonthNote(candidate)) {
					result += candidate;
					i += lastCandidate.length;
					continue;
				}
				if (candidateMap.has(candidate)) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const candidateData = candidateMap.get(candidate)!;
					// Determine if the candidate is composed solely of CJK characters.
					const isCjkCandidate =
						/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(
							candidate,
						);
					const isKorean = /^[\p{Script=Hangul}]+$/u.test(candidate);
					// For non-CJK or Korean candidates, perform word boundary checks.
					if (!isCjkCandidate || isKorean) {
						if (isKorean) {
							const remaining = text.slice(i + candidate.length);
							const suffixMatch = remaining.match(/^(이다\.?)/);
							if (suffixMatch) {
								result +=
									`[[${candidateData.canonical}]]` +
									suffixMatch[0];
								i += candidate.length + suffixMatch[0].length;
								continue outer;
							}
						}
						const left = i > 0 ? text[i - 1] : undefined;
						const right =
							i + candidate.length < text.length
								? text[i + candidate.length]
								: undefined;
						if (!isWordBoundary(left) || !isWordBoundary(right)) {
							result += text[i];
							i++;
							continue outer;
						}
					}
					// If namespaceResolution is enabled and candidateData has a namespace restriction,
					// skip conversion if its namespace does not match the current namespace.
					if (
						settings.namespaceResolution &&
						candidateData.restrictNamespace &&
						candidateData.namespace !== currentNamespace
					) {
						result += candidate;
						i += candidate.length;
						continue outer;
					}
					// Replace candidate with wikilink format.
					result += `[[${candidateData.canonical}]]`;
					i += candidate.length;
					continue outer;
				}
			}

			// Fallback: if no candidate was found via the trie.
			if (settings.namespaceResolution) {
				const fallbackRegex = /^([\p{L}\p{N}_-]+)/u;
				const fallbackMatch = text.slice(i).match(fallbackRegex);
				if (fallbackMatch) {
					const word = fallbackMatch[1];

					// If the word is in YYYY-MM-DD format and ignoreDateFormats is enabled, do not convert.
					if (
						settings.ignoreDateFormats &&
						/^\d{4}-\d{2}-\d{2}$/.test(word)
					) {
						result += word;
						i += word.length;
						continue outer;
					}

					// For date formats: if the word is two digits and the result ends with "YYYY-MM-",
					// skip conversion.
					if (/^\d{2}$/.test(word) && /\d{4}-\d{2}-$/.test(result)) {
						result += text[i];
						i++;
						continue outer;
					}

					// Skip conversion for month notes.
					if (isMonthNote(word)) {
						result += word;
						i += word.length;
						continue;
					}

					// Quickly retrieve matching candidate entries using fallbackIndex.
					const candidateList = fallbackIndex.get(word);
					if (candidateList) {
						// Filter candidates that comply with the current namespace restrictions.
						const filteredCandidates = candidateList.filter(
							([, data]) =>
								!(
									data.restrictNamespace &&
									data.namespace !== currentNamespace
								),
						);

						if (filteredCandidates.length === 1) {
							const candidateData = filteredCandidates[0][1];
							result += `[[${candidateData.canonical}]]`;
							i += word.length;
							continue outer;
						} else if (filteredCandidates.length > 1) {
							let bestCandidate: [string, CandidateData] | null =
								null;
							let bestScore = -1;
							// Get the directory portion of the current file (if any)
							const filePathDir = filePath.includes("/")
								? filePath.slice(0, filePath.lastIndexOf("/"))
								: "";
							const filePathSegments = filePathDir
								? filePathDir.split("/")
								: [];
							for (const [key, data] of filteredCandidates) {
								const slashIndex = key.lastIndexOf("/");
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
									bestCandidate = [key, data];
								} else if (
									score === bestScore &&
									bestCandidate !== null
								) {
									if (
										filePathDir === "" &&
										settings.baseDir
									) {
										// When the current file is in the base directory, compare candidates by relative depth.
										const basePrefix =
											settings.baseDir + "/";
										const getRelativeDepth = (
											k: string,
										): number => {
											if (k.startsWith(basePrefix)) {
												// Remove the baseDir part and count the remaining segments (excluding the filename)
												const relativeParts = k
													.slice(basePrefix.length)
													.split("/");
												return relativeParts.length - 1;
											}
											return Infinity;
										};

										const candidateDepth =
											getRelativeDepth(key);
										const bestCandidateDepth =
											getRelativeDepth(bestCandidate[0]);

										// Prefer the candidate with fewer directory segments (i.e., lower depth).
										if (
											candidateDepth <
												bestCandidateDepth ||
											(candidateDepth ===
												bestCandidateDepth &&
												key.length <
													bestCandidate[0].length)
										) {
											bestCandidate = [key, data];
										}
									} else {
										// Otherwise, choose the candidate with fewer directory segments.
										const currentBestDir =
											bestCandidate[0].slice(
												0,
												bestCandidate[0].lastIndexOf(
													"/",
												),
											);
										const currentBestSegments =
											currentBestDir.split("/");
										if (
											candidateSegments.length <
												currentBestSegments.length ||
											(candidateSegments.length ===
												currentBestSegments.length &&
												key.length <
													bestCandidate[0].length)
										) {
											bestCandidate = [key, data];
										}
									}
								}
							}
							if (bestCandidate !== null) {
								result += `[[${bestCandidate[1].canonical}]]`;
								i += word.length;
								continue outer;
							}
						}
					}
					result += text[i];
					i++;
					continue;
				}
			}

			// If no rule applies, output the current character.
			result += text[i];
			i++;
		}
		return result;
	};

	// Process the entire body while preserving protected segments.
	let resultBody = "";
	let lastIndex = 0;
	for (const m of body.matchAll(protectedRegex)) {
		const mIndex = m.index ?? 0;
		const segment = body.slice(lastIndex, mIndex);
		resultBody += replaceInSegment(segment);
		// Append the protected segment unchanged.
		resultBody += m[0];
		lastIndex = mIndex + m[0].length;
	}
	resultBody += replaceInSegment(body.slice(lastIndex));

	return resultBody;
};

if (import.meta.vitest) {
	const { it, expect, describe } = import.meta.vitest;

	// Helper to sort file names and create file objects.
	const getSortedFiles = (
		fileNames: string[],
		restrictNamespace?: boolean,
		baseDir?: string,
	) => {
		const sortedFileNames = fileNames
			.slice()
			.sort((a, b) => b.length - a.length);
		return sortedFileNames.map((path) => ({
			path,
			aliases: null,
			restrictNamespace: restrictNamespace ?? false,
			namespace: getEffectiveNamespace(path, baseDir),
		}));
	};

	describe("basic", () => {
		it("replaces links", async () => {
			const files = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("[[hello]]");
		});

		it("replaces links with bullet", async () => {
			const files = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- [[hello]]");
		});

		it("replaces links with other texts", async () => {
			{
				const files = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "world hello",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("world [[hello]]");
			}
			{
				const files = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "hello world",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("[[hello]] world");
			}
		});

		it("replaces links with other texts and bullet", async () => {
			{
				const files = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "- world hello",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("- world [[hello]]");
			}
			{
				const files = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "- hello world",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("- [[hello]] world");
			}
		});

		it("replaces multiple links", async () => {
			{
				const files = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "hello world",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("[[hello]] [[world]]");
			}
			{
				const files = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "\nhello\nworld\n",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("\n[[hello]]\n[[world]]\n");
			}
			{
				const files = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "\nhello\nworld aaaaa\n",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("\n[[hello]]\n[[world]] aaaaa\n");
			}
			{
				const files = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "\n aaaaa hello\nworld bbbbb\n",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("\n aaaaa [[hello]]\n[[world]] bbbbb\n");
			}
		});
	});

	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			const files = getSortedFiles(["namespace/tag1", "namespace/tag2"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "namespace",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("namespace");
		});

		it("single namespace", async () => {
			const files = getSortedFiles(["namespace/tag1", "namespace/tag2"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "namespace/tag1",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[namespace/tag1]]");
		});

		it("multiple namespaces", async () => {
			const files = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
				"namespace",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "namespace/tag1 namespace/tag2",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[namespace/tag1]] [[namespace/tag2]]");
		});
	});

	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			const files = getSortedFiles(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "namespace",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("namespace");
		});

		it("multiple namespaces", async () => {
			const files = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
				"namespace/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "namespace/tag1 namespace/tag2 namespace/タグ3",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"[[namespace/tag1]] [[namespace/tag2]] [[namespace/タグ3]]",
			);
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", async () => {
			const files = getSortedFiles(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "名前空間",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("名前空間");
		});

		it("single namespace", async () => {
			const files = getSortedFiles([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "名前空間/tag1",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[名前空間/tag1]]");
		});

		it("multiple namespaces", async () => {
			const files = getSortedFiles([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]",
			);
		});

		it("multiple CJK words", async () => {
			const files = getSortedFiles(["漢字", "ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- 漢字　ひらがな",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- [[漢字]]　[[ひらがな]]");
		});

		it("multiple same CJK words", async () => {
			const files = getSortedFiles(["ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- ひらがなとひらがな",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- [[ひらがな]]と[[ひらがな]]");
		});
	});

	describe("CJK - Korean", () => {
		it("converts Korean words to links", async () => {
			// 韓国語の候補ファイル
			const files = getSortedFiles(["한글", "테스트", "예시"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "한글 테스트 예시",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[한글]] [[테스트]] [[예시]]");
		});

		it("converts Korean words within sentence", async () => {
			const files = getSortedFiles(["문서"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "이 문서는 문서이다.",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("이 문서는 [[문서]]이다.");
		});
	});

	describe("CJK - Chinese", () => {
		it("converts Chinese words to links", async () => {
			const files = getSortedFiles(["汉字", "测试", "示例"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "汉字 测试 示例",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[汉字]] [[测试]] [[示例]]");
		});

		it("converts Chinese words within sentence", async () => {
			const files = getSortedFiles(["文档"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "这个文档很好。",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("这个[[文档]]很好。");
		});
	});

	describe("base character (pages)", () => {
		it("unmatched namespace", async () => {
			const files = getSortedFiles(["pages/tags"]);
			const { candidateMap, trie } = buildCandidateTrie(files, "pages");
			const result = await replaceLinks({
				body: "tags",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[tags]]");
		});
	});

	it("multiple links in the same line", async () => {
		const files = getSortedFiles(["pages/tags", "サウナ", "tags"]);
		const { candidateMap, trie } = buildCandidateTrie(files, "pages");
		const result = await replaceLinks({
			body: "サウナ tags pages/tags",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[サウナ]] [[tags]] [[pages/tags]]");
	});

	describe("nested links", () => {
		it("", async () => {
			const files = getSortedFiles([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "アジャイルリーダーコンピテンシーマップ",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});

		it("existing links", async () => {
			const files = getSortedFiles([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "[[アジャイルリーダーコンピテンシーマップ]]",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
	});

	describe("with space", () => {
		it("", async () => {
			const files = getSortedFiles([
				"obsidian/automatic linker",
				"obsidian",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "obsidian/automatic linker",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[obsidian/automatic linker]]");
		});
	});

	describe("ignore url", () => {
		it("one url", async () => {
			{
				const files = getSortedFiles(["example", "http", "https"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "- https://example.com",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("- https://example.com");
			}
			{
				const files = getSortedFiles(["st"]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "- https://x.com/xxxx/status/12345?t=25S02Tda",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe(
					"- https://x.com/xxxx/status/12345?t=25S02Tda",
				);
			}
		});

		it("multiple urls", async () => {
			const files = getSortedFiles([
				"example",
				"example1",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- https://example.com https://example1.com",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- https://example.com https://example1.com");
		});

		it("multiple urls with links", async () => {
			const files = getSortedFiles([
				"example1",
				"example",
				"link",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- https://example.com https://example1.com link",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"- https://example.com https://example1.com [[link]]",
			);
		});
	});

	describe("ignore markdown url", () => {
		it("one url", async () => {
			const files = getSortedFiles(["example", "title", "https", "http"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- [title](https://example.com)",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- [title](https://example.com)");
		});

		it("multiple urls", async () => {
			const files = getSortedFiles([
				"example1",
				"example2",
				"title1",
				"title2",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- [title1](https://example1.com) [title2](https://example2.com)",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com)",
			);
		});

		it("multiple urls with links", async () => {
			const files = getSortedFiles([
				"example1",
				"example2",
				"title1",
				"title2",
				"https",
				"http",
				"link",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "- [title1](https://example1.com) [title2](https://example2.com) link",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com) [[link]]",
			);
		});
	});

	describe("ignore code", () => {
		it("inline code", async () => {
			const files = getSortedFiles(["example", "code"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "`code` example",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("`code` [[example]]");
		});

		it("code block", async () => {
			const files = getSortedFiles(["example", "typescript"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "```typescript\nexample\n```",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("```typescript\nexample\n```");
		});

		it("skips replacement when content is too short", async () => {
			const files = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 10 },
			});
			expect(result).toBe("hello");
		});
	});

	describe("aliases", () => {
		it("replaces alias with canonical form using file path and alias", async () => {
			const files: PathAndAliases[] = [
				{
					path: "pages/HelloWorld",
					aliases: ["Hello", "HW"],
					restrictNamespace: false,
				},
			];
			const { candidateMap, trie } = buildCandidateTrie(files, "pages");
			const result1 = await replaceLinks({
				body: "Hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result1).toBe("[[pages/HelloWorld|Hello]]");

			const result2 = await replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result2).toBe("[[pages/HelloWorld|HW]]");

			const result3 = await replaceLinks({
				body: "HelloWorld",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result3).toBe("[[HelloWorld]]");
		});

		it("replaces multiple occurrences of alias and normal candidate", async () => {
			const files: PathAndAliases[] = [
				{
					path: "pages/HelloWorld",
					aliases: ["Hello"],
					restrictNamespace: false,
				},
			];
			const { candidateMap, trie } = buildCandidateTrie(files, "pages");
			const result = await replaceLinks({
				body: "Hello HelloWorld",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[pages/HelloWorld|Hello]] [[HelloWorld]]");
		});
	});

	describe("namespace resolution", () => {
		it("replaces candidate with namespace when full candidate is provided", async () => {
			const files = getSortedFiles(["namespaces/link"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "namespaces/link",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[namespaces/link]]");
		});

		it("replaces candidate without namespace correctly", async () => {
			const files = getSortedFiles(["link"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[link]]");
		});

		it("should not replace YYY-MM-DD formatted text when it doesn't match the candidate's shorthand", async () => {
			const files = getSortedFiles(["2025/02/08"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "2025-02-08",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("2025-02-08");
		});
	});

	describe("namespace resolution nearlest file path", () => {
		it("closest siblings namespace should be used", async () => {
			{
				const files = getSortedFiles([
					"namespace/a/b/c/d/link",
					"namespace/a/b/c/d/e/f/link",
					"namespace/a/b/c/link",
				]);
				const { candidateMap, trie } = buildCandidateTrie(files);

				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/a/b/c/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/a/b/c/link]]");
			}
			{
				const files = getSortedFiles([
					"namespace/a/b/c/link",
					"namespace/a/b/c/d/link",
					"namespace/a/b/c/d/e/f/link",
				]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/a/b/c/d/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/a/b/c/d/link]]");
			}
			{
				const files = getSortedFiles([
					"namespace/xxx/link",
					"another-namespace/link",
					"another-namespace/a/b/c/link",
					"another-namespace/a/b/c/d/link",
					"another-namespace/a/b/c/d/e/f/link",
				]);
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/xxx/link]]");
			}
		});

		it("closest children namespace should be used", async () => {
			const files = getSortedFiles([
				"namespace1/subnamespace/link",
				"namespace2/super-super-long-long-directory/link",
				"namespace3/link",
				"namespace/a/b/c/link",
				"namespace/a/b/c/d/link",
				"namespace/a/b/c/d/e/f/link",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/a/b/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[namespace/a/b/c/link]]");
		});

		it("find closest path if the current path is in base dir and the candidate is not", async () => {
			const files = getSortedFiles([
				"namespace1/aaaaaaaaaaaaaaaaaaaaaaaaa/link",
				"base/super-super-long-long-long-long-closest-dir/link",
				"base/super-super-long-long-long-long-closest-dir/super-super-long-long-long-long-closest-sub-dir/link",
				"base/a/b/c/link",
				"base/a/b/c/d/link",
				"base/a/b/c/d/e/f/link",
			]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "base/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true, baseDir: "base" },
			});
			expect(result).toBe(
				"[[base/super-super-long-long-long-long-closest-dir/link]]",
			);

			const result2 = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: false },
			});
			expect(result2).toBe("link");
		});
	});

	it("ignore month notes", async () => {
		const files = getSortedFiles([
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
		const { candidateMap, trie } = buildCandidateTrie(files);
		const result = await replaceLinks({
			body: "01 1 12 namespace/01",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("01 1 12 [[namespace/01]]");
	});

	describe("ignoreDateFormats setting", () => {
		it("should not replace date format when ignoreDateFormats is true", async () => {
			const files = getSortedFiles(["2025-02-10", "journals/2025-02-10"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "2025-02-10",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					ignoreDateFormats: true,
				},
			});
			expect(result).toBe("2025-02-10");
		});

		it("should replace date format when ignoreDateFormats is false", async () => {
			const files = getSortedFiles(["2025-02-10"]);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "2025-02-10",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					ignoreDateFormats: false,
				},
			});
			expect(result).toBe("[[2025-02-10]]");
		});
	});

	describe("replaceLinks (manual candidateMap/trie)", () => {
		const candidateMap = new Map<string, CandidateData>([
			[
				"x",
				{
					canonical: "namespace/x",
					restrictNamespace: true,
					namespace: "namespace",
				},
			],
			[
				"z",
				{
					canonical: "namespace/y/z",
					restrictNamespace: true,
					namespace: "namespace",
				},
			],
			[
				"root",
				{
					canonical: "root-note",
					restrictNamespace: true,
					namespace: "",
				},
			],
			// Candidate without namespace restriction.
			[
				"free",
				{
					canonical: "free-note",
					restrictNamespace: false,
					namespace: "other",
				},
			],
			// For alias testing:
			// Assume file "pages/HelloWorld" with shorthand "HelloWorld"
			[
				"pages/HelloWorld",
				{
					canonical: "pages/HelloWorld",
					restrictNamespace: false,
					namespace: "pages",
				},
			],
			// Alias "Hello" is different from the shorthand, so canonical becomes "pages/HelloWorld|Hello".
			[
				"Hello",
				{
					canonical: "pages/HelloWorld|Hello",
					restrictNamespace: false,
					namespace: "pages",
				},
			],
			// Also register the shorthand candidate.
			[
				"HelloWorld",
				{
					canonical: "HelloWorld",
					restrictNamespace: false,
					namespace: "pages",
				},
			],
			// For "tags" test: candidate key "tags" should map to canonical "tags"
			[
				"pages/tags",
				{
					canonical: "pages/tags",
					restrictNamespace: false,
					namespace: "pages",
				},
			],
			[
				"tags",
				{
					canonical: "tags",
					restrictNamespace: false,
					namespace: "pages",
				},
			],
			// For Korean test, add candidate "문서"
			[
				"문서",
				{
					canonical: "문서",
					restrictNamespace: false,
					namespace: "namespace",
				},
			],
			// For Japanese test, add candidate "ひらがな"
			[
				"ひらがな",
				{
					canonical: "ひらがな",
					restrictNamespace: false,
					namespace: "namespace",
				},
			],
			// For Chinese test, add candidate "文档"
			[
				"文档",
				{
					canonical: "文档",
					restrictNamespace: false,
					namespace: "namespace",
				},
			],
		]);

		it("CJK - Korean > converts Korean words within sentence", async () => {
			const trie = buildTrie(Array.from(candidateMap.keys()));
			const body = "이 문서는 문서이다.";
			const result = await replaceLinks({
				body,
				linkResolverContext: {
					filePath: "namespace/note",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0, namespaceResolution: true },
			});
			expect(result).toBe("이 문서는 [[문서]]이다.");
		});

		it("starting CJK > multiple same CJK words", async () => {
			const trie = buildTrie(Array.from(candidateMap.keys()));
			const body = "- ひらがなとひらがな";
			const result = await replaceLinks({
				body,
				linkResolverContext: {
					filePath: "namespace/note",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0, namespaceResolution: true },
			});
			expect(result).toBe("- [[ひらがな]]と[[ひらがな]]");
		});

		it("CJK - Chinese > converts Chinese words within sentence", async () => {
			const trie = buildTrie(Array.from(candidateMap.keys()));
			const body = "这个文档很好。";
			const result = await replaceLinks({
				body,
				linkResolverContext: {
					filePath: "namespace/note",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0, namespaceResolution: true },
			});
			expect(result).toBe("这个[[文档]]很好。");
		});

		it("base character (pages) > unmatched namespace", async () => {
			const trie = buildTrie(Array.from(candidateMap.keys()));
			const body = "tags";
			const result = await replaceLinks({
				body,
				linkResolverContext: {
					filePath: "root-note",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0, namespaceResolution: true },
			});
			expect(result).toBe("[[tags]]");
		});

		it("aliases > replaces alias with canonical form using file path and alias", async () => {
			const trie = buildTrie(Array.from(candidateMap.keys()));
			const body = "HelloWorld";
			const result = await replaceLinks({
				body,
				linkResolverContext: {
					filePath: "pages/Note",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0, namespaceResolution: true },
			});
			expect(result).toBe("[[HelloWorld]]");
		});

		it("aliases > replaces multiple occurrences of alias and normal candidate", async () => {
			const trie = buildTrie(Array.from(candidateMap.keys()));
			const body = "Hello HelloWorld";
			const result = await replaceLinks({
				body,
				linkResolverContext: {
					filePath: "pages/Note",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0, namespaceResolution: true },
			});
			expect(result).toBe("[[pages/HelloWorld|Hello]] [[HelloWorld]]");
		});

		it("replaceLinks > should not replace when inside a protected segment", async () => {
			const trie = buildTrie(Array.from(candidateMap.keys()));
			const body = "Some text `x` more text";
			const result = await replaceLinks({
				body,
				linkResolverContext: {
					filePath: "namespace/note",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0, namespaceResolution: true },
			});
			expect(result).toBe("Some text `x` more text");
		});

		describe("automatic-linker-restrict-namespace and base dir", () => {
			// Add candidate "a" corresponding to a file at "pages/set/a"
			// with restrictNamespace enabled and an effective namespace of "set".
			candidateMap.set("a", {
				canonical: "set/a",
				restrictNamespace: true,
				namespace: "set",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

			it("should replace candidate with restrictNamespace when effective namespace matches", async () => {
				// Current file is in "pages/set/...", so effective namespace is "set"
				const body = "a";
				const filePath = "pages/set/current";
				const result = await replaceLinks({
					body,
					linkResolverContext: { filePath, trie, candidateMap },
					settings: {
						minCharCount: 0,
						namespaceResolution: true,
						baseDir: "pages",
					},
				});
				expect(result).toBe("[[set/a]]");
			});

			it("should not replace candidate with restrictNamespace when effective namespace does not match", async () => {
				// Current file is in "pages/other/...", so effective namespace is "other"
				const body = "a";
				const filePath = "pages/other/current";
				const result = await replaceLinks({
					body,
					linkResolverContext: { filePath, trie, candidateMap },
					settings: {
						minCharCount: 0,
						namespaceResolution: true,
						baseDir: "pages",
					},
				});
				// Since effective namespace does not match ("set" vs "other"), no replacement occurs.
				expect(result).toBe("a");
			});
		});
	});
}
