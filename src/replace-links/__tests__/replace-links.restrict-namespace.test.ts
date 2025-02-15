import { describe, expect, it } from "vitest";
import { buildCandidateTrie, buildTrie } from "../../trie";
import { replaceLinks } from "../replace-links";
import { getSortedFiles } from "./test-helpers";

describe("replaceLinks - restrict namespace", () => {
	describe("automatic-linker-restrict-namespace with baseDir", () => {
		it("should respect restrictNamespace with baseDir", async () => {
			const files = getSortedFiles({
				fileNames: ["pages/set/tag", "pages/other/current"],
				restrictNamespace: false,
			});
			const { candidateMap } = buildCandidateTrie(files);
			candidateMap.set("tag", {
				canonical: "set/tag",
				restrictNamespace: true,
				namespace: "set",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

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
			const files = getSortedFiles({
				fileNames: ["pages/set/tag", "pages/other/current"],
				restrictNamespace: false,
			});
			const { candidateMap } = buildCandidateTrie(files);
			candidateMap.set("tag", {
				canonical: "set/tag",
				restrictNamespace: true,
				namespace: "set",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

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
			const files = getSortedFiles({
				fileNames: [
					"pages/set1/tag1",
					"pages/set2/tag2",
					"pages/other/current",
				],
				restrictNamespace: false,
			});
			const { candidateMap } = buildCandidateTrie(files);
			candidateMap.set("tag1", {
				canonical: "set1/tag1",
				restrictNamespace: true,
				namespace: "set1",
			});
			candidateMap.set("tag2", {
				canonical: "set2/tag2",
				restrictNamespace: true,
				namespace: "set2",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

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
