import { describe, expect, it } from "vitest";
import { PathAndAliases } from "../../path-and-aliases.types";
import { buildCandidateTrie, buildTrie, CandidateData } from "../../trie";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("basic", () => {
	it("replaces links", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "hello" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "hello",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0 },
		});
		expect(result).toBe("[[hello]]");
	});

	it("replaces links with bullet", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "hello" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "- hello",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("- [[hello]]");
	});

	it("replaces links with other texts", () => {
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "world hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("world [[hello]]");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "hello world",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[hello]] world");
		}
	});

	it("replaces links with other texts and bullet", () => {
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "- world hello",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- world [[hello]]");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "- hello world",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("- [[hello]] world");
		}
	});

	it("replaces multiple links", () => {
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }, { path: "world" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "hello world",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("[[hello]] [[world]]");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }, { path: "world" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "\nhello\nworld\n",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("\n[[hello]]\n[[world]]\n");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }, { path: "world" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "\nhello\nworld aaaaa\n",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("\n[[hello]]\n[[world]] aaaaa\n");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [{ path: "hello" }, { path: "world" }],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "\n aaaaa hello\nworld bbbbb\n",
				linkResolverContext: {
					filePath: "journals/2022-01-01",
					trie,
					candidateMap,
				},
			});
			expect(result).toBe("\n aaaaa [[hello]]\n[[world]] bbbbb\n");
		}
	});
});

describe("complex fileNames", () => {
	it("unmatched namespace", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "namespace/tag1" }, { path: "namespace/tag2" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "namespace",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("namespace");
	});

	it("single namespace", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "namespace/tag1" }, { path: "namespace/tag2" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "namespace/tag1",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[namespace/tag1|tag1]]");
	});

	it("multiple namespaces", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "namespace/tag1" },
				{ path: "namespace/tag2" },
				{ path: "namespace" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "namespace/tag1 namespace/tag2",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[namespace/tag1|tag1]] [[namespace/tag2|tag2]]");
	});
});

describe("containing CJK", () => {
	it("unmatched namespace", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "namespace/タグ" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "namespace",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("namespace");
	});

	it("multiple namespaces", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "namespace/tag1" },
				{ path: "namespace/tag2" },
				{ path: "namespace/タグ3" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "namespace/tag1 namespace/tag2 namespace/タグ3",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe(
			"[[namespace/tag1|tag1]] [[namespace/tag2|tag2]] [[namespace/タグ3|タグ3]]",
		);
	});
});

describe("starting CJK", () => {
	it("unmatched namespace", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "namespace/タグ" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "名前空間",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("名前空間");
	});

	it("single namespace", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "名前空間/tag1" },
				{ path: "名前空間/tag2" },
				{ path: "名前空間/タグ3" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "名前空間/tag1",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[名前空間/tag1|tag1]]");
	});

	it("multiple namespaces", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "名前空間/tag1" },
				{ path: "名前空間/tag2" },
				{ path: "名前空間/タグ3" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "名前空間/tag1 名前空間/tag2 名前空間/タグ3",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe(
			"[[名前空間/tag1|tag1]] [[名前空間/tag2|tag2]] [[名前空間/タグ3|タグ3]]",
		);
	});

	it("multiple CJK words", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "漢字" }, { path: "ひらがな" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "- 漢字　ひらがな",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("- [[漢字]]　[[ひらがな]]");
	});

	it("multiple same CJK words", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "ひらがな" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "- ひらがなとひらがな",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("- [[ひらがな]]と[[ひらがな]]");
	});
});

describe("CJK - Korean", () => {
	it("converts Korean words to links", () => {
		// 韓国語の候補ファイル
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "한글" }, { path: "테스트" }, { path: "예시" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "한글 테스트 예시",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[한글]] [[테스트]] [[예시]]");
	});

	it("converts Korean words within sentence", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "문서" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "이 문서는 문서이다.",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("이 문서는 [[문서]]이다.");
	});
});

