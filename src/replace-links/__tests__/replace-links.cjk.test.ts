import { describe, expect, it } from "vitest";
import { buildCandidateTrie, buildTrie } from "../../trie";
import { replaceLinks } from "../replace-links";
import { getSortedFiles } from "../test-helpers";

describe("replaceLinks - CJK handling", () => {
	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			const files = getSortedFiles({
				fileNames: ["namespace/タグ"],
			});
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
			const files = getSortedFiles({
				fileNames: [
					"namespace/tag1",
					"namespace/tag2",
					"namespace/タグ3",
				],
			});
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
			const files = getSortedFiles({
				fileNames: ["namespace/タグ"],
			});
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
			const files = getSortedFiles({
				fileNames: ["名前空間/tag1", "名前空間/tag2", "名前空間/タグ3"],
			});
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
			const files = getSortedFiles({
				fileNames: ["名前空間/tag1", "名前空間/tag2", "名前空間/タグ3"],
			});
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
	});

	describe("automatic-linker-restrict-namespace with CJK", () => {
		it("should respect restrictNamespace for CJK with baseDir", async () => {
			const files = getSortedFiles({
				fileNames: ["pages/セット/タグ", "pages/other/current"],
				restrictNamespace: false,
			});
			const { candidateMap } = buildCandidateTrie(files);
			candidateMap.set("タグ", {
				canonical: "セット/タグ",
				restrictNamespace: true,
				namespace: "セット",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

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
			expect(result).toBe("[[セット/タグ]]");
		});

		it("should not replace CJK when namespace does not match with baseDir", async () => {
			const files = getSortedFiles({
				fileNames: ["pages/セット/タグ", "pages/other/current"],
				restrictNamespace: false,
			});
			const { candidateMap } = buildCandidateTrie(files);
			candidateMap.set("タグ", {
				canonical: "セット/タグ",
				restrictNamespace: true,
				namespace: "セット",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

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
});
