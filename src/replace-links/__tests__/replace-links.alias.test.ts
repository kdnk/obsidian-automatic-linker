import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - alias handling", () => {
	describe("basic alias", () => {
		it("replaces alias", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld", aliases: ["HW"] }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[HelloWorld|HW]]");
		});

		it("prefers exact match over alias", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld" }, { path: "HW" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
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
		it("replaces namespaced alias", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/HelloWorld", aliases: ["HW"] }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[pages/HelloWorld|HW]]");
		});

		it("replaces multiple occurrences of alias and normal candidate (with baseDir)", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld", aliases: ["Hello"] }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "Hello HelloWorld",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
				},
			});
			expect(result).toBe("[[HelloWorld|Hello]] [[HelloWorld]]");
		});
	});

	describe("alias with restrictNamespace", () => {
		it("respects restrictNamespace for alias", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings: {
					restrictNamespace: true,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
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

		it("replace alias when restrictNamespace is false", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
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

		it("does not replace alias when namespace does not match", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings: {
					restrictNamespace: true,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
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
		it("should replace alias with baseDir", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
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
	});
});