describe("CJK - Chinese", () => {
	it("converts Chinese words to links", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "汉字" }, { path: "测试" }, { path: "示例" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "汉字 测试 示例",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[汉字]] [[测试]] [[示例]]");
	});

	it("converts Chinese words within sentence", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "文档" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "这个文档很好。",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("这个[[文档]]很好。");
	});
});

describe("base character (pages)", () => {
	it("unmatched namespace", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "pages/tags" }],
			settings: {
				restrictNamespace: false,
				baseDir: "pages",
			},
		});
		const result = replaceLinks({
			body: "tags",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { baseDir: "pages" },
		});
		expect(result).toBe("[[tags]]");
	});
});

it("multiple links in the same line", () => {
	const { candidateMap, trie } = buildCandidateTrieForTest({
		files: [{ path: "pages/tags" }, { path: "サウナ" }, { path: "tags" }],
		settings: {
			restrictNamespace: false,
			baseDir: undefined,
		},
	});
	const result = replaceLinks({
		body: "サウナ tags pages/tags",
		linkResolverContext: {
			filePath: "journals/2022-01-01",
			trie,
			candidateMap,
		},
	});
	expect(result).toBe("[[サウナ]] [[tags]] [[pages/tags|tags]]");
});

describe("nested links", () => {
	it("", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "アジャイルリーダーコンピテンシーマップ" },
				{ path: "リーダー" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "アジャイルリーダーコンピテンシーマップ",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
	});

	it("existing links", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "アジャイルリーダーコンピテンシーマップ" },
				{ path: "リーダー" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "[[アジャイルリーダーコンピテンシーマップ]]",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
		});
		expect(result).toBe("[[アジャイルリーダーコンピテンシーマップ]]");
	});
});

describe("aliases", () => {
	it("replaces alias with canonical form using file path and alias", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "pages/HelloWorld", aliases: ["Hello", "HW"] }],
			settings: {
				restrictNamespace: false,
				baseDir: "pages",
			},
		});
		const result1 = replaceLinks({
			body: "Hello",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { baseDir: "pages" },
		});
		expect(result1).toBe("[[HelloWorld|Hello]]");

		const result2 = replaceLinks({
			body: "HelloWorld",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { baseDir: "pages" },
		});
		expect(result2).toBe("[[HelloWorld]]");
	});

	it("replaces multiple occurrences of alias and normal candidate", () => {
		const files: PathAndAliases[] = [
			{
				path: "pages/HelloWorld",
				aliases: ["Hello"],
				restrictNamespace: false,
			},
		];
		const { candidateMap, trie } = buildCandidateTrie(files, "pages");
		const result = replaceLinks({
			body: "Hello HelloWorld",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: {
				baseDir: "pages",
			},
		});
		expect(result).toBe("[[HelloWorld|Hello]] [[HelloWorld]]");
	});
});

describe("namespace resolution", () => {
	it("replaces candidate with namespace when full candidate is provided", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "namespaces/link" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "namespaces/link",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { namespaceResolution: true },
		});
		expect(result).toBe("[[namespaces/link|link]]");
	});

	it("replaces candidate without namespace correctly", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "link" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "link",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { namespaceResolution: true },
		});
		expect(result).toBe("[[link]]");
	});

	it("should not replace YYY-MM-DD formatted text when it doesn't match the candidate's shorthand", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "2025/02/08" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "2025-02-08",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: { namespaceResolution: true },
		});
		expect(result).toBe("2025-02-08");
	});
});

