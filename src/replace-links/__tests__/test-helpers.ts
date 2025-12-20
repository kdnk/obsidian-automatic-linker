import { PathAndAliases } from "../../path-and-aliases.types";
import { buildCandidateTrie } from "../../trie";

export const buildCandidateTrieForTest = ({
	files,
	settings: { scoped, baseDir, ignoreCase },
	excludeDirs = [],
}: {
	files: { path: string; aliases?: string[]; exclude?: boolean }[];
	settings: {
		scoped: boolean;
		baseDir: string | undefined;
		ignoreCase?: boolean;
	};
	excludeDirs?: string[];
}) => {
	// Filter out files that are in excluded directories
	const filteredFiles = files.filter((file) => {
		return !excludeDirs.some((excludeDir) => {
			return (
				file.path.startsWith(excludeDir + "/") ||
				file.path === excludeDir
			);
		});
	});

	const sortedFiles: PathAndAliases[] = filteredFiles
		.slice()
		.sort((a, b) => b.path.length - a.path.length)
		.map(({ path, aliases, exclude }) => ({
			path,
			aliases: aliases || null,
			scoped,
			exclude,
		}));

	const { candidateMap, trie } = buildCandidateTrie(
		sortedFiles,
		baseDir,
		ignoreCase ?? false,
	);
	return { candidateMap, trie };
};
