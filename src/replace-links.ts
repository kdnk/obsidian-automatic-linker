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
	filePath,
	fileContent,
	trie,
	candidateMap,
	minCharCount = 0,
	getFrontMatterInfo,
	namespaceResolution = true,
}: {
	filePath: string;
	fileContent: string;
	trie: TrieNode;
	candidateMap: Map<string, string>;
	minCharCount?: number;
	getFrontMatterInfo: (fileContent: string) => { contentStart: number };
	// New flag: if false, automatic namespace resolution is skipped.
	namespaceResolution?: boolean;
}): Promise<string> => {
	// If the file content is shorter than the minimum character count, return it unchanged.
	if (fileContent.length <= minCharCount) {
		return fileContent;
	}

	// Helper: determine if a character is a word boundary.
	// (A word boundary is defined as a character that is NOT alphanumeric, underscore, slash, or hyphen.)
	const isWordBoundary = (char: string | undefined): boolean => {
		if (char === undefined) return true;
		return !/[A-Za-z0-9_/-]/.test(char);
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
	// If the body consists solely of a protected link, return it unchanged.
	if (/^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/.test(body)) {
		return frontmatter + body;
	}

	// Function to process a plain text segment (not protected) using Trie-based search.
	const replaceInSegment = (text: string): string => {
		let result = "";
		let i = 0;
		outer: while (i < text.length) {
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
				// For valid candidates, check that the match is isolated by word boundaries.
				if (
					/[A-Za-z0-9_/\- ]+/.test(matched) &&
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
				continue;
			}

			// Fallback: try to match a "word" using a regex.
			// This fallback (which resolves namespaces) is only performed when namespaceResolution is enabled.
			if (namespaceResolution) {
				const fallbackRegex = /^([\p{L}\p{N}_-]+)/u;
				const fallbackMatch = text.slice(i).match(fallbackRegex);
				if (fallbackMatch) {
					const word = fallbackMatch[1];
					// If candidateMap directly contains the word, use it.
					if (candidateMap.has(word)) {
						const canonical = candidateMap.get(word) ?? word;
						result += `[[${canonical}]]`;
						i += word.length;
						continue;
					}
					// Otherwise, search candidateMap for any key that ends with "/" + word.
					for (const [key] of candidateMap.entries()) {
						const slashIndex = key.lastIndexOf("/");
						if (slashIndex !== -1) {
							const shorthand = key.slice(slashIndex + 1);
							if (shorthand === word) {
								result += `[[${key}]]`;
								i += word.length;
								continue outer;
							}
						}
					}
				}
			}

			// If no candidate (or fallback candidate) was found, copy the current character.
			result += text[i];
			i++;
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

	// Helper to sort file names and create file objects.
	const getSortedFiles = (fileNames: string[]) => {
		const sortedFileNames = fileNames
			.slice()
			.sort((a, b) => b.length - a.length);
		return sortedFileNames.map((path) => ({ path, aliases: null }));
	};

	// Dummy function to get front matter info.
	const getFrontMatterInfo = (fileContent: string) => ({ contentStart: 0 });

	describe("basic", () => {
		it("replaces links", async () => {
			const fileNames = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "hello",
					trie,
					candidateMap,
					getFrontMatterInfo,
					minCharCount: 0,
				}),
			).toBe("[[hello]]");
		});

		it("replaces links with bullet", async () => {
			const fileNames = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "- hello",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]]");
		});

		it("replaces links with other texts", async () => {
			{
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
						fileContent: "world hello",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("world [[hello]]");
			}
			{
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
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
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
						fileContent: "- world hello",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("- world [[hello]]");
			}
			{
				const fileNames = getSortedFiles(["hello"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
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
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
						fileContent: "hello world",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("[[hello]] [[world]]");
			}
			{
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
						fileContent: `\nhello\nworld\n`,
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe(`\n[[hello]]\n[[world]]\n`);
			}
			{
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
						fileContent: `\nhello\nworld aaaaa\n`,
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe(`\n[[hello]]\n[[world]] aaaaa\n`);
			}
			{
				const fileNames = getSortedFiles(["hello", "world"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "namespace",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});

		it("single namespace", async () => {
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "namespace/tag1",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]]");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
				"namespace",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "namespace",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFiles([
				"namespace/tag1",
				"namespace/tag2",
				"namespace/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles(["namespace/タグ"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "名前空間",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("名前空間");
		});

		it("single namespace", async () => {
			const fileNames = getSortedFiles([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "名前空間/tag1",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]]");
		});

		it("multiple namespaces", async () => {
			const fileNames = getSortedFiles([
				"名前空間/tag1",
				"名前空間/tag2",
				"名前空間/タグ3",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]");
		});

		it("multiple CJK words", async () => {
			const fileNames = getSortedFiles(["漢字", "ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "- 漢字　ひらがな",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- [[漢字]]　[[ひらがな]]");
		});

		it("multiple same CJK words", async () => {
			const fileNames = getSortedFiles(["ひらがな"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles(["pages/tags"]);
			// Pass baseDirs to buildCandidateTrie so that the short candidate is created.
			const { candidateMap, trie } = buildCandidateTrie(fileNames, [
				"pages",
			]);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "tags",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[tags]]");
		});
	});

	it("multiple links in the same line", async () => {
		const fileNames = getSortedFiles(["pages/tags", "サウナ", "tags"]);
		const { candidateMap, trie } = buildCandidateTrie(fileNames, ["pages"]);
		expect(
			await replaceLinks({
				filePath: "journals/2022-01-01",
				fileContent: "サウナ tags pages/tags",
				trie,
				candidateMap,
				getFrontMatterInfo,
			}),
		).toBe("[[サウナ]] [[tags]] [[pages/tags]]");
	});

	describe("nested links", () => {
		it("", async () => {
			const fileNames = getSortedFiles([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "アジャイルリーダーコンピテンシーマップ",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});

		it("existing links", async () => {
			const fileNames = getSortedFiles([
				"アジャイルリーダーコンピテンシーマップ",
				"リーダー",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles([
				"obsidian/automatic linker",
				"obsidian",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
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
				const fileNames = getSortedFiles(["example", "http", "https"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
						fileContent: "- https://example.com",
						trie,
						candidateMap,
						getFrontMatterInfo,
					}),
				).toBe("- https://example.com");
			}
			{
				const fileNames = getSortedFiles(["st"]);
				const { candidateMap, trie } = buildCandidateTrie(fileNames);
				expect(
					await replaceLinks({
						filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles([
				"example",
				"example1",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "- https://example.com https://example1.com",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com");
		});

		it("multiple urls with links", async () => {
			const fileNames = getSortedFiles([
				"example1",
				"example",
				"link",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles([
				"example",
				"title",
				"https",
				"http",
			]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "- [title](https://example.com)",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("- [title](https://example.com)");
		});

		it("multiple urls", async () => {
			const fileNames = getSortedFiles([
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
					filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles([
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
					filePath: "journals/2022-01-01",
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
			const fileNames = getSortedFiles(["example", "code"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "`code` example",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("`code` [[example]]");
		});

		it("code block", async () => {
			const fileNames = getSortedFiles(["example", "typescript"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "```typescript\nexample\n```",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("```typescript\nexample\n```");
		});
		it("skips replacement when content is too short", async () => {
			const fileNames = getSortedFiles(["hello"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			// When minCharCount is higher than the fileContent length, no replacement should occur.
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "hello",
					trie,
					candidateMap,
					getFrontMatterInfo,
					minCharCount: 10,
				}),
			).toBe("hello");
		});
	});

	describe("aliases", () => {
		it("replaces alias with canonical form using file path and alias", async () => {
			// File information with aliases
			const files = [
				{ path: "pages/HelloWorld", aliases: ["Hello", "HW"] },
			];
			const { candidateMap, trie } = buildCandidateTrie(files, ["pages"]);
			// "Hello" is registered as an alias with canonical value "pages/HelloWorld|Hello"
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "Hello",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[pages/HelloWorld|Hello]]");
			// "HW" is treated the same way
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "HW",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[pages/HelloWorld|HW]]");
			// The normal candidate "HelloWorld" is registered normally
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "HelloWorld",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[HelloWorld]]");
		});

		it("replaces multiple occurrences of alias and normal candidate", async () => {
			// File information with aliases
			const files = [{ path: "pages/HelloWorld", aliases: ["Hello"] }];
			const { candidateMap, trie } = buildCandidateTrie(files, ["pages"]);
			// Verify replacement when alias and normal candidate coexist in the text
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "Hello HelloWorld",
					trie,
					candidateMap,
					getFrontMatterInfo,
				}),
			).toBe("[[pages/HelloWorld|Hello]] [[HelloWorld]]");
		});
	});

	describe("namespace resolution", () => {
		it("replaces candidate with namespace when full candidate is provided", async () => {
			// Test that a candidate including a namespace is correctly replaced when the full candidate string is used in the content.
			const fileNames = getSortedFiles(["namespaces/link"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "namespaces/link",
					trie,
					candidateMap,
					namespaceResolution: true,
					getFrontMatterInfo,
				}),
			).toBe("[[namespaces/link]]");
		});

		it("replaces candidate without namespace correctly", async () => {
			// Test that a candidate without any namespace is correctly replaced.
			const fileNames = getSortedFiles(["link"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "link",
					trie,
					candidateMap,
					namespaceResolution: true,
					getFrontMatterInfo,
				}),
			).toBe("[[link]]");
		});

		it("expands shorthand link to full namespaced candidate", async () => {
			// Test that if the candidate has a namespace, using only the shorthand (without the namespace) in the content expands to the full namespaced candidate.
			const fileNames = getSortedFiles(["namespace/link"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "link",
					trie,
					candidateMap,
					namespaceResolution: true,
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/link]]");
		});

		it("should not replace YYY-MM-DD formatted text when it doesn't match the candidate's shorthand", async () => {
			// Test that if the candidate has a namespace, using a YYY-MM-DD formatted date
			// (with hyphens instead of slashes) does not trigger a replacement.
			const fileNames = getSortedFiles(["2025/02/08"]);
			const { candidateMap, trie } = buildCandidateTrie(fileNames);
			expect(
				await replaceLinks({
					filePath: "journals/2022-01-01",
					fileContent: "2025-02-08",
					trie,
					candidateMap,
					namespaceResolution: true,
					getFrontMatterInfo,
				}),
			).toBe("2025-02-08");
		});
	});
}
