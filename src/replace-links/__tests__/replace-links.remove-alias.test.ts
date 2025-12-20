import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - directory-specific alias removal", () => {
	describe("basic alias removal", () => {
		it("removes alias for links in specified directory", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir/xxx]]");
		});

		it("keeps alias for links not in specified directory", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "other/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[other/xxx|xxx]]");
		});

		it("removes alias for links in subdirectories", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir/subdir/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir/subdir/xxx]]");
		});
	});

	describe("multiple directories", () => {
		it("removes alias for links in any specified directory", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
				removeAliasInDirs: ["dir1", "dir2"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "dir1/xxx" },
					{ path: "dir2/yyy" },
					{ path: "other/zzz" },
				],
				settings,
			});
			const result = replaceLinks({
				body: "xxx yyy zzz",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir1/xxx]] [[dir2/yyy]] [[other/zzz|zzz]]");
		});
	});

	describe("with baseDir", () => {
		it("removes alias based on normalized path with baseDir", () => {
			const settings = {
				scoped: false,
				baseDir: "pages",
				namespaceResolution: true,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/dir/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir/xxx]]");
		});

		it("keeps alias when path starts with baseDir but not with specified dir", () => {
			const settings = {
				scoped: false,
				baseDir: "pages",
				namespaceResolution: true,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/other/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "pages/current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[other/xxx|xxx]]");
		});
	});

	describe("with frontmatter aliases", () => {
		it("removes alias from frontmatter alias in specified directory", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir/HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir/HelloWorld]]");
		});

		it("keeps alias from frontmatter alias not in specified directory", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "other/HelloWorld", aliases: ["HW"] }],
				settings,
			});
			const result = replaceLinks({
				body: "HW",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[other/HelloWorld|HW]]");
		});
	});

	describe("edge cases", () => {
		it("handles empty removeAliasInDirs array", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
				removeAliasInDirs: [],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir/xxx|xxx]]");
		});

		it("handles undefined removeAliasInDirs", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir/xxx|xxx]]");
		});

		it("handles links without alias in specified directory", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "dir/xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[dir/xxx]]");
		});

		it("works with ignoreCase option", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				ignoreCase: true,
				removeAliasInDirs: ["Dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "Dir/Xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("[[Dir/Xxx]]");
		});
	});

	describe("in markdown tables", () => {
		it("removes alias in markdown tables", () => {
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
				removeAliasInDirs: ["dir"],
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir/xxx" }],
				settings,
			});
			const result = replaceLinks({
				body: "| xxx |",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			expect(result).toBe("| [[dir/xxx]] |");
		});
	});

	describe("performance", () => {
		it("handles large number of directories efficiently", () => {
			// Create array of 100 directories
			const manyDirs = Array.from({ length: 100 }, (_, i) => `dir${i}`);
			const settings = {
				scoped: false,
				baseDir: undefined,
				namespaceResolution: true,
				removeAliasInDirs: manyDirs,
			};
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "dir50/xxx" }],
				settings,
			});

			const startTime = performance.now();
			const result = replaceLinks({
				body: "xxx",
				linkResolverContext: {
					filePath: "current",
					trie,
					candidateMap,
				},
				settings,
			});
			const endTime = performance.now();

			expect(result).toBe("[[dir50/xxx]]");
			// Should complete in reasonable time (less than 10ms)
			expect(endTime - startTime).toBeLessThan(10);
		});
	});
});
