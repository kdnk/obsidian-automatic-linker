import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks with baseDir", () => {
	describe("basic baseDir stripping", () => {
		it("strips baseDir prefix from simple links", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/xxx" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
				},
			});
			expect(result).toBe("[[xxx]]");
		});

		it("strips baseDir prefix from nested paths", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/foo/bar" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "foo/bar",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("[[foo/bar|bar]]");
		});

		it("preserves links without baseDir when baseDir is undefined", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/xxx" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "pages/xxx",
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: undefined,
					minCharCount: 0,
				},
			});
			expect(result).toBe("[[pages/xxx|xxx]]");
		});

		it("preserves links when baseDir is empty string", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/xxx" }],
				settings: {
					restrictNamespace: false,
					baseDir: "",
				},
			});
			const result = replaceLinks({
				body: "pages/xxx",
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "",
					minCharCount: 0,
				},
			});
			expect(result).toBe("[[pages/xxx|xxx]]");
		});
	});

	describe("baseDir with aliases", () => {
		it("strips baseDir prefix from links with aliases", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/xxx", aliases: ["alias-xxx"] }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "alias-xxx",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
				},
			});
			expect(result).toBe("[[xxx|alias-xxx]]");
		});

		it("handles nested path with aliases", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/foo/bar", aliases: ["alias-bar"] },
				],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "alias-bar",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
				},
			});
			expect(result).toBe("[[foo/bar|alias-bar]]");
		});
	});

	describe("baseDir with markdown tables", () => {
		it("escapes pipes in links within tables when baseDir is set", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/foo/bar" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "| foo/bar |",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("| [[foo/bar\\|bar]] |");
		});

		it("handles complex table with multiple links", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/foo" },
					{ path: "pages/bar/baz" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "| foo | bar/baz |\n|---|---|\n| data | data |",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("| [[foo]] | [[bar/baz\\|baz]] |\n|---|---|\n| data | data |");
		});
	});

	describe("baseDir with self-linking prevention", () => {
		it("prevents self-linking with baseDir enabled", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/xxx" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/xxx",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					preventSelfLinking: true,
				},
			});
			expect(result).toBe("xxx");
		});

		it("prevents self-linking for nested paths", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/foo/bar" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "foo/bar",
				linkResolverContext: {
					filePath: "pages/foo/bar",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					preventSelfLinking: true,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("foo/bar");
		});

		it("allows linking to other files with same base name", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/xxx" },
					{ path: "pages/foo/xxx" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/foo/bar",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					preventSelfLinking: true,
					namespaceResolution: true,
				},
			});
			// When baseDir is set, both "xxx" and "foo/xxx" are normalized and inserted as "xxx" and "foo/xxx"
			// The trie lookup finds "xxx" first, which is the root level file
			expect(result).toBe("[[xxx]]");
		});
	});

	describe("baseDir with namespace resolution", () => {
		it("resolves to closest match in same namespace hierarchy", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/xxx" },
					{ path: "pages/foo/xxx" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/foo/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			// Trie matches "xxx" directly since it's inserted without baseDir prefix
			expect(result).toBe("[[xxx]]");
		});

		it("falls back to root level when no namespace match", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/xxx" },
					{ path: "pages/bar/yyy" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/foo/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("[[xxx]]");
		});

		it("handles deeply nested namespace resolution", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/a/b/c/target" },
					{ path: "pages/a/target" },
					{ path: "pages/target" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "target",
				linkResolverContext: {
					filePath: "pages/a/b/c/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			// Trie matches "target" directly - root level file is matched first
			expect(result).toBe("[[target]]");
		});
	});

	describe("baseDir with case-insensitive matching", () => {
		it("strips baseDir prefix with case-insensitive match", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/XXX" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
					ignoreCase: true,
				},
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					ignoreCase: true,
				},
			});
			// When normalized paths match exactly (case-insensitively), no alias is added
			// The original text "xxx" is used as the link text
			expect(result).toBe("[[xxx]]");
		});

		it("preserves original case in text with nested paths", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/Foo/Bar" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
					ignoreCase: true,
				},
			});
			const result = replaceLinks({
				body: "foo/bar",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					ignoreCase: true,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("[[Foo/Bar|bar]]");
		});
	});

	describe("baseDir edge cases", () => {
		it("handles links that don't start with baseDir", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "pages/xxx" },
					{ path: "other/yyy" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "other/yyy",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
				},
			});
			expect(result).toBe("[[other/yyy|yyy]]");
		});

		it("handles empty body", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/xxx" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
				},
			});
			expect(result).toBe("");
		});

		it("handles multiple words with spaces", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/multi word file" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});
			const result = replaceLinks({
				body: "multi word file",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
					namespaceResolution: true,
				},
			});
			expect(result).toBe("[[multi word file]]");
		});
	});

	describe("baseDir performance considerations", () => {
		it("handles large number of files efficiently", () => {
			const files = Array.from({ length: 100 }, (_, i) => ({
				path: `pages/file-${i}`,
			}));
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files,
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});

			const startTime = performance.now();
			const result = replaceLinks({
				body: "file-50 and file-99",
				linkResolverContext: {
					filePath: "pages/test",
					trie,
					candidateMap,
				},
				settings: {
					baseDir: "pages",
					minCharCount: 0,
				},
			});
			const endTime = performance.now();

			expect(result).toBe("[[file-50]] and [[file-99]]");
			expect(endTime - startTime).toBeLessThan(100); // Should be fast
		});
	});
});
