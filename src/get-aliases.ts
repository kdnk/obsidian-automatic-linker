import { TFile, parseFrontMatterAliases, App } from "obsidian";
import { AutomaticLinkerSettings } from "./settings";

export const getAliases = (
	app: App,
	file: TFile,
	settings: AutomaticLinkerSettings,
) => {
	if (settings.considerAliases) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const aliases = parseFrontMatterAliases(frontmatter);
		return aliases;
	} else {
		return null;
	}
};
