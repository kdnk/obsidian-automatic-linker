import { buildCandidateTrie, getEffectiveNamespace } from "../../trie";

export const buildCandidateTrieForTest = ({
	files,
	settings: { restrictNamespace, baseDir, ignoreCase },
	excludeDirs = [],
}: {
	files: { path: string; aliases?: string[]; preventLinking?: boolean }[];
	settings: {
		restrictNamespace: boolean;
		baseDir: string | undefined;
		ignoreCase?: boolean;
	};
	excludeDirs?: string[];
}) => {
	// Filter out files that are in excluded directories
	const filteredFiles = files.filter((file) => {
		return !excludeDirs.some((excludeDir) => {
			return file.path.startsWith(excludeDir + "/") || file.path === excludeDir;
		});
	});

	const sortedFiles = filteredFiles
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
