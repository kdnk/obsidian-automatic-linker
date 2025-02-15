import { describe, expect, it } from "vitest";
import { buildCandidateTrie, buildTrie } from "../../trie";
import { replaceLinks } from "../replace-links";
import { getSortedFiles } from "../test-helpers";

describe("replaceLinks - namespace resolution", () => {
	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			const files = getSortedFiles({
				fileNames: ["namespace/tag1", "namespace/tag2"],
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

		it("single namespace", async () => {
			const files = getSortedFiles({
				fileNames: ["namespace/tag1", "namespace/tag2"],
			});
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
			const files = getSortedFiles({
				fileNames: ["namespace/tag1", "namespace/tag2", "namespace"],
			});
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

	describe("automatic-linker-restrict-namespace and base dir", () => {
		const files = getSortedFiles({
			fileNames: ["pages/set/a", "pages/other/current"],
			restrictNamespace: false,
		});
		const { candidateMap } = buildCandidateTrie(files);
		candidateMap.set("a", {
			canonical: "set/a",
			restrictNamespace: true,
			namespace: "set",
		});
		const trie = buildTrie(Array.from(candidateMap.keys()));

		it("should replace candidate with restrictNamespace when effective namespace matches", async () => {
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
