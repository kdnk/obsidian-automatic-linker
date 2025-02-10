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
	/** このノードで完結する候補文字列（あれば） */
	candidate?: string;
}

/**
 * Returns the effective namespace for a given file path.
 * If the path starts with one of the baseDir (e.g. "pages/"), the directory immediately
 * under the baseDir is considered the effective namespace.
 */
const getEffectiveNamespace = (path: string, baseDir?: string): string => {
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

/** 単語リストから Trie を構築 */
export const buildTrie = (words: string[]): TrieNode => {
	const root: TrieNode = { children: new Map() };
	for (const word of words) {
		let node = root;
		for (const char of word) {
			if (!node.children.has(char)) {
				node.children.set(char, { children: new Map() });
			}
			node = node.children.get(char)!;
		}
		node.candidate = word;
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
	baseDir = "pages",
) => {
	// Process candidate strings from file paths.
	type Candidate = {
		full: string;
		short: string | null;
		restrictNamespace: boolean;
		// Effective namespace computed relative to baseDir.
		namespace: string;
	};
	const candidates: Candidate[] = allFiles.map((f) => {
		const candidate: Candidate = {
			full: f.path,
			short: null,
			restrictNamespace: f.restrictNamespace,
			namespace: getEffectiveNamespace(f.path, baseDir),
		};
		if (baseDir) {
			const prefix = `${baseDir}/`;
			if (f.path.startsWith(prefix)) {
				candidate.short = f.path.slice(prefix.length);
			}
		}
		return candidate;
	});

	// Build a mapping from candidate string to its CandidateData.
	const candidateMap = new Map<string, CandidateData>();

	// Register normal candidates.
	for (const { full, short, restrictNamespace, namespace } of candidates) {
		// Register the full path candidate with canonical equal to the full path.
		candidateMap.set(full, {
			canonical: full,
			restrictNamespace,
			namespace,
		});
		// If a shorthand exists, register it with canonical equal to the shorthand.
		if (short && !candidateMap.has(short)) {
			candidateMap.set(short, {
				canonical: short,
				restrictNamespace,
				namespace,
			});
		}
	}

	// Register alias candidates.
	for (const file of allFiles) {
		if (file.aliases) {
			// Determine shorthand candidate for the file if available.
			let short: string | null = null;
			if (baseDir) {
				const prefix = `${baseDir}/`;
				if (file.path.startsWith(prefix)) {
					short = file.path.slice(prefix.length);
				}
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
			}
		}
	}

	// Build a Trie from the keys of the candidateMap.
	const trie = buildTrie(Array.from(candidateMap.keys()));

	return { candidateMap, trie };
};
