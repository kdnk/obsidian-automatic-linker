import { PathAndAliases } from "../../path-and-aliases.types";
import { buildCandidateTrie } from "../../trie";
import { getEffectiveNamespace } from "../replace-links";

type Path = string;
type Alias = string;
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

const getSortedFiles = ({
	fileNames,
	restrictNamespace = false,
	baseDir,
}: {
	fileNames: string[];
	restrictNamespace?: boolean;
	baseDir?: string;
}): PathAndAliases[] => {
	const sortedFileNames = fileNames
		.slice()
		.sort((a, b) => b.length - a.length);
	return sortedFileNames.map((path) => ({
		path,
		aliases: null,
		restrictNamespace: restrictNamespace ?? false,
		namespace: getEffectiveNamespace(path, baseDir),
	}));
};
