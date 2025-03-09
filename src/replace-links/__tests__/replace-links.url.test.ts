import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("ignore url", () => {
	it("one url", async () => {
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "example" },
					{ path: "http" },
					{ path: "https" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = await replaceLinks({
				body: "- https://example.com",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- https://example.com");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "st" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = await replaceLinks({
				body: "- https://x.com/xxxx/status/12345?t=25S02Tda",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- https://x.com/xxxx/status/12345?t=25S02Tda");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "http" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = await replaceLinks({
				body: "Hello https://claude.ai/chat/xxx",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("Hello https://claude.ai/chat/xxx");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "http" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = await replaceLinks({
				body: "こんにちは https://claude.ai/chat/xxx",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("こんにちは https://claude.ai/chat/xxx");
		}
	});

	it("multiple urls", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "example" },
				{ path: "example1" },
				{ path: "https" },
				{ path: "http" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "- https://example.com https://example1.com",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("- https://example.com https://example1.com");
	});

	it("multiple urls with links", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "example1" },
				{ path: "example" },
				{ path: "link" },
				{ path: "https" },
				{ path: "http" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "- https://example.com https://example1.com link",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe(
			"- https://example.com https://example1.com [[link]]",
		);
	});
});

describe("ignore markdown url", () => {
	it("one url", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "example" },
				{ path: "title" },
				{ path: "https" },
				{ path: "http" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "- [title](https://example.com)",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("- [title](https://example.com)");
	});

	it("multiple urls", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "example1" },
				{ path: "example2" },
				{ path: "title1" },
				{ path: "title2" },
				{ path: "https" },
				{ path: "http" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "- [title1](https://example1.com) [title2](https://example2.com)",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe(
			"- [title1](https://example1.com) [title2](https://example2.com)",
		);
	});

	it("multiple urls with links", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "example1" },
				{ path: "example2" },
				{ path: "title1" },
				{ path: "title2" },
				{ path: "https" },
				{ path: "http" },
				{ path: "link" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "- [title1](https://example1.com) [title2](https://example2.com) link",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe(
			"- [title1](https://example1.com) [title2](https://example2.com) [[link]]",
		);
	});
});
