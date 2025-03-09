import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - CJK handling", () => {
	describe("containing CJK", () => {
		it("complex word boundary", () => {
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "第 3 の存在" }],
					settings: {
						restrictNamespace: false,
						baseDir: undefined,
					},
				});
				const result = replaceLinks({
					body: "- 第 3 の存在から伝える",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("- [[第 3 の存在]]から伝える");
			}
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "第 3 の存在" }],
					settings: {
						restrictNamespace: false,
						baseDir: undefined,
					},
				});
				const result = replaceLinks({
					body: "- 第 3 の存在から伝える",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("- [[第 3 の存在]]から伝える");
			}
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "アレルギー" }],
					settings: {
						restrictNamespace: false,
						baseDir: undefined,
					},
				});
				const result = replaceLinks({
					body: "- ダニとハウスダストアレルギーがあった",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe(
					"- ダニとハウスダスト[[アレルギー]]があった",
				);
			}
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "アレルギー" }],
					settings: {
						restrictNamespace: false,
						baseDir: "pages",
						ignoreCase: true,
					},
				});
				const result = replaceLinks({
					body: "アレルギーとアレルギー",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings: {
						minCharCount: 0,
						namespaceResolution: true,
						baseDir: "pages",
						ignoreDateFormats: true,
						ignoreCase: true,
					},
				});
				expect(result).toBe("[[アレルギー]]と[[アレルギー]]");
			}
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [{ path: "アレルギー" }],
					settings: {
						restrictNamespace: false,
						baseDir: "pages",
						ignoreCase: true,
					},
				});
				const result = replaceLinks({
					body: "- ダニとハウスダストアレルギーがあった",
					linkResolverContext: {
						filePath: "journals/2022-01-01",
						trie,
						candidateMap,
					},
					settings: {
						minCharCount: 0,
						namespaceResolution: true,
						baseDir: "pages",
						ignoreDateFormats: true,
						ignoreCase: true,
					},
				});
				expect(result).toBe(
					"- ダニとハウスダスト[[アレルギー]]があった",
				);
			}
		});
		it("unmatched namespace", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/タグ" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "namespace",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("namespace");
		});

		it("multiple namespaces", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/tag1" },
					{ path: "namespace/tag2" },
					{ path: "namespace/タグ3" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "namespace/tag1 namespace/tag2 namespace/タグ3",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"[[namespace/tag1|tag1]] [[namespace/tag2|tag2]] [[namespace/タグ3|タグ3]]",
			);
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/タグ" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "名前空間",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("名前空間");
		});

		it("single namespace", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "名前空間/tag1" },
					{ path: "名前空間/tag2" },
					{ path: "名前空間/タグ3" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "名前空間/tag1",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[名前空間/tag1|tag1]]");
		});

		it("multiple namespaces", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "名前空間/tag1" },
					{ path: "名前空間/tag2" },
					{ path: "名前空間/タグ3" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"[[名前空間/tag1|tag1]] [[名前空間/tag2|tag2]] [[名前空間/タグ3|タグ3]]",
			);
		});
	});

	describe("automatic-linker-restrict-namespace with CJK", () => {
		it("should respect restrictNamespace for CJK with baseDir", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/セット/タグ", aliases: [] },
					{ path: "pages/other/current" },
				],
				settings: {
					restrictNamespace: true,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "タグ",
				linkResolverContext: {
					filePath: "pages/セット/current",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe("[[セット/タグ|タグ]]");
		});

		it("should not replace CJK when namespace does not match with baseDir", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/セット/タグ", aliases: [] },
					{ path: "pages/other/current" },
				],
				settings: {
					restrictNamespace: true,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "タグ",
				linkResolverContext: {
					filePath: "pages/other/current",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe("タグ");
		});
	});

	it("multiple same CJK words", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "ひらがな" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "- ひらがなひらがな",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("- [[ひらがな]][[ひらがな]]");
	});

	describe("CJK with namespaces", () => {
		it("should convert CJK text with namespace prefix", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: [] }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "- 関係性の勇者は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe(
				"- [[RM/関係性の勇者|関係性の勇者]]は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
			);
		});

		it("should convert CJK text with namespace and alias", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: ["勇者"] }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "- 勇者は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe(
				"- [[RM/関係性の勇者|勇者]]は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
			);
		});

		it("should convert CJK text with namespace and spaces", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: [] }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "- 関係性の勇者 は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe(
				"- [[RM/関係性の勇者|関係性の勇者]] は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
			);
		});
	});
});
