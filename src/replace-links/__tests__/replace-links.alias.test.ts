import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - alias handling", () => {
	describe("basic alias", () => {
		it("replaces alias", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld", aliases: ["HW"] }],
				restrictNamespace: false,
				baseDir: undefined,
			});
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
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld" }, { path: "HW" }],
				restrictNamespace: false,
				baseDir: undefined,
			});
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
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/HelloWorld", aliases: ["HW"] }],
				restrictNamespace: false,
				baseDir: undefined,
			});
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

		it("replaces multiple occurrences of alias and normal candidate (with baseDir)", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld", aliases: ["Hello"] }],
				restrictNamespace: false,
				baseDir: "pages",
			});
			const result = await replaceLinks({
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
		it("respects restrictNamespace for alias", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				restrictNamespace: true,
				baseDir: "pages",
			});
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

		it("replace alias when restrictNamespace is false", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				restrictNamespace: false,
				baseDir: "pages",
			});
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
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				restrictNamespace: true,
				baseDir: "pages",
			});
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

		it("should handle non-aliased namespaced path", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld" }],
				restrictNamespace: false,
				baseDir: "pages",
			});
			const result = await replaceLinks({
				body: "HelloWorld",
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
			expect(result).toBe("[[set/HelloWorld|HelloWorld]]");
		});

		it("should handle non-namespaced path without alias", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld" }],
				restrictNamespace: false,
				baseDir: undefined,
			});
			const result = await replaceLinks({
				body: "HelloWorld",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[HelloWorld]]");
		});
	});

	describe("alias and baseDir", () => {
		it("should replace alias with baseDir", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				restrictNamespace: false,
				baseDir: "pages",
			});
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
	});
});
