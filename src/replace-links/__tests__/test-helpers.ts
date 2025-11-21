import { buildCandidateTrie, getEffectiveNamespace } from "../../trie";

export const buildCandidateTrieForTest = ({
	files,
	settings: { restrictNamespace, baseDir, ignoreCase },
}: {
	files: { path: string; aliases?: string[]; preventLinking?: boolean }[];
	settings: {
		restrictNamespace: boolean;
		baseDir: string | undefined;
		ignoreCase?: boolean;
	};
}) => {
	const sortedFiles = files
		.slice()
		.sort((a, b) => b.path.length - a.path.length)
		.map(({ path, aliases, preventLinking }) => ({
			path,
			aliases: aliases || null,
			restrictNamespace,
			preventLinking,
			namespace: getEffectiveNamespace(path, baseDir),
		}));

	const { candidateMap, trie } = buildCandidateTrie(
		sortedFiles,
		baseDir,
		ignoreCase ?? false,
	);
	return { candidateMap, trie };
};
