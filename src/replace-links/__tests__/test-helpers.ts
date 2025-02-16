import { PathAndAliases } from "../../path-and-aliases.types";
import { buildCandidateTrie } from "../../trie";
import { getEffectiveNamespace } from "../replace-links";

type Path = string;
type Alias = string;
export const buildCandidateTrieForTest = ({
	fileNames,
	aliasMap,
	restrictNamespace,
	baseDir,
}: {
	fileNames: string[];
	aliasMap: Record<Path, Alias[]>;
	restrictNamespace: boolean;
	baseDir: string | undefined;
}) => {
	const files = getSortedFiles({
		fileNames,
		restrictNamespace,
		baseDir,
	});
	// register alias
	for (const file of files) {
		if (aliasMap[file.path]) {
			file.aliases = aliasMap[file.path];
		}
	}
	const { candidateMap, trie } = buildCandidateTrie(files, baseDir);
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
