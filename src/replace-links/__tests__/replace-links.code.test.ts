import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("ignore code", () => {
	it("inline code", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "example" }, { path: "code" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "`code` example",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("`code` [[example]]");
	});

	it("code block", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "example" }, { path: "typescript" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "```typescript\nexample\n```",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("```typescript\nexample\n```");
	});
});
