import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - namespace resolution", () => {
	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				fileNames: ["namespace/tag1", "namespace/tag2"],
				aliasMap: {},
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

		it("single namespace", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				fileNames: ["namespace/tag1", "namespace/tag2"],
				aliasMap: {},
				restrictNamespace: false,
				baseDir: undefined,
			});
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
			const { candidateMap, trie } = buildCandidateTrieForTest({
				fileNames: ["namespace/tag1", "namespace/tag2", "namespace"],
				aliasMap: {},
				restrictNamespace: false,
				baseDir: undefined,
			});
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

	describe("automatic-linker-restrict-namespace and base dir", () => {
		it("should replace candidate with restrictNamespace when effective namespace matches", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				fileNames: ["pages/set/a", "pages/other/current"],
				aliasMap: {
					"pages/set/a": [],
				},
				restrictNamespace: true,
				baseDir: "pages",
			});
			const result = await replaceLinks({
				body: "a",
				linkResolverContext: {
					filePath: "pages/set/current",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe("[[set/a]]");
		});

		it("should not replace candidate with restrictNamespace when effective namespace does not match", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				fileNames: ["pages/set/a", "pages/other/current"],
				aliasMap: {
					"pages/set/a": [],
				},
				restrictNamespace: true,
				baseDir: "pages",
			});
			const result = await replaceLinks({
				body: "a",
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
			expect(result).toBe("a");
		});
	});
});
