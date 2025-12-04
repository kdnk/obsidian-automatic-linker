/**
 * Builds a candidate map and Trie from a list of file names.
 *
 * The candidate map maps both the full candidate and a short candidate (if applicable)
 * to its canonical replacement.
 *
 * For a normal link, the canonical replacement is the candidate itself (e.g. [[link]]).
 * For an alias, the canonical replacement is "file.path|alias" (e.g. [[file.path|alias]]).
 *
 * @param allFiles - List of files (without the ".md" extension).
 * @param baseDir - List of base directories to consider for short names.
 * @returns An object containing the candidateMap and Trie.
 */
// src/trie.ts

import { PathAndAliases } from "./path-and-aliases.types";

export interface TrieNode {
	children: Map<string, TrieNode>;
	candidate?: string;
}

/**
 * Returns the effective namespace for a given file path.
 * If the path starts with one of the baseDir (e.g. "pages/"), the directory immediately
 * under the baseDir is considered the effective namespace.
 */
export const getEffectiveNamespace = (
	path: string,
	baseDir?: string,
): string => {
	const prefix = baseDir + "/";
	if (baseDir) {
		if (path.startsWith(prefix)) {
			const rest = path.slice(prefix.length);
			const segments = rest.split("/");
			return segments[0] || "";
		}
	}
	// Fallback: return the first segment
	const segments = path.split("/");
	return segments[0] || "";
};

export const buildTrie = (words: string[], ignoreCase = false): TrieNode => {
	const root: TrieNode = { children: new Map() };

	for (const word of words) {
		let node = root;
		const chars = ignoreCase ? word.toLowerCase() : word;
		for (const char of chars) {
			let child = node.children.get(char);
			if (!child) {
				child = { children: new Map() };
				node.children.set(char, child);
			}
			node = child;
		}
		node.candidate = word; // preserve the original case
	}

	return root;
};

// CandidateData holds the canonical replacement string as well as namespace‐設定
export interface CandidateData {
	canonical: string;
	restrictNamespace: boolean;
	namespace: string;
}

export const buildCandidateTrie = (
	allFiles: PathAndAliases[],
	baseDir: string | undefined,
	ignoreCase = false,
) => {
	// Filter out files with preventLinking: true
	const linkableFiles = allFiles.filter((f) => !f.preventLinking);

	// Process candidate strings from file paths.
	type Candidate = {
		full: string;
		short: string | null;
		restrictNamespace: boolean;
		// Effective namespace computed relative to baseDir.
		namespace: string;
	};
	const basePrefix = baseDir ? `${baseDir}/` : null;
	const basePrefixLength = basePrefix?.length || 0;

	const candidates: Candidate[] = linkableFiles.map((f) => {
		const candidate: Candidate = {
			full: f.path,
			short: null,
			restrictNamespace: f.restrictNamespace,
			namespace: getEffectiveNamespace(f.path, baseDir),
		};
		if (basePrefix && f.path.startsWith(basePrefix)) {
			candidate.short = f.path.slice(basePrefixLength);
		}
		return candidate;
	});

	// Build a mapping from candidate string to its CandidateData.
	const candidateMap = new Map<string, CandidateData>();

	// Register normal candidates.
	for (const { full, short, restrictNamespace, namespace } of candidates) {
		// Register the full path and its case-insensitive variant if needed
		candidateMap.set(full, {
			canonical: full,
			restrictNamespace,
			namespace,
		});

		// For paths with a slash, register the last segment
		const lastSlashIndex = full.lastIndexOf("/");
		if (lastSlashIndex !== -1) {
			const lastSegment = full.slice(lastSlashIndex + 1);
			// For CJK paths or when ignoreCase is enabled
			if (
				ignoreCase ||
				/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(
					lastSegment,
				)
			) {
				// Register both the original case and lowercase versions
				candidateMap.set(lastSegment, {
					canonical: full,
					restrictNamespace,
					namespace,
				});
				if (ignoreCase) {
					candidateMap.set(lastSegment.toLowerCase(), {
						canonical: full,
						restrictNamespace,
						namespace,
					});
				}
			}
		}

		// Register the short path if available
		if (short) {
			candidateMap.set(short, {
				canonical: full,
				restrictNamespace,
				namespace,
			});
		}
	}

	// Register alias candidates.
	for (const file of linkableFiles) {
		if (file.aliases) {
			// Determine shorthand candidate for the file if available.
			let short: string | null = null;
			if (basePrefix && file.path.startsWith(basePrefix)) {
				short = file.path.slice(basePrefixLength);
			}
			for (const alias of file.aliases) {
				// If alias equals the shorthand, use alias as canonical; otherwise use "full|alias".
				const canonicalForAlias =
					short && alias === short ? alias : `${file.path}|${alias}`;
				if (!candidateMap.has(alias)) {
					candidateMap.set(alias, {
						canonical: canonicalForAlias,
						restrictNamespace: file.restrictNamespace,
						namespace: getEffectiveNamespace(file.path, baseDir),
					});
				}
				// Register lowercase version when ignoreCase is enabled
				if (ignoreCase && !candidateMap.has(alias.toLowerCase())) {
					candidateMap.set(alias.toLowerCase(), {
						canonical: canonicalForAlias,
						restrictNamespace: file.restrictNamespace,
						namespace: getEffectiveNamespace(file.path, baseDir),
					});
				}
			}
		}
	}

	// Build a trie from all candidate strings
	const words = Array.from(candidateMap.keys());
	const trie = buildTrie(words, ignoreCase);

	return { candidateMap, trie };
};

if (import.meta.vitest) {
	const { it, expect, describe } = import.meta.vitest;

	// Test for getEffectiveNamespace
	describe("getEffectiveNamespace", () => {
		it("should return the first directory after the baseDir", () => {
			expect(getEffectiveNamespace("pages/docs/file", "pages")).toBe(
				"docs",
			);
			expect(getEffectiveNamespace("pages/home/readme", "pages")).toBe(
				"home",
			);
		});

		it("should return the first segment if baseDir is not found", () => {
			expect(getEffectiveNamespace("docs/file")).toBe("docs");
			expect(getEffectiveNamespace("home/readme")).toBe("home");
		});
	});

	// Test for buildTrie
	describe("buildTrie", () => {
		it("should build a Trie with the given words", () => {
			const words = ["hello", "world", "hi"];
			const trie = buildTrie(words);

			expect(trie.children.has("h")).toBe(true);
			expect(trie.children.has("w")).toBe(true);
			expect(trie.children.get("h")?.children.has("e")).toBe(true);
			expect(trie.children.get("h")?.children.get("i")?.candidate).toBe(
				"hi",
			);
		});
	});

	// Test for buildCandidateTrie
	describe("buildCandidateTrie", () => {
		it("should build a candidate map and trie", () => {
			const allFiles: PathAndAliases[] = [
				{
					path: "pages/docs/readme",
					restrictNamespace: false,
					aliases: ["intro"],
				},
				{
					path: "pages/home/index",
					restrictNamespace: false,
					aliases: [],
				},
			];

			const { candidateMap, trie } = buildCandidateTrie(
				allFiles,
				"pages",
			);

			expect(candidateMap.has("pages/docs/readme")).toBe(true);
			expect(candidateMap.has("docs/readme")).toBe(true);
			expect(candidateMap.get("intro")?.canonical).toBe(
				"pages/docs/readme|intro",
			);
			expect(trie.children.has("d")).toBe(true);
			expect(trie.children.has("h")).toBe(true);
		});
	});
}
