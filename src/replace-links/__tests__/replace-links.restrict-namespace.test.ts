import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - restrict namespace", () => {
	describe("automatic-linker-restrict-namespace with baseDir", () => {
		it("should respect restrictNamespace with baseDir", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/set/tag", aliases: [] },
					{ path: "pages/other/current" },
				],
				restrictNamespace: true,
				baseDir: "pages",
			});
			const result = await replaceLinks({
				body: "tag",
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
			expect(result).toBe("[[set/tag]]");
		});

		it("should not replace when namespace does not match with baseDir", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/set/tag" },
					{ path: "pages/other/current" },
				],
				restrictNamespace: true,
				baseDir: "pages",
			});
			const result = await replaceLinks({
				body: "tag",
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
			expect(result).toBe("tag");
		});

		it("should handle multiple namespaces with restrictNamespace", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/set1/tag1" },
					{ path: "pages/set2/tag2" },
					{ path: "pages/other/current" },
				],
				restrictNamespace: true,
				baseDir: "pages",
			});
			const result = await replaceLinks({
				body: "tag1 tag2",
				linkResolverContext: {
					filePath: "pages/set1/current",
					trie,
					candidateMap,
				},
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe("[[set1/tag1]] tag2");
		});
	});
});