describe("namespace resolution nearlest file path", () => {
	it("closest siblings namespace should be used", () => {
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/a/b/c/d/link" },
					{ path: "namespace/a/b/c/d/e/f/link" },
					{ path: "namespace/a/b/c/link" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});

			const result = replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/a/b/c/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[namespace/a/b/c/link|link]]");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/a/b/c/link" },
					{ path: "namespace/a/b/c/d/link" },
					{ path: "namespace/a/b/c/d/e/f/link" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/a/b/c/d/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[namespace/a/b/c/d/link|link]]");
		}
		{
			const { candidateMap, trie } = buildCandidateTrieForTest({
				files: [
					{ path: "namespace/xxx/link" },
					{ path: "another-namespace/link" },
					{ path: "another-namespace/a/b/c/link" },
					{ path: "another-namespace/a/b/c/d/link" },
					{ path: "another-namespace/a/b/c/d/e/f/link" },
				],
				settings: {
					restrictNamespace: false,
					baseDir: undefined,
				},
			});
			const result = replaceLinks({
				body: "link",
				linkResolverContext: {
					filePath: "namespace/current-file",
					trie,
					candidateMap,
				},
				settings: { namespaceResolution: true },
			});
			expect(result).toBe("[[namespace/xxx/link|link]]");
		}
	});

	it("closest children namespace should be used", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "namespace1/subnamespace/link" },
				{ path: "namespace2/super-super-long-long-directory/link" },
				{ path: "namespace3/link" },
				{ path: "namespace/a/b/c/link" },
				{ path: "namespace/a/b/c/d/link" },
				{ path: "namespace/a/b/c/d/e/f/link" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "link",
			linkResolverContext: {
				filePath: "namespace/a/b/current-file",
				trie,
				candidateMap,
			},
			settings: { namespaceResolution: true },
		});
		expect(result).toBe("[[namespace/a/b/c/link|link]]");
	});

	it("find closest path if the current path is in base dir and the candidate is not", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [
				{ path: "namespace1/aaaaaaaaaaaaaaaaaaaaaaaaa/link" },
				{ path: "namespace1/link2" },
				{ path: "namespace2/link2" },
				{ path: "namespace3/aaaaaa/bbbbbb/link2" },
				{
					path: "base/looooooooooooooooooooooooooooooooooooooong/link",
				},
				{
					path: "base/looooooooooooooooooooooooooooooooooooooong/super-super-long-long-long-long-closest-sub-dir/link",
				},
				{ path: "base/a/b/c/link" },
				{ path: "base/a/b/c/d/link" },
				{ path: "base/a/b/c/d/e/f/link" },
			],
			settings: {
				restrictNamespace: false,
				baseDir: "base",
			},
		});
		const result = replaceLinks({
			body: "link link2",
			linkResolverContext: {
				filePath: "base/current-file",
				trie,
				candidateMap,
			},
			settings: { namespaceResolution: true, baseDir: "base" },
		});
		expect(result).toBe(
			"[[looooooooooooooooooooooooooooooooooooooong/link|link]] [[namespace1/link2|link2]]",
		);

		const result2 = replaceLinks({
			body: "link link2",
			linkResolverContext: {
				filePath: "base/current-file",
				trie,
				candidateMap,
			},
			settings: { namespaceResolution: false, baseDir: "base" },
		});
		expect(result2).toBe("link link2");
	});
});

it("ignore month notes", () => {
	const { candidateMap, trie } = buildCandidateTrieForTest({
		files: [
			{ path: "01" },
			{ path: "02" },
			{ path: "03" },
			{ path: "04" },
			{ path: "05" },
			{ path: "06" },
			{ path: "07" },
			{ path: "08" },
			{ path: "09" },
			{ path: "10" },
			{ path: "11" },
			{ path: "12" },
			{ path: "1" },
			{ path: "2" },
			{ path: "3" },
			{ path: "4" },
			{ path: "5" },
			{ path: "6" },
			{ path: "7" },
			{ path: "8" },
			{ path: "9" },
			{ path: "namespace/01" },
			{ path: "namespace/02" },
			{ path: "namespace/03" },
			{ path: "namespace/04" },
			{ path: "namespace/05" },
			{ path: "namespace/06" },
			{ path: "namespace/07" },
			{ path: "namespace/08" },
			{ path: "namespace/09" },
			{ path: "namespace/10" },
			{ path: "namespace/11" },
			{ path: "namespace/12" },
			{ path: "namespace/1" },
			{ path: "namespace/2" },
			{ path: "namespace/3" },
			{ path: "namespace/4" },
			{ path: "namespace/5" },
			{ path: "namespace/6" },
			{ path: "namespace/7" },
			{ path: "namespace/8" },
			{ path: "namespace/9" },
		],
		settings: {
			restrictNamespace: false,
			baseDir: undefined,
		},
	});
	const result = replaceLinks({
		body: "01 1 12 namespace/01",
		linkResolverContext: {
			filePath: "journals/2022-01-01",
			trie,
			candidateMap,
		},
	});
	expect(result).toBe("01 1 12 [[namespace/01|01]]");
});

