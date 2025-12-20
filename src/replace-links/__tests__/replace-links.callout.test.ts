import { describe, expect, it } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("replaceLinks - callout handling", () => {
	const { candidateMap, trie } = buildCandidateTrieForTest({
		files: [
			{ path: "VPN" },
			{ path: "SSH" },
			{ path: "Networking" },
			{ path: "Security" },
			{ path: "note" },
			{ path: "info" },
			{ path: "warning" },
			{ path: "tip" },
		],
		settings: {
			scoped: false,
			baseDir: undefined,
		},
	});

	describe("basic callout types", () => {
		it("should not link text inside [!note] callout", () => {
			const input = `> [!note]
> This is about VPN and SSH`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should not link text inside [!info] callout", () => {
			const input = `> [!info]
> VPN is important for Security`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should not link text inside [!warning] callout", () => {
			const input = `> [!warning]
> Check your SSH configuration`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should not link text inside [!tip] callout", () => {
			const input = `> [!tip]
> Use VPN for better Networking`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});
	});

	describe("collapsible callouts", () => {
		it("should not link text inside collapsible callout with minus", () => {
			const input = `> [!note]-
> VPN and SSH details here`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should not link text inside collapsible callout with plus", () => {
			const input = `> [!info]+
> Networking with VPN`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});
	});

	describe("callouts with custom titles", () => {
		it("should not link text in callout with custom title", () => {
			const input = `> [!note] Custom Title Here
> This is about VPN`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should not link text in custom title if it matches a file", () => {
			const input = `> [!note] VPN Configuration
> Details about SSH`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});
	});

	describe("multi-line callouts", () => {
		it("should not link text in multi-line callout", () => {
			const input = `> [!note]
> First line about VPN
> Second line about SSH
> Third line about Networking`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should handle callout with empty lines", () => {
			const input = `> [!info]
> First line with VPN
>
> Third line with SSH`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});
	});

	describe("callouts with markdown formatting", () => {
		it("should not link text inside callout with bold text", () => {
			const input = `> [!note]
> **VPN** is important for **Security**`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should preserve existing links inside callout", () => {
			const input = `> [!note]
> Check [[VPN]] and SSH for details`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});
	});

	describe("text outside callouts", () => {
		it("should link text before callout", () => {
			const input = `VPN is important

> [!note]
> Details about VPN`;

			const expected = `[[VPN]] is important

> [!note]
> Details about VPN`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});

		it("should link text after callout", () => {
			const input = `> [!note]
> Details about VPN

SSH is also important`;

			const expected = `> [!note]
> Details about VPN

[[SSH]] is also important`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});

		it("should link text between two callouts", () => {
			const input = `> [!note]
> First callout with VPN

Networking is important here

> [!info]
> Second callout with SSH`;

			const expected = `> [!note]
> First callout with VPN

[[Networking]] is important here

> [!info]
> Second callout with SSH`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});
	});

	describe("regular blockquotes (not callouts)", () => {
		it("should link text in regular blockquote without callout syntax", () => {
			const input = `> This is a regular quote about VPN`;

			const expected = `> This is a regular quote about [[VPN]]`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});

		it("should link text in multi-line regular blockquote", () => {
			const input = `> This is about VPN
> and SSH too`;

			const expected = `> This is about [[VPN]]
> and [[SSH]] too`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});
	});

	describe("callout type names that are also file names", () => {
		it("should not link 'note' in [!note] callout even if note.md exists", () => {
			const input = `> [!note]
> This is a note about VPN`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			// Should not link 'note' even though note.md exists
			expect(result).toBe(input);
			expect(result).not.toContain("[[note]]");
		});

		it("should not link 'info' in [!info] callout even if info.md exists", () => {
			const input = `> [!info]
> This is info about SSH`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
			expect(result).not.toContain("[[info]]");
		});

		it("should not link callout type in custom title", () => {
			const input = `> [!warning] Read this warning
> Details here`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
			expect(result).not.toContain("[[warning]]");
		});

		it("should link 'note' when used outside callout", () => {
			const input = `Please read this note about VPN`;

			const expected = `Please read this [[note]] about [[VPN]]`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});

		it("should link 'info' when used outside callout", () => {
			const input = `Check the info page for details`;

			const expected = `Check the [[info]] page for details`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});
	});

	describe("edge cases", () => {
		it("should handle callout at the start of document", () => {
			const input = `> [!note]
> VPN details`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should handle callout at the end of document", () => {
			const input = `Some text here

> [!note]
> VPN details`;

			const expected = `Some text here

> [!note]
> VPN details`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(expected);
		});

		it("should handle callout with different case in type", () => {
			const input = `> [!NOTE]
> VPN configuration`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});

		it("should handle callout with hyphens in type", () => {
			const input = `> [!my-custom-type]
> SSH details`;

			const result = replaceLinks({
				body: input,
				linkResolverContext: {
					filePath: "test",
					trie,
					candidateMap,
				},
			});

			expect(result).toBe(input);
		});
	});
});
