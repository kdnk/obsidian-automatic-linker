import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - prevent self-linking", () => {
	describe("when preventSelfLinking is true", () => {
		it("should not link text to its own file", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "VPN" }, { path: "Welcome" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			// In VPN.md file, "VPN" should not be linked
			const result = replaceLinks({
				body: "This is a note about VPN",
				linkResolverContext: {
					filePath: "VPN",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: true,
				},
			});
			expect(result).toBe("This is a note about VPN");
		});

		it("should link text in other files", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "VPN" }, { path: "Welcome" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			// In Welcome.md file, "VPN" should be linked
			const result = replaceLinks({
				body: "Here is my VPN Note",
				linkResolverContext: {
					filePath: "Welcome",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: true,
				},
			});
			expect(result).toBe("Here is my [[VPN]] Note");
		});

		it("should handle files with namespaces", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "docs/VPN" }, { path: "docs/Welcome" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			// In docs/VPN.md file, "VPN" should not be linked
			const result = replaceLinks({
				body: "This is about VPN",
				linkResolverContext: {
					filePath: "docs/VPN",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: true,
				},
			});
			expect(result).toBe("This is about VPN");
		});

		it("should handle files with baseDir", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "pages/VPN" }, { path: "pages/Welcome" }],
				settings: {
					restrictNamespace: false,
					baseDir: "pages",
				},
			});

			// In pages/VPN.md file, "VPN" should not be linked
			const result = replaceLinks({
				body: "This is about VPN",
				linkResolverContext: {
					filePath: "pages/VPN",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe("This is about VPN");
		});

		it("should handle multiple occurrences in the same file", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "VPN" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			const result = replaceLinks({
				body: "VPN is important. Always use VPN when connecting.",
				linkResolverContext: {
					filePath: "VPN",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: true,
				},
			});
			expect(result).toBe("VPN is important. Always use VPN when connecting.");
		});
	});

	describe("when preventSelfLinking is false", () => {
		it("should link text to its own file (default behavior)", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "VPN" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			const result = replaceLinks({
				body: "This is about VPN",
				linkResolverContext: {
					filePath: "VPN",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: false,
				},
			});
			expect(result).toBe("This is about [[VPN]]");
		});

		it("should link text to its own file when setting is undefined", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "VPN" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			const result = replaceLinks({
				body: "This is about VPN",
				linkResolverContext: {
					filePath: "VPN",
					trie,
					candidateMap,
				},
				settings: {},
			});
			expect(result).toBe("This is about [[VPN]]");
		});
	});

	describe("edge cases", () => {
		it("should work with case-insensitive matching", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "VPN" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
					ignoreCase: true,
				},
			});

			const result = replaceLinks({
				body: "This is about vpn",
				linkResolverContext: {
					filePath: "VPN",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: true,
					ignoreCase: true,
				},
			});
			expect(result).toBe("This is about vpn");
		});

		it("should only prevent self-links, not other links", () => {
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "VPN" }, { path: "SSH" }, { path: "Networking" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			const result = replaceLinks({
				body: "VPN and SSH are both important for Networking",
				linkResolverContext: {
					filePath: "VPN",
					trie,
					candidateMap,
				},
				settings: {
					preventSelfLinking: true,
				},
			});
			expect(result).toBe("VPN and [[SSH]] are both important for [[Networking]]");
		});
	});
});
