import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - CJK handling", () => {
	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/タグ" }],
				restrictNamespace: false,
				baseDir: undefined,
			});
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
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/tag1" },
					{ path: "namespace/tag2" },
					{ path: "namespace/タグ3" },
				],
				restrictNamespace: false,
				baseDir: undefined,
			});
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
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/タグ" }],
				restrictNamespace: false,
				baseDir: undefined,
			});
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
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "名前空間/tag1" },
					{ path: "名前空間/tag2" },
					{ path: "名前空間/タグ3" },
				],
				restrictNamespace: false,
				baseDir: undefined,
			});
			const result = await replaceLinks({
				body: "名前空間/tag1",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[名前空間/tag1|tag1]]");
		});

		it("multiple namespaces", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "名前空間/tag1" },
					{ path: "名前空間/tag2" },
					{ path: "名前空間/タグ3" },
				],
				restrictNamespace: false,
				baseDir: undefined,
			});
			const result = await replaceLinks({
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
		it("should respect restrictNamespace for CJK with baseDir", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/セット/タグ", aliases: [] },
					{ path: "pages/other/current" },
				],
				restrictNamespace: true,
				baseDir: "pages",
			});
			const result = await replaceLinks({
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

		it("should not replace CJK when namespace does not match with baseDir", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/セット/タグ", aliases: [] },
					{ path: "pages/other/current" },
				],
				restrictNamespace: true,
				baseDir: "pages",
			});
			const result = await replaceLinks({
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

	it("multiple same CJK words", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "ひらがな" }],
			restrictNamespace: false,
			baseDir: undefined,
		});
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

	describe("CJK with namespaces", () => {
		it("should convert CJK text with namespace prefix", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: [] }],
				restrictNamespace: false,
				baseDir: "pages",
			});
			const result = await replaceLinks({
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

		it("should convert CJK text with namespace and alias", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: ["勇者"] }],
				restrictNamespace: false,
				baseDir: "pages",
			});
			const result = await replaceLinks({
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
				"- [[RM/関係性の勇者|関係性の勇者]]は自分の鎧について深く学びそれを脱ぎ去る勇気を持っている",
			);
		});

		it("should convert CJK text with namespace and spaces", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "RM/関係性の勇者", aliases: [] }],
				restrictNamespace: false,
				baseDir: "pages",
			});
			const result = await replaceLinks({
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
