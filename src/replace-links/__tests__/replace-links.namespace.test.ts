import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - namespace resolution", () => {
	describe("complex fileNames", () => {
		it("unmatched namespace", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/tag1" }, { path: "namespace/tag2" }],
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

		it("single namespace", () => {
			const settings = {
				restrictNamespace: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/tag1" }, { path: "namespace/tag2" }],
				settings,
			});
			const result = replaceLinks({
				body: "namespace/tag1",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[namespace/tag1|tag1]]");
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
					{ path: "namespace" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "namespace/tag1 namespace/tag2",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe(
				"[[namespace/tag1|tag1]] [[namespace/tag2|tag2]]",
			);
		});
	});

	describe("automatic-linker-restrict-namespace and base dir", () => {
		it("should replace candidate with restrictNamespace when effective namespace matches", () => {
			const settings = {
				restrictNamespace: true,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/set/a" },
					{ path: "pages/other/current" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "a",
				linkResolverContext: {
					filePath: "pages/set/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[set/a|a]]");
		});

		it("should not replace candidate with restrictNamespace when effective namespace does not match", () => {
			const settings = {
				restrictNamespace: true,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/set/a" },
					{ path: "pages/other/current" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "a",
				linkResolverContext: {
					filePath: "pages/other/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("a");
		});
	});
});
