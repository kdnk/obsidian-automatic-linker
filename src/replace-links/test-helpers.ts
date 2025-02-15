import { PathAndAliases } from "../path-and-aliases.types";
import { getEffectiveNamespace } from "./replace-links";

export const getSortedFiles = ({
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

export const setAliases = (
	files: PathAndAliases[],
	path: string,
	aliases: string[],
): PathAndAliases[] => {
	return files.map((file) =>
		file.path === path
			? {
					...file,
					aliases,
				}
			: file,
	);
};
