import { describe, it, expect } from "vitest";
import { replaceLinks } from "../replace-links";
import { buildCandidateTrieForTest } from "./test-helpers";

describe("table", () => {
	it("escape pipe inside table", () => {
		const { candidateMap, trie } = buildCandidateTrieForTest({
			files: [{ path: "ns/note1" }, { path: "ns/note2" }],
			settings: {
				restrictNamespace: false,
				baseDir: undefined,
			},
		});
		const result = replaceLinks({
			body: `
| Test Item                         | |
| --------------------------------- | --- |
| note1                             | |
| note2                             | |
`,
			linkResolverContext: {
				filePath: "journals/2022-01-01",
				trie,
				candidateMap,
			},
			settings: {
				namespaceResolution: true,
			},
		});
		expect(result).toBe(`
| Test Item                         | |
| --------------------------------- | --- |
| [[ns/note1\\|note1]]                             | |
| [[ns/note2\\|note2]]                             | |
`);
	});
});
