import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks", () => {
	describe("basic", () => {
		it("replaces links", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("[[hello]]");
		});

		it("replaces links with space", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/tidy first" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			console.log(candidateMap);
			const result = replaceLinks({
				body: "tidy first",
				linkResolverContext: {
					filePath: "pages/Books",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("[[tidy first]]");
		});

		it("replaces links with bullet", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "- hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("- [[hello]]");
		});

		it("replaces links with number", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "1. hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("1. [[hello]]");
		});

		it("does not replace links in code blocks", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "```\nhello\n```",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("```\nhello\n```");
		});

		it("does not replace links in inline code", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "`hello`",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("`hello`");
		});

		it("does not replace existing wikilinks", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "[[hello]]",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("[[hello]]");
		});

		it("does not replace existing markdown links", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "[hello](world)",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("[hello](world)");
		});

		it("respects minCharCount", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 6 },
			});
			expect(result).toBe("hello");
		});
	});

	describe("with space", () => {
		it("space without namespace", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "automatic linker" }, { path: "automatic" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = await replaceLinks({
				body: "automatic linker",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[automatic linker]]");
		});
		it("space with namespace", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "obsidian/automatic linker" },
					{ path: "obsidian" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = await replaceLinks({
				body: "obsidian/automatic linker",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe(
				"[[obsidian/automatic linker|automatic linker]]",
			);
		});
	});

	describe("multiple links", () => {
		it("replaces multiple links in the same line", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }, { path: "world" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "hello world",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("[[hello]] [[world]]");
		});

		it("replaces multiple links in different lines", async () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }, { path: "world" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "hello\nworld",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
				settings: { minCharCount: 0 },
			});
			expect(result).toBe("[[hello]]\n[[world]]");
		});
	});
});
