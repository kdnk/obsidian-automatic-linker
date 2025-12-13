import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - CJK handling", () => {
	describe("containing CJK", () => {
		it("complex word boundary", () => {
			{
				const settings = {
					restrictNamespace: false,
					baseDir: undefined,
				};
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "第 3 の存在" }],
					settings,
				});
				const result = replaceLinks({
					body: "- 第 3 の存在から伝える",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings,
				});
				expect(result).toBe("- [[第 3 の存在]]から伝える");
			}
			{
				const settings = {
					restrictNamespace: false,
					baseDir: undefined,
				};
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "第 3 の存在" }],
					settings,
				});
				const result = replaceLinks({
					body: "- 第 3 の存在から伝える",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings,
				});
				expect(result).toBe("- [[第 3 の存在]]から伝える");
			}
			{
				const settings = {
					restrictNamespace: false,
					baseDir: undefined,
				};
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "アレルギー" }],
					settings,
				});
				const result = replaceLinks({
					body: "- ダニとハウスダストアレルギーがあった",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings,
				});
				expect(result).toBe(
					"- ダニとハウスダスト[[アレルギー]]があった",
				);
			}
			{
				const settings = {
					restrictNamespace: false,
					baseDir: "pages",
					ignoreCase: true,
					namespaceResolution: true,
					ignoreDateFormats: true,
				};
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "アレルギー" }],
					settings,
				});
				const result = replaceLinks({
					body: "アレルギーとアレルギー",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings,
				});
				expect(result).toBe("[[アレルギー]]と[[アレルギー]]");
			}
			{
				const settings = {
					restrictNamespace: false,
					baseDir: "pages",
					ignoreCase: true,
					namespaceResolution: true,
					ignoreDateFormats: true,
				};
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "アレルギー" }],
					settings,
				});
				const result = replaceLinks({
					body: "- ダニとハウスダストアレルギーがあった",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings,
				});
				expect(result).toBe(
					"- ダニとハウスダスト[[アレルギー]]があった",
				);
			}
			{
				const settings = {
					restrictNamespace: false,
					baseDir: "pages",
					ignoreCase: true,
					namespaceResolution: true,
					ignoreDateFormats: true,
				};
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "person/taro-san" }],
					settings,
				});
				const result = replaceLinks({
					body: "- 東京出身の taro-san は大阪で働いている",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings,
				});
				expect(result).toBe(
					"- 東京出身の [[person/taro-san|taro-san]] は大阪で働いている",
				);
			}
			{
				const settings = {
					restrictNamespace: false,
					baseDir: "pages",
					ignoreCase: false,
					namespaceResolution: true,
					ignoreDateFormats: true,
				};
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "person/taro-san" }],
					settings,
				});
				const result = replaceLinks({
					body: "- 東京出身の taro-san は大阪で働いている",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings,
				});
				expect(result).toBe(
					"- 東京出身の [[person/taro-san|taro-san]] は大阪で働いている",
				);
			}
		});
		it("unmatched namespace", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/タグ" }],
				settings,
			});
			const result = replaceLinks({
				body: "namespace",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("namespace");
		});

		it("multiple namespaces", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/tag1" },
					{ path: "namespace/tag2" },
					{ path: "namespace/タグ3" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "namespace/tag1 namespace/tag2 namespace/タグ3",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe(
				"[[namespace/tag1|tag1]] [[namespace/tag2|tag2]] [[namespace/タグ3|タグ3]]",
			);
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/タグ" }],
				settings,
			});
			const result = replaceLinks({
				body: "名前空間",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("名前空間");
		});

		it("single namespace", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "名前空間/tag1" },
					{ path: "名前空間/tag2" },
					{ path: "名前空間/タグ3" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "名前空間/tag1",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[名前空間/tag1|tag1]]");
		});

		it("multiple namespaces", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "名前空間/tag1" },
					{ path: "名前空間/tag2" },
					{ path: "名前空間/タグ3" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe(
				"[[名前空間/tag1|tag1]] [[名前空間/tag2|tag2]] [[名前空間/タグ3|タグ3]]",
			);
		});
	});

	describe("automatic-linker-restrict-namespace with CJK", () => {
		it("should respect restrictNamespace for CJK with baseDir", () => {
			const settings = {
				restrictNamespace: true,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/セット/タグ", aliases: [] },
					{ path: "pages/other/current" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "タグ",
				linkResolverContext: {
					filePath: "pages/セット/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[セット/タグ|タグ]]");
		});

		it("should not replace CJK when namespace does not match with baseDir", () => {
			const settings = {
				restrictNamespace: true,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/セット/タグ", aliases: [] },
					{ path: "pages/other/current" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "タグ",
				linkResolverContext: {
					filePath: "pages/other/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("タグ");
		});
	});

	it("multiple same CJK words", () => {
		const settings = {
			restrictNamespace: false,
			baseDir: undefined,
		};
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "ひらがな" }],
			settings,
		});
		const result = replaceLinks({
			body: "- ひらがなひらがな",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings,
		});
		expect(result).toBe("- [[ひらがな]][[ひらがな]]");
	});

	describe("CJK with namespaces", () => {
		it("should convert CJK text with namespace prefix", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: [] }],
				settings,
			});
			const result = replaceLinks({
				body: "- 関係性の勇者は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe(
				"- [[RM/関係性の勇者|関係性の勇者]]は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
			);
		});

		it("should convert CJK text with namespace and alias", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: ["勇者"] }],
				settings,
			});
			const result = replaceLinks({
				body: "- 勇者は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe(
				"- [[RM/関係性の勇者|勇者]]は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
			);
		});

		it("should convert CJK text with namespace and spaces", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: [] }],
				settings,
			});
			const result = replaceLinks({
				body: "- 関係性の勇者 は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe(
				"- [[RM/関係性の勇者|関係性の勇者]] は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
			);
		});
	});
});
