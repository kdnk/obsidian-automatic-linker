import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks with prevent-linking", () => {
	it("does not link to files with preventLinking: true", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "private-note", preventLinking: true },
				{ path: "public-note", preventLinking: false },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});

		const result = replaceLinks({
			body: "private-note and public-note",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0 },
		});

		// private-note should NOT be linked, but public-note should be linked
		expect(result).toBe("private-note and [[public-note]]");
	});

	it("does not link to files with preventLinking: true even with aliases", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{
					path: "private-note",
					aliases: ["secret"],
					preventLinking: true,
				},
				{
					path: "public-note",
					aliases: ["open"],
					preventLinking: false,
				},
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});

		const result = replaceLinks({
			body: "secret and open",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0 },
		});

		// "secret" should NOT be linked, but "open" should be linked
		expect(result).toBe("secret and [[public-note|open]]");
	});

	it("does not link to files with preventLinking: true in namespace context", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "pages/private-doc", preventLinking: true },
				{ path: "pages/public-doc", preventLinking: false },
			],
			settings: {
				restrictNamespace: false,
				baseDir: "pages",
			},
		});

		const result = replaceLinks({
			body: "private-doc and public-doc",
			linkResolverContext: {
				filePath: "pages/index",
				trie,
				candidateMap,
			},
			settings: {
				baseDir: "pages",
				minCharCount: 0,
				namespaceResolution: true,
			},
		});

		// private-doc should NOT be linked, but public-doc should be linked
		expect(result).toBe("private-doc and [[public-doc]]");
	});

	it("handles preventLinking with mixed content", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "private", preventLinking: true },
				{ path: "public", preventLinking: false },
				{ path: "another-public" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});

		const result = replaceLinks({
			body: "private public another-public",
			linkResolverContext: {
				filePath: "test",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0 },
		});

		expect(result).toBe("private [[public]] [[another-public]]");
	});

	it("does not link to preventLinking files in bullet points", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "private-note", preventLinking: true },
				{ path: "public-note", preventLinking: false },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});

		const result = replaceLinks({
			body: "- private-note\n- public-note",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0 },
		});

		expect(result).toBe("- private-note\n- [[public-note]]");
	});
});
