import { describe, expect, it } from "vitest";
import { PathAndAliases } from "../../path-and-aliases.types";
import { buildCandidateTrie, buildTrie } from "../../trie";
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
			const files: PathAndAliases[] = [
				{
					path: "pages/HelloWorld",
					aliases: ["Hello"],
					restrictNamespace: false,
				},
			];
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

	describe("automatic-linker-restrict-namespace and alias", () => {
		it("should respect restrictNamespace for alias with baseDir", async () => {
			const files = getSortedFiles({
				fileNames: ["pages/set/HelloWorld", "pages/other/current"],
				restrictNamespace: false,
			});
			const { candidateMap } = buildCandidateTrie(files);
			candidateMap.set("HW", {
				canonical: "set/HelloWorld",
				restrictNamespace: true,
				namespace: "set",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

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

		it("should not replace alias when namespace does not match with baseDir", async () => {
			const files = getSortedFiles({
				fileNames: ["pages/set/HelloWorld", "pages/other/current"],
				restrictNamespace: false,
			});
			const { candidateMap } = buildCandidateTrie(files);
			candidateMap.set("HW", {
				canonical: "set/HelloWorld",
				restrictNamespace: true,
				namespace: "set",
			});
			const trie = buildTrie(Array.from(candidateMap.keys()));

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
});
