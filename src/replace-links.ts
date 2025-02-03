export const replaceLinks = async ({
	fileContent,
	allFileNames,
	getFrontMatterInfo,
	// Directories to treat specially. Defaults to ["pages"].
	baseDirs = ["pages"],
}: {
	fileContent: string;
	allFileNames: string[];
	getFrontMatterInfo: (fileContent: string) => { contentStart: number };
	baseDirs?: string[];
}): Promise<string> => {
	// Preprocess candidate file names.
	// For names that start with one of the baseDirs, create a candidate object
	// with both the full form (e.g. "pages/tags") and a short form (e.g. "tags").
	type Candidate = { full: string; short: string | null };
	const candidates: Candidate[] = allFileNames.map((name) => {
		const candidate: Candidate = { full: name, short: null };
		for (const dir of baseDirs) {
			const prefix = `${dir}/`;
			if (name.startsWith(prefix)) {
				candidate.short = name.slice(prefix.length);
				break;
			}
		}
		return candidate;
	});

	// Build a mapping from candidate string to its canonical replacement.
	// The full form always takes precedence.
	const candidateMap = new Map<string, string>();
	for (const { full, short } of candidates) {
		candidateMap.set(full, full);
		if (short && !candidateMap.has(short)) {
			candidateMap.set(short, short);
		}
	}

	// Build a trie from the keys of candidateMap.
	interface TrieNode {
		children: Map<string, TrieNode>;
		// If this node marks the end of a candidate, store the candidate string.
		candidate?: string;
	}
	const buildTrie = (words: string[]): TrieNode => {
		const root: TrieNode = { children: new Map() };
		for (const word of words) {
			let node = root;
			for (const ch of word) {
				if (!node.children.has(ch)) {
					node.children.set(ch, { children: new Map() });
				}
				node = node.children.get(ch)!;
			}
			node.candidate = word;
		}
		return root;
	};
	const trie = buildTrie(Array.from(candidateMap.keys()));

	// Helper: check if a character is a word boundary.
	const isWordBoundary = (char: string | undefined): boolean => {
		if (char === undefined) return true;
		return !/[A-Za-z0-9_\/\-]/.test(char);
	};

	// Protected segments: markdown links and wiki links should not be processed.
	// This regex matches [title](url) and [[wiki link]].
	const protectedRegex = /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/gu;

	// If the entire body is already a protected link, skip processing.
	const { contentStart } = getFrontMatterInfo(fileContent);
	const frontmatter = fileContent.slice(0, contentStart);
	const body = fileContent.slice(contentStart);
	if (/^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/.test(body)) {
		return frontmatter + body;
	}

	// Function to process a plain text segment (which is not already protected)
	// using trie‑based search.
	const replaceInSegment = (text: string): string => {
		let result = "";
		let i = 0;
		while (i < text.length) {
			// Check if a URL starts at the current index.
			const urlMatch = text.slice(i).match(/^(https?:\/\/[^\s]+)/);
			if (urlMatch) {
				// If a URL is found, copy it unchanged.
				result += urlMatch[0];
				i += urlMatch[0].length;
				continue;
			}

			// Traverse the trie from the current index.
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
				// For safe candidates, check word boundaries.
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

	// Process the body while preserving protected segments.
	let resultBody = "";
	let lastIndex = 0;
	for (const m of body.matchAll(protectedRegex)) {
		const mIndex = m.index ?? 0;
		// Process text before the protected segment.
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
			expect(
				await replaceLinks({
					fileContent: "hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("[[hello]]");
		});
		it("replaces links with bullet", async () => {
			expect(
				await replaceLinks({
					fileContent: "- hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]]");
		});
		it("replaces links with other texts", async () => {
			expect(
				await replaceLinks({
					fileContent: "world hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("world [[hello]]");
			expect(
				await replaceLinks({
					fileContent: "hello world",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("[[hello]] world");
		});
		it("replaces links with other texts and bullet", async () => {
			expect(
				await replaceLinks({
					fileContent: "- world hello",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("- world [[hello]]");
			expect(
				await replaceLinks({
					fileContent: "- hello world",
					allFileNames: getSortedFileNames(["hello"]),
					getFrontMatterInfo,
				}),
			).toBe("- [[hello]] world");
		});

		it("replaces multiple links", async () => {
			expect(
				await replaceLinks({
					fileContent: "hello world",
					allFileNames: getSortedFileNames(["hello", "world"]),
					getFrontMatterInfo,
				}),
			).toBe("[[hello]] [[world]]");
			expect(
				await replaceLinks({
					fileContent: `\nhello\nworld\n`,
					allFileNames: getSortedFileNames(["hello", "world"]),
					getFrontMatterInfo,
				}),
			).toBe(`\n[[hello]]\n[[world]]\n`);
			expect(
				await replaceLinks({
					fileContent: `\nhello\nworld aaaaa\n`,
					allFileNames: getSortedFileNames(["hello", "world"]),
					getFrontMatterInfo,
				}),
			).toBe(`\n[[hello]]\n[[world]] aaaaa\n`);
			expect(
				await replaceLinks({
					fileContent: `\n aaaaa hello\nworld bbbbb\n`,
					allFileNames: getSortedFileNames(["hello", "world"]),
					getFrontMatterInfo,
				}),
			).toBe(`\n aaaaa [[hello]]\n[[world]] bbbbb\n`);
		});
	});

	describe("complex fileNames", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace",
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
					]),
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1",
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace/tag1 namespace/tag2",
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
						"namespace",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]]");
		});
	});

	describe("containing CJK", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "namespace",
					allFileNames: getSortedFileNames(["namespace/タグ"]),
					getFrontMatterInfo,
				}),
			).toBe("namespace");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"namespace/tag1 namespace/tag2 namespace/タグ3",
					allFileNames: getSortedFileNames([
						"namespace/tag1",
						"namespace/tag2",
						"namespace/タグ3",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[namespace/tag1]] [[namespace/tag2]] [[namespace/タグ3]]");
		});
	});

	describe("starting CJK", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間",
					allFileNames: getSortedFileNames(["namespace/タグ"]),
					getFrontMatterInfo,
				}),
			).toBe("名前空間");
		});
		it("single namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1",
					allFileNames: getSortedFileNames([
						"名前空間/tag1",
						"名前空間/tag2",
						"名前空間/タグ3",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]]");
		});
		it("multiple namespaces", async () => {
			expect(
				await replaceLinks({
					fileContent: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
					allFileNames: getSortedFileNames([
						"名前空間/tag1",
						"名前空間/tag2",
						"名前空間/タグ3",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[名前空間/tag1]] [[名前空間/tag2]] [[名前空間/タグ3]]");
		});
		it("multiple CJK words", async () => {
			expect(
				await replaceLinks({
					fileContent: "- 漢字　ひらがな",
					allFileNames: getSortedFileNames(["漢字", "ひらがな"]),
					getFrontMatterInfo,
				}),
			).toBe("- [[漢字]]　[[ひらがな]]");
		});
		it("multiple same CJK words", async () => {
			expect(
				await replaceLinks({
					fileContent: "- ひらがなとひらがな",
					allFileNames: getSortedFileNames(["ひらがな"]),
					getFrontMatterInfo,
				}),
			).toBe("- [[ひらがな]]と[[ひらがな]]");
		});
	});

	describe("special character (pages)", () => {
		it("unmatched namespace", async () => {
			expect(
				await replaceLinks({
					fileContent: "tags",
					allFileNames: getSortedFileNames(["pages/tags"]),
					getFrontMatterInfo,
					baseDirs: ["pages"],
				}),
			).toBe("[[tags]]");
		});
	});

	it("multiple links in the same line", async () => {
		expect(
			await replaceLinks({
				fileContent: "サウナ tags pages/tags",
				allFileNames: getSortedFileNames([
					"pages/tags",
					"サウナ",
					"tags",
				]),
				getFrontMatterInfo,
				baseDirs: ["pages"],
			}),
		).toBe("[[サウナ]] [[tags]] [[pages/tags]]");
	});

	describe("nested links", () => {
		it("", async () => {
			expect(
				await replaceLinks({
					fileContent: "アジャイルリーダーコンピテンシーマップ",
					allFileNames: getSortedFileNames([
						"アジャイルリーダーコンピテンシーマップ",
						"リーダー",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
		it("exsiting links", async () => {
			expect(
				await replaceLinks({
					fileContent: "[[アジャイルリーダーコンピテンシーマップ]]",
					allFileNames: getSortedFileNames([
						"アジャイルリーダーコンピテンシーマップ",
						"リーダー",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
		});
	});

	describe("with space", () => {
		it("", async () => {
			expect(
				await replaceLinks({
					fileContent: "obsidian/automatic linker",
					allFileNames: getSortedFileNames([
						"obsidian/automatic linker",
						"obsidian",
					]),
					getFrontMatterInfo,
				}),
			).toBe("[[obsidian/automatic linker]]");
		});
	});

	describe("ignore url", () => {
		it("one url", async () => {
			expect(
				await replaceLinks({
					fileContent: "- https://example.com",
					allFileNames: getSortedFileNames([
						"example",
						"http",
						"https",
					]),
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com");
			expect(
				await replaceLinks({
					fileContent: "- https://x.com/xxxx/status/12345?t=25S02Tda",
					allFileNames: getSortedFileNames(["st"]),
					getFrontMatterInfo,
				}),
			).toBe("- https://x.com/xxxx/status/12345?t=25S02Tda");
		});
		it("multiple urls", async () => {
			expect(
				await replaceLinks({
					fileContent: "- https://example.com https://example1.com",
					allFileNames: getSortedFileNames([
						"example",
						"example1",
						"https",
						"http",
					]),
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com");
		});
		it("multiple urls with links", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- https://example.com https://example1.com link",
					allFileNames: getSortedFileNames([
						"example1",
						"example",
						"link",
						"https",
						"http",
					]),
					getFrontMatterInfo,
				}),
			).toBe("- https://example.com https://example1.com [[link]]");
		});
	});

	describe("ignore markdown url", () => {
		it("one url", async () => {
			expect(
				await replaceLinks({
					fileContent: "- [title](https://example.com)",
					allFileNames: getSortedFileNames([
						"example",
						"title",
						"https",
						"http",
					]),
					getFrontMatterInfo,
				}),
			).toBe("- [title](https://example.com)");
		});
		it("multiple urls", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- [title1](https://example1.com) [title2](https://example2.com)",
					allFileNames: getSortedFileNames([
						"example1",
						"example2",
						"title1",
						"title2",
						"https",
						"http",
					]),
					getFrontMatterInfo,
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com)",
			);
		});
		it("multiple urls with links", async () => {
			expect(
				await replaceLinks({
					fileContent:
						"- [title1](https://example1.com) [title2](https://example2.com) link",
					allFileNames: getSortedFileNames([
						"example1",
						"example2",
						"title1",
						"title2",
						"https",
						"http",
						"link",
					]),
					getFrontMatterInfo,
				}),
			).toBe(
				"- [title1](https://example1.com) [title2](https://example2.com) [[link]]",
			);
		});
	});
}
