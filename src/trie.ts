import { PathAndAliases } from "./path-and-aliases.types";

/**
 * Type definition for a node in the Trie.
 */
export interface TrieNode {
	children: Map<string, TrieNode>;
	// If this node marks the end of a candidate string, store the candidate.
	candidate?: string;
}

/**
 * Helper function to build a Trie from a list of words.
 *
 * @param words - List of candidate words.
 * @returns The root of the Trie.
 */
export const buildTrie = (words: string[]): TrieNode => {
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

/**
 * Builds a candidate map and Trie from a list of file names.
 *
 * The candidate map maps both the full candidate and a short candidate (if applicable)
 * to its canonical replacement.
 *
 * @param allFiles - List of files (without the ".md" extension).
 * @param baseDirs - List of base directories to consider for short names.
 * @returns An object containing the candidateMap and Trie.
 */
export const buildCandidateTrie = (
	allFiles: PathAndAliases[],
	baseDirs: string[] = ["pages"],
) => {
	// Process candidate strings.
	type Candidate = { full: string; short: string | null };
	const candidates: Candidate[] = allFiles.map((f) => {
		const candidate: Candidate = { full: f.path, short: null };
		for (const dir of baseDirs) {
			const prefix = `${dir}/`;
			if (f.path.startsWith(prefix)) {
				candidate.short = f.path.slice(prefix.length);
				break;
			}
		}
		return candidate;
	});

	// Build a mapping from candidate string to its canonical replacement.
	const candidateMap = new Map<string, string>();
	for (const { full, short } of candidates) {
		candidateMap.set(full, full);
		if (short && !candidateMap.has(short)) {
			candidateMap.set(short, short);
		}
	}

	// Build a Trie from the keys of the candidate map.
	const trie = buildTrie(Array.from(candidateMap.keys()));

	return { candidateMap, trie };
};
