import { describe, expect, it } from "vitest";
import { buildCandidateTrie } from "../../trie";
import { replaceLinks } from "../replace-links";
import { getSortedFiles, setAliases } from "./test-helpers";

describe("replaceLinks - namespace resolution", () => {
	describe("basic namespace resolution", () => {
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

	describe("namespace resolution nearest file path", () => {
		it("closest siblings namespace should be used", async () => {
			{
				const files = getSortedFiles({
					fileNames: [
						"namespace/a/b/c/d/link",
						"namespace/a/b/c/d/e/f/link",
						"namespace/a/b/c/link",
					],
				});
				const { candidateMap, trie } = buildCandidateTrie(files);

				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/a/b/c/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/a/b/c/link]]");
			}
			{
				const files = getSortedFiles({
					fileNames: [
						"namespace/a/b/c/link",
						"namespace/a/b/c/d/link",
						"namespace/a/b/c/d/e/f/link",
					],
				});
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/a/b/c/d/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/a/b/c/d/link]]");
			}
			{
				const files = getSortedFiles({
					fileNames: [
						"namespace/xxx/link",
						"another-namespace/link",
						"another-namespace/a/b/c/link",
						"another-namespace/a/b/c/d/link",
						"another-namespace/a/b/c/d/e/f/link",
					],
				});
				const { candidateMap, trie } = buildCandidateTrie(files);
				const result = await replaceLinks({
					body: "link",
					linkResolverContext: {
						filePath: "namespace/current-file",
						trie,
						candidateMap,
					},
					settings: { namespaceResolution: true },
				});
				expect(result).toBe("[[namespace/xxx/link]]");
			}
		});

		it("closest children namespace should be used", async () => {
			const files = getSortedFiles({
				fileNames: [
					"namespace1/subnamespace/link",
					"namespace2/super-super-long-long-directory/link",
					"namespace3/link",
					"namespace/a/b/c/link",
					"namespace/a/b/c/d/link",
					"namespace/a/b/c/d/e/f/link",
				],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/a/b/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[namespace/a/b/c/link]]");
		});

		it("find closest path if the current path is in base dir and the candidate is not", async () => {
			const files = getSortedFiles({
				fileNames: [
					"namespace1/aaaaaaaaaaaaaaaaaaaaaaaaa/link",
					"namespace1/link2",
					"namespace2/link2",
					"namespace3/aaaaaa/bbbbbb/link2",
					"base/looooooooooooooooooooooooooooooooooooooong/link",
					"base/looooooooooooooooooooooooooooooooooooooong/super-super-long-long-long-long-closest-sub-dir/link",
					"base/a/b/c/link",
					"base/a/b/c/d/link",
					"base/a/b/c/d/e/f/link",
				],
				baseDir: "base",
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
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
				"[[looooooooooooooooooooooooooooooooooooooong/link]] [[namespace1/link2]]",
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
			const files = getSortedFiles({
				fileNames: [
					"namespace/xx/yy/link",
					"namespace/xx/link",
					"namespace/link2",
				],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/xx/current-file",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[namespace/xx/link]]");
		});

		it("should resolve aliases", async () => {
			const files = setAliases(
				getSortedFiles({
					fileNames: [
						"namespace/xx/yy/link",
						"namespace/xx/link",
						"namespace/link2",
					],
				}),
				"namespace/xx/yy/link",
				["alias"],
			);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "alias",
				linkResolverContext: {
					filePath: "namespace/xx/current-file",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[namespace/xx/link|alias]]");
		});
	});
});
