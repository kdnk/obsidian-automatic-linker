import { buildCandidateTrie, TrieNode } from "./trie";

/**
 * Replaces plain text with wikilinks using the provided Trie and candidateMap.
 *
 * @param fileContent - The content of the file to process.
 * @param trie - The pre-built Trie for candidate lookup.
 * @param candidateMap - Mapping from candidate string to its canonical replacement.
 * @param getFrontMatterInfo - Function to get the front matter info.
 * @param minCharCount - Minimum character count required to perform replacement.
 * @returns The file content with replaced links.
 */
export const replaceLinks = async ({
	fileContent,
	trie,
	candidateMap,
	minCharCount = 0,
	getFrontMatterInfo,
}: {
	fileContent: string;
	trie: TrieNode;
	candidateMap: Map<string, string>;
	minCharCount?: number;
	getFrontMatterInfo: (fileContent: string) => { contentStart: number };
}): Promise<string> => {
	// If the file content is shorter than the minimum character count,
	// return the content unchanged.
	if (fileContent.length <= minCharCount) {
		return fileContent;
	}

	// Helper: determine if a character is a word boundary.
	const isWordBoundary = (char: string | undefined): boolean => {
		if (char === undefined) return true;
		return !/[A-Za-z0-9_\/\-]/.test(char);
	};

	// Regex for protected segments:
	//  - Code blocks: ```...```
	//  - Inline code: `...`
	//  - Wiki links: [[...]]
	//  - Markdown links: [...](...)
	const protectedRegex =
		/(```[\s\S]*?```|`[^`]*`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;

	// Separate the front matter from the body.
	const { contentStart } = getFrontMatterInfo(fileContent);
	const frontmatter = fileContent.slice(0, contentStart);
	const body = fileContent.slice(contentStart);
	// If the body consists solely of a protected link, return as is.
	if (/^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/.test(body)) {
		return frontmatter + body;
	}

	// Function to process a plain text segment (not protected) using Trie-based search.
	const replaceInSegment = (text: string): string => {
		let result = "";
		let i = 0;
		while (i < text.length) {
			// If a URL is found, copy it unchanged.
			const urlMatch = text.slice(i).match(/^(https?:\/\/[^\s]+)/);
			if (urlMatch) {
				result += urlMatch[0];
				i += urlMatch[0].length;
				continue;
			}

			// Traverse the Trie from the current index.
			let node = trie;
			let lastCandidate: { candidate: string; length: number } | null =
				null;
			let j = i;
			while (j < text.length) {
				const ch = text[j];
				if (!node.children.has(ch)) break;
				node = node.children.get(ch)!;
				if (node.candidate) {
					lastCandidate = {
						candidate: node.candidate,
						length: j - i + 1,
					};
				}
				j++;
			}
			if (lastCandidate) {
				const matched = text.substring(i, i + lastCandidate.length);
				// For valid candidates, check word boundaries.
				if (
					/[A-Za-z0-9_\/\- ]+/.test(matched) &&
					candidateMap.has(matched)
				) {
					const left = i > 0 ? text[i - 1] : undefined;
					const right =
						i + lastCandidate.length < text.length
							? text[i + lastCandidate.length]
							: undefined;
					if (!isWordBoundary(left) || !isWordBoundary(right)) {
						result += text[i];
						i++;
						continue;
					}
				}
				// Replace candidate with its canonical form wrapped in double brackets.
				const canonical = candidateMap.get(matched) ?? matched;
				result += `[[${canonical}]]`;
				i += lastCandidate.length;
			} else {
				result += text[i];
				i++;
			}
		}
		return result;
	};

	let resultBody = "";
	let lastIndex = 0;
	// Process the body while preserving protected segments.
	for (const m of body.matchAll(protectedRegex)) {
		const mIndex = m.index ?? 0;
		// Process the text before the protected segment.
		const segment = body.slice(lastIndex, mIndex);
		resultBody += replaceInSegment(segment);
		// Append the protected segment unchanged.
		resultBody += m[0];
		lastIndex = mIndex + m[0].length;
	}
	// Process any remaining text after the last protected segment.
	resultBody += replaceInSegment(body.slice(lastIndex));

	return frontmatter + resultBody;
};

if (import.meta.vitest) {
	const { it, expect, describe } = import.meta.vitest;

	const getSortedFileNames = (fileNames: string[]) => {
		return fileNames.slice().sort((a, b) => b.length - a.length);
	};

	const getFrontMatterInfo = (fileContent: string) => ({ contentStart: 0 });

	describe("basic", () => {
		it("replaces links", async () => {
			const fileNames = getSortedFileNames(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "hello",
					trie,
					candidateMap,
					getFrontMatterInfo,
					minCharCount: 0,
				}),
			).toBe("[[hello]]");
		});

		it("replaces links with bullet", async () => {
			const fileNames = getSortedFileNames(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "- hello",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]]");
		});

		it("replaces links with other texts", async () => {
			{
				const fileNames = getSortedFileNames(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: "world hello",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("world [[hello]]");
			}
			{
				const fileNames = getSortedFileNames(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: "hello world",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("[[hello]] world");
			}
		});

		it("replaces links with other texts and bullet", async () => {
			{
				const fileNames = getSortedFileNames(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: "- world hello",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("- world [[hello]]");
			}
			{
				const fileNames = getSortedFileNames(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: "- hello world",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("- [[hello]] world");
			}
		});

		it("replaces multiple links", async () => {
			{
				const fileNames = getSortedFileNames(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: "hello world",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("[[hello]] [[world]]");
			}
			{
				const fileNames = getSortedFileNames(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: `\nhello\nworld\n`,
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe(`\n[[hello]]\n[[world]]\n`);
			}
			{
				const fileNames = getSortedFileNames(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: `\nhello\nworld aaaaa\n`,
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe(`\n[[hello]]\n[[world]] aaaaa\n`);
			}
			{
				const fileNames = getSortedFileNames(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: `\n aaaaa hello\nworld bbbbb\n`,
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe(`\n aaaaa [[hello]]\n[[world]] bbbbb\n`);
			}
		});
	});

	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFileNames([
				"namespace/tag1",
				"namespace/tag2",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "namespace",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});

		it("single namespace", async () => {
			const fileNames = getSortedFileNames([
				"namespace/tag1",
				"namespace/tag2",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]]");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFileNames([
				"namespace/tag1",
				"namespace/tag2",
				"namespace",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1 namespace/tag2",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]]");
		});
	});

	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFileNames(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "namespace",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFileNames([
				"namespace/tag1",
				"namespace/tag2",
				"namespace/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent:
						"namespace/tag1 namespace/tag2 namespace/タグ3",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]] [[namespace/タグ3]]");
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFileNames(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "名前空間",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("名前空間");
		});

		it("single namespace", async () => {
			const fileNames = getSortedFileNames([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]]");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFileNames([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]");
		});

		it("multiple CJK words", async () => {
			const fileNames = getSortedFileNames(["漢字", "ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "- 漢字　ひらがな",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- [[漢字]]　[[ひらがな]]");
		});

		it("multiple same CJK words", async () => {
			const fileNames = getSortedFileNames(["ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "- ひらがなとひらがな",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- [[ひらがな]]と[[ひらがな]]");
		});
	});

	describe("base character (pages)", () => {
		it("unmatched namespace", async () => {
			const fileNames = getSortedFileNames(["pages/tags"]);
			// Pass baseDirs to buildCandidateTrie so that the short candidate is created.
			const { candidateMap, trie } = buildCandidateTrie(fileNames, [
				"pages",
			]);
			expect(
				await replaceLinks({
					fileContent: "tags",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[tags]]");
		});
	});

	it("multiple links in the same line", async () => {
		const fileNames = getSortedFileNames(["pages/tags", "サウナ", "tags"]);
		const { candidateMap, trie } = buildCandidateTrie(fileNames, ["pages"]);
		expect(
			await replaceLinks({
				fileContent: "サウナ tags pages/tags",
				trie,
				candidateMap,
				getFrontMatterInfo,
			}),
		).toBe("[[サウナ]] [[tags]] [[pages/tags]]");
	});

	describe("nested links", () => {
		it("", async () => {
			const fileNames = getSortedFileNames([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "アジャイルリーダーコンピテンシーマップ",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});

		it("exsiting links", async () => {
			const fileNames = getSortedFileNames([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "[[アジャイルリーダーコンピテンシーマップ]]",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
	});

	describe("with space", () => {
		it("", async () => {
			const fileNames = getSortedFileNames([
				"obsidian/automatic linker",
				"obsidian",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "obsidian/automatic linker",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[obsidian/automatic linker]]");
		});
	});

	describe("ignore url", () => {
		it("one url", async () => {
			{
				const fileNames = getSortedFileNames([
					"example",
					"http",
					"https",
				]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent: "- https://example.com",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("- https://example.com");
			}
			{
				const fileNames = getSortedFileNames(["st"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						fileContent:
							"- https://x.com/xxxx/status/12345?t=25S02Tda",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("- https://x.com/xxxx/status/12345?t=25S02Tda");
			}
		});

		it("multiple urls", async () => {
			const fileNames = getSortedFileNames([
				"example",
				"example1",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "- https://example.com https://example1.com",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com");
		});

		it("multiple urls with links", async () => {
			const fileNames = getSortedFileNames([
				"example1",
				"example",
				"link",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent:
						"- https://example.com https://example1.com link",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com [[link]]");
		});
	});

	describe("ignore markdown url", () => {
		it("one url", async () => {
			const fileNames = getSortedFileNames([
				"example",
				"title",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "- [title](https://example.com)",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- [title](https://example.com)");
		});

		it("multiple urls", async () => {
			const fileNames = getSortedFileNames([
				"example1",
				"example2",
				"title1",
				"title2",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent:
						"- [title1](https://example1.com) [title2](https://example2.com)",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com)",
			);
		});

		it("multiple urls with links", async () => {
			const fileNames = getSortedFileNames([
				"example1",
				"example2",
				"title1",
				"title2",
				"https",
				"http",
				"link",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent:
						"- [title1](https://example1.com) [title2](https://example2.com) link",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com) [[link]]",
			);
		});
	});

	describe("ignore code", () => {
		it("inline code", async () => {
			const fileNames = getSortedFileNames(["example", "code"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "`code` example",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("`code` [[example]]");
		});

		it("code block", async () => {
			const fileNames = getSortedFileNames(["example", "typescript"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					fileContent: "```typescript\nexample\n```",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("```typescript\nexample\n```");
		});
		it("skips replacement when content is too short", async () => {
			const fileNames = getSortedFileNames(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			// When minCharCount is higher than the fileContent length, no replacement should occur.
			expect(
				await replaceLinks({
					fileContent: "hello",
					trie,
					candidateMap,
					getFrontMatterInfo,
					minCharCount: 10,
				}),
			).toBe("hello");
		});
	});
}
