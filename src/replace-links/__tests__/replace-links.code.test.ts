import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("ignore code", () => {
	it("inline code", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "example" }, { path: "code" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "`code` example",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("`code` [[example]]");
	});

	it("code block", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "example" }, { path: "typescript" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "```typescript\nexample\n```",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("```typescript\nexample\n```");
	});

	it("skips replacement when content is too short", async () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "hello" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = await replaceLinks({
			body: "hello",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 10 },
		});
		expect(result).toBe("hello");
	});
});
