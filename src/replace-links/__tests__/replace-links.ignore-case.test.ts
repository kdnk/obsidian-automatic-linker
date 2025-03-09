import { describe, it, expect } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("ignore case", () => {
	it("respects case when ignoreCase is enabled", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "hello" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
				ignoreCase: true,
			},
		});

		const tests = [
			{ input: "hello", expected: "[[hello]]" },
			{ input: "HELLO", expected: "[[HELLO]]" },
			{ input: "Hello", expected: "[[Hello]]" },
		];

		for (const { input, expected } of tests) {
			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
				settings: { ignoreCase: true, minCharCount: 0 },
			});
			expect(result).toBe(expected);
		}
	});

	it("handles spaces with ignoreCase enabled", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "tidy first" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
				ignoreCase: true,
			},
		});

		const tests = [
			{ input: "tidy first", expected: "[[tidy first]]" },
			{ input: "TIDY FIRST", expected: "[[TIDY FIRST]]" },
			{ input: "Tidy First", expected: "[[Tidy First]]" },
		];

		for (const { input, expected } of tests) {
			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
				settings: { ignoreCase: true, minCharCount: 0 },
			});
			expect(result).toBe(expected);
		}
	});

	it("handles namespaces with ignoreCase enabled", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "books/clean code" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
				ignoreCase: true,
			},
		});

		const tests = [
			{
				input: "clean code",
				expected: "[[books/clean code|clean code]]",
			},
			{
				input: "CLEAN CODE",
				expected: "[[books/clean code|CLEAN CODE]]",
			},
			{
				input: "Clean Code",
				expected: "[[books/clean code|Clean Code]]",
			},
		];

		for (const { input, expected } of tests) {
			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
				settings: { ignoreCase: true, minCharCount: 0 },
			});
			expect(result).toBe(expected);
		}
	});
});