describe("ignoreDateFormats setting", () => {
	it("should not replace date format when ignoreDateFormats is true", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "2025-02-10" }, { path: "journals/2025-02-10" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "2025-02-10",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: {
				minCharCount: 0,
				namespaceResolution: true,
				ignoreDateFormats: true,
			},
		});
		expect(result).toBe("2025-02-10");
	});

	it("should replace date format when ignoreDateFormats is false", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "2025-02-10" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: "2025-02-10",
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: {
				minCharCount: 0,
				namespaceResolution: true,
				ignoreDateFormats: false,
			},
		});
		expect(result).toBe("[[2025-02-10]]");
	});
});

describe("replaceLinks (manual candidateMap/trie)", () => {
	const candidateMap = new Map<string, CandidateData>([
		[
			"x",
			{
				canonical: "namespace/x",
				restrictNamespace: true,
				namespace: "namespace",
			},
		],
		[
			"z",
			{
				canonical: "namespace/y/z",
				restrictNamespace: true,
				namespace: "namespace",
			},
		],
		[
			"root",
			{
				canonical: "root-note",
				restrictNamespace: true,
				namespace: "",
			},
		],
		// Candidate without namespace restriction.
		[
			"free",
			{
				canonical: "free-note",
				restrictNamespace: false,
				namespace: "other",
			},
		],
		// For alias testing:
		// Assume file "pages/HelloWorld" with shorthand "HelloWorld"
		[
			"pages/HelloWorld",
			{
				canonical: "pages/HelloWorld",
				restrictNamespace: false,
				namespace: "pages",
			},
		],
		// Alias "Hello" is different from the shorthand, so canonical becomes "pages/HelloWorld|Hello".
		[
			"Hello",
			{
				canonical: "pages/HelloWorld|Hello",
				restrictNamespace: false,
				namespace: "pages",
			},
		],
		// Also register the shorthand candidate.
		[
			"HelloWorld",
			{
				canonical: "HelloWorld",
				restrictNamespace: false,
				namespace: "pages",
			},
		],
		// For "tags" test: candidate key "tags" should map to canonical "tags"
		[
			"pages/tags",
			{
				canonical: "pages/tags",
				restrictNamespace: false,
				namespace: "pages",
			},
		],
		[
			"tags",
			{
				canonical: "tags",
				restrictNamespace: false,
				namespace: "pages",
			},
		],
		// For Korean test, add candidate "문서"
		[
			"문서",
			{
				canonical: "문서",
				restrictNamespace: false,
				namespace: "namespace",
			},
		],
		// For Japanese test, add candidate "ひらがな"
		[
			"ひらがな",
			{
				canonical: "ひらがな",
				restrictNamespace: false,
				namespace: "namespace",
			},
		],
		// For Chinese test, add candidate "文档"
		[
			"文档",
			{
				canonical: "文档",
				restrictNamespace: false,
				namespace: "namespace",
			},
		],
	]);

	it("CJK - Korean > converts Korean words within sentence", () => {
		const trie = buildTrie(Array.from(candidateMap.keys()));
		const body = "이 문서는 문서이다.";
		const result = replaceLinks({
			body,
			linkResolverContext: {
				filePath: "namespace/note",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0, namespaceResolution: true },
		});
		expect(result).toBe("이 문서는 [[문서]]이다.");
	});

	it("starting CJK > multiple same CJK words", () => {
		const trie = buildTrie(Array.from(candidateMap.keys()));
		const body = "- ひらがなひらがな";
		const result = replaceLinks({
			body,
			linkResolverContext: {
				filePath: "namespace/note",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0, namespaceResolution: true },
		});
		expect(result).toBe("- [[ひらがな]][[ひらがな]]");
	});

	it("CJK - Chinese > converts Chinese words within sentence", () => {
		const trie = buildTrie(Array.from(candidateMap.keys()));
		const body = "这个文档很好。";
		const result = replaceLinks({
			body,
			linkResolverContext: {
				filePath: "namespace/note",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0, namespaceResolution: true },
		});
		expect(result).toBe("这个[[文档]]很好。");
	});

	it("base character (pages) > unmatched namespace", () => {
		const trie = buildTrie(Array.from(candidateMap.keys()));
		const body = "tags";
		const result = replaceLinks({
			body,
			linkResolverContext: {
				filePath: "root-note",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0, namespaceResolution: true },
		});
		expect(result).toBe("[[tags]]");
	});

	it("aliases > replaces alias with canonical form using file path and alias", () => {
		const trie = buildTrie(Array.from(candidateMap.keys()));
		const body = "HelloWorld";
		const result = replaceLinks({
			body,
			linkResolverContext: {
				filePath: "pages/Note",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0, namespaceResolution: true },
		});
		expect(result).toBe("[[HelloWorld]]");
	});

	it("aliases > replaces multiple occurrences of alias and normal candidate", () => {
		const trie = buildTrie(Array.from(candidateMap.keys()));
		const body = "Hello HelloWorld";
		const result = replaceLinks({
			body,
			linkResolverContext: {
				filePath: "pages/Note",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0, namespaceResolution: true },
		});
		expect(result).toBe("[[pages/HelloWorld|Hello]] [[HelloWorld]]");
	});

	it("replaceLinks > should not replace when inside a protected segment", () => {
		const trie = buildTrie(Array.from(candidateMap.keys()));
		const body = "Some text `x` more text";
		const result = replaceLinks({
			body,
			linkResolverContext: {
				filePath: "namespace/note",
				trie,
				candidateMap,
			},
			settings: { minCharCount: 0, namespaceResolution: true },
		});
		expect(result).toBe("Some text `x` more text");
	});

	describe("automatic-linker-restrict-namespace and base dir", () => {
		// Add candidate "a" corresponding to a file at "pages/set/a"
		// with restrictNamespace enabled and an effective namespace of "set".
		candidateMap.set("a", {
			canonical: "set/a",
			restrictNamespace: true,
			namespace: "set",
		});
		const trie = buildTrie(Array.from(candidateMap.keys()));

		it("should replace candidate with restrictNamespace when effective namespace matches", () => {
			// Current file is in "pages/set/...", so effective namespace is "set"
			const body = "a";
			const filePath = "pages/set/current";
			const result = replaceLinks({
				body,
				linkResolverContext: { filePath, trie, candidateMap },
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			expect(result).toBe("[[set/a|a]]");
		});

		it("should not replace candidate with restrictNamespace when effective namespace does not match", () => {
			// Current file is in "pages/other/...", so effective namespace is "other"
			const body = "a";
			const filePath = "pages/other/current";
			const result = replaceLinks({
				body,
				linkResolverContext: { filePath, trie, candidateMap },
				settings: {
					minCharCount: 0,
					namespaceResolution: true,
					baseDir: "pages",
				},
			});
			// Since effective namespace does not match ("set" vs "other"), no replacement occurs.
			expect(result).toBe("a");
		});
	});
});
