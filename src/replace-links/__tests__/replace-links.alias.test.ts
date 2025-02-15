import { describe, expect, it } from "vitest";
import { PathAndAliases } from "../../path-and-aliases.types";
import { buildCandidateTrie } from "../../trie";
import { replaceLinks } from "../replace-links";
import { getSortedFiles, setAliases } from "../test-helpers";

describe("replaceLinks - alias handling", () => {
	describe("basic alias", () => {
		it("replaces alias", async () => {
			const files = setAliases(
				getSortedFiles({
					fileNames: ["HelloWorld"],
				}),
				"HelloWorld",
				["HW"],
			);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[HelloWorld|HW]]");
		});

		it("prefers exact match over alias", async () => {
			const files = getSortedFiles({
				fileNames: ["HelloWorld", "HW"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[HW]]");
		});
	});

	describe("namespaced alias", () => {
		it("replaces namespaced alias", async () => {
			const files: PathAndAliases[] = [
				{
					path: "pages/HelloWorld",
					aliases: ["HW"],
					restrictNamespace: false,
				},
			];
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[pages/HelloWorld|HW]]");
		});

		it("replaces multiple occurrences of alias and normal candidate", async () => {
			const files = setAliases(
				getSortedFiles({
					fileNames: ["pages/HelloWorld"],
					restrictNamespace: false,
				}),
				"pages/HelloWorld",
				["Hello"],
			);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "Hello HelloWorld",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[pages/HelloWorld|Hello]] [[HelloWorld]]");
		});
	});

	describe("alias with restrictNamespace", () => {
		it("respects restrictNamespace for alias", async () => {
			const files = setAliases(
				getSortedFiles({
					fileNames: ["pages/set/HelloWorld"],
					restrictNamespace: true,
					baseDir: "pages",
				}),
				"pages/set/HelloWorld",
				["HW"],
			);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "HW",
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
			expect(result).toBe("[[set/HelloWorld|HW]]");
		});

		it("does not replace alias when namespace does not match", async () => {
			const files = setAliases(
				getSortedFiles({
					fileNames: ["pages/set/HelloWorld"],
					restrictNamespace: true,
				}),
				"pages/set/HelloWorld",
				["HW"],
			);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "HW",
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
			expect(result).toBe("HW");
		});
	});

	describe("alias and baseDir", () => {
		it("should replace alias with baseDir", async () => {
			const files = setAliases(
				getSortedFiles({
					fileNames: ["pages/set/HelloWorld"],
					restrictNamespace: false,
					baseDir: "pages",
				}),
				"pages/set/HelloWorld",
				["HW"],
			);
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "pages/set/current",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
				},
			});
			expect(result).toBe("[[set/HelloWorld|HW]]");
		});

		it("should replace alias without baseDir", async () => {
			const files = getSortedFiles({
				fileNames: ["pages/set/HelloWorld"],
				restrictNamespace: false,
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "pages/other/current",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[pages/set/HelloWorld|HW]]");
		});
	});
});
