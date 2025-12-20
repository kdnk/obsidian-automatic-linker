import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - alias handling", () => {
	describe("basic alias", () => {
		it("replaces alias", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[HelloWorld|HW]]");
		});

		it("prefers exact match over alias", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld" }, { path: "HW" }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[HW]]");
		});
	});

	describe("namespaced alias", () => {
		it("replaces namespaced alias", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[pages/HelloWorld|HW]]");
		});

		it("replaces multiple occurrences of alias and normal candidate (with baseDir)", () => {
			const settings = {
				scoped: false,
				baseDir: "pages",
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "HelloWorld", aliases: ["Hello"] }],
				settings,
			});
			const result = replaceLinks({
				body: "Hello HelloWorld",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[HelloWorld|Hello]] [[HelloWorld]]");
		});
	});

	describe("alias with scoped", () => {
		it("respects scoped for alias", () => {
			const settings = {
				scoped: true,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "pages/set/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[set/HelloWorld|HW]]");
		});

		it("replace alias when scoped is false", () => {
			const settings = {
				scoped: false,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "pages/set/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[set/HelloWorld|HW]]");
		});

		it("does not replace alias when namespace does not match", () => {
			const settings = {
				scoped: true,
				baseDir: "pages",
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "pages/other/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("HW");
		});
	});

	describe("alias and baseDir", () => {
		it("should replace alias with baseDir", () => {
			const settings = {
				scoped: false,
				baseDir: "pages",
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/set/HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "pages/set/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[set/HelloWorld|HW]]");
		});
	});

	it("Aliases with ignoreCase: false", () => {
		const settings = {
			scoped: false,
			baseDir: "pages",
			ignoreCase: false,
		};
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "pages/ティーチング", aliases: ["Teaching"] }],
			settings,
		});
		const result = replaceLinks({
			body: "Teaching teaching",
			linkResolverContext: {
				filePath: "pages/test",
				trie,
				candidateMap,
			},
			settings,
		});
		expect(result).toBe("[[ティーチング|Teaching]] teaching");
	});

	it("Aliases with ignoreCase: true", () => {
		const settings = {
			scoped: false,
			baseDir: "pages",
			ignoreCase: true,
		};
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "pages/ティーチング", aliases: ["Teaching"] }],
			settings,
		});
		const result = replaceLinks({
			body: "Teaching teaching",
			linkResolverContext: {
				filePath: "pages/test",
				trie,
				candidateMap,
			},
			settings,
		});
		expect(result).toBe(
			"[[ティーチング|Teaching]] [[ティーチング|teaching]]",
		);
	});
});
