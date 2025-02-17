import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - namespace resolution", () => {
	describe("basic namespace resolution", () => {
		it("unmatched namespace", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "namespace/tag1" }, { path: "namespace/tag2" }],
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
				files: [{ path: "namespace/tag1" }, { path: "namespace/tag2" }],
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
			expect(result).toBe("[[namespace/tag1|tag1]]");
		});

		it("multiple namespaces", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/tag1" },
					{ path: "namespace/tag2" },
					{ path: "namespace" },
				],
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
			expect(result).toBe(
				"[[namespace/tag1|tag1]] [[namespace/tag2|tag2]]",
			);
		});
	});

	describe("namespace resolution nearest file path", () => {
		it("closest siblings namespace should be used", async () => {
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [
						{ path: "namespace/a/b/c/d/link" },
						{ path: "namespace/a/b/c/d/e/f/link" },
						{ path: "namespace/a/b/c/link" },
					],
					restrictNamespace: false,
					baseDir: undefined,
				});

				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/a/b/c/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/a/b/c/link|link]]");
			}
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [
						{ path: "namespace/a/b/c/link" },
						{ path: "namespace/a/b/c/d/link" },
						{ path: "namespace/a/b/c/d/e/f/link" },
					],
					restrictNamespace: false,
					baseDir: undefined,
				});
				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/a/b/c/d/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/a/b/c/d/link|link]]");
			}
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [
						{ path: "namespace/xxx/link" },
						{ path: "another-namespace/link" },
						{ path: "another-namespace/a/b/c/link" },
						{ path: "another-namespace/a/b/c/d/link" },
						{ path: "another-namespace/a/b/c/d/e/f/link" },
					],
					restrictNamespace: false,
					baseDir: undefined,
				});
				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/xxx/link|link]]");
			}
		});

		it("closest children namespace should be used", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace1/subnamespace/link" },
					{ path: "namespace2/super-super-long-long-directory/link" },
					{ path: "namespace3/link" },
					{ path: "namespace/a/b/c/link" },
					{ path: "namespace/a/b/c/d/link" },
					{ path: "namespace/a/b/c/d/e/f/link" },
				],
				restrictNamespace: false,
				baseDir: undefined,
			});
			const result = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/a/b/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[namespace/a/b/c/link|link]]");
		});

		it("find closest path if the current path is in base dir and the candidate is not", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace1/aaaaaaaaaaaaaaaaaaaaaaaaa/link" },
					{ path: "namespace1/link2" },
					{ path: "namespace2/link2" },
					{ path: "namespace3/aaaaaa/bbbbbb/link2" },
					{
						path: "base/looooooooooooooooooooooooooooooooooooooong/link",
					},
					{
						path: "base/looooooooooooooooooooooooooooooooooooooong/super-super-long-long-long-long-closest-sub-dir/link",
					},
					{ path: "base/a/b/c/link" },
					{ path: "base/a/b/c/d/link" },
					{ path: "base/a/b/c/d/e/f/link" },
				],
				restrictNamespace: false,
				baseDir: "base",
			});
			const result = await replaceLinks({
				body: "link link2",
				linkResolverContext: {
					filePath: "base/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true, baseDir: "base" },
			});
			expect(result).toBe(
				"[[looooooooooooooooooooooooooooooooooooooong/link|link]] [[namespace1/link2|link2]]",
			);

			const result2 = await replaceLinks({
				body: "link link2",
				linkResolverContext: {
					filePath: "base/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: false, baseDir: "base" },
			});
			expect(result2).toBe("link link2");
		});
	});

	describe("namespace resoluton with aliases", () => {
		it("should resolve without aliases", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/xx/yy/link" },
					{ path: "namespace/xx/link" },
					{ path: "namespace/link2" },
				],
				restrictNamespace: false,
				baseDir: undefined,
			});
			const result = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/xx/current-file",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[namespace/xx/link|link]]");
		});

		it("should resolve aliases", async () => {
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [
						{ path: "namespace/xx/yy/link" },
						{ path: "namespace/xx/link", aliases: ["alias"] },
						{ path: "namespace/link2" },
					],
					restrictNamespace: false,
					baseDir: undefined,
				});
				const result = await replaceLinks({
					body: "alias",
					linkResolverContext: {
						filePath: "namespace/xx/current-file",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("[[namespace/xx/link|alias]]");
			}
			{
				const { candidateMap, trie } = buildCandidateTrieForTest({
					files: [
						{ path: "namespace/xx/yy/zz/link" },
						{ path: "namespace/xx/yy/link", aliases: ["alias"] },
						{ path: "namespace/xx/link" },
						{ path: "namespace/link" },
						{ path: "namespace/link2" },
					],
					restrictNamespace: false,
					baseDir: undefined,
				});
				const result = await replaceLinks({
					body: "alias",
					linkResolverContext: {
						filePath: "namespace/xx/yy/current-file",
						trie,
						candidateMap,
					},
				});
				expect(result).toBe("[[namespace/xx/yy/link|alias]]");
			}
		});
	});
});
