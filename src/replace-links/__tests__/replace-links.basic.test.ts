import { describe, expect, it } from "vitest";
import { buildCandidateTrie } from "../../trie";
import { replaceLinks } from "../replace-links";
import { getSortedFiles } from "../test-helpers";

describe("replaceLinks", () => {
	describe("basic", () => {
		it("replaces links", async () => {
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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

		it("replaces links with bullet", async () => {
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
			const files = getSortedFiles({
				fileNames: ["hello"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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

	describe("multiple links", () => {
		it("replaces multiple links in the same line", async () => {
			const files = getSortedFiles({
				fileNames: ["hello", "world"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
			const files = getSortedFiles({
				fileNames: ["hello", "world"],
			});
			const { candidateMap, trie } = buildCandidateTrie(files);
			const result = await replaceLinks({
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
