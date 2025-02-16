import { buildCandidateTrie, getEffectiveNamespace } from "../../trie";

export const buildCandidateTrieForTest = ({
	files,
	restrictNamespace,
	baseDir,
}: {
	files: { path: string; aliases?: string[] }[];
	restrictNamespace: boolean;
	baseDir: string | undefined;
}) => {
	const sortedFiles = files
		.slice()
		.sort((a, b) => b.path.length - a.path.length)
		.map(({ path, aliases }) => ({
			path,
			aliases: aliases || null,
			restrictNamespace,
			namespace: getEffectiveNamespace(path, baseDir),
		}));

	const { candidateMap, trie } = buildCandidateTrie(sortedFiles, baseDir);
	return { candidateMap, trie };
};
