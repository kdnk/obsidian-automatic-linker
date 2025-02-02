import { getFrontMatterInfo, parseFrontMatterAliases, Plugin } from "obsidian";
import { replaceLinks } from "./replace-links";

// Remember to rename these classes and interfaces!

interface AutomaticLinkerPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: AutomaticLinkerPluginSettings = {
	mySetting: "default",
};

export default class AutomaticLinkerPlugin extends Plugin {
	settings: AutomaticLinkerPluginSettings;

	private allFileNames: string[] = [];

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async modifyLinks() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;
		const fileContent = await this.app.vault.read(activeFile);

		const updatedContent = await replaceLinks({
			fileContent,
			allFileNames: this.allFileNames,
			getFrontMatterInfo,
			specialDirs: ["pages"],
		});

		await this.app.vault.modify(activeFile, updatedContent);
	}

	async onload() {
		await this.loadSettings();

		const loadMarkdownFiles = () => {
			const allMarkdownFiles = this.app.vault.getMarkdownFiles();
			const allAlias = [];
			for (const file of allMarkdownFiles) {
				const frontmatter =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (frontmatter) {
					const alias = parseFrontMatterAliases(frontmatter);
					// Create an object combining the file and its aliases as needed.
					allAlias.push({
						file,
						alias,
					});
				}
			}

			// Generate strings for file paths with the .md extension removed.
			const allFileNames = allMarkdownFiles.map((file) => {
				const path = file.path;
				return path.replace(/\.md$/, "");
			});

			// Sort the filenames in descending order by length so that longer paths match first.
			allFileNames.sort((a, b) => b.length - a.length);

			this.allFileNames = allFileNames;
		};

		this.registerEvent(
			this.app.metadataCache.on("resolved", async () => {
				loadMarkdownFiles();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				loadMarkdownFiles();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", () => {
				loadMarkdownFiles();
			}),
		);

		this.registerEvent(
			this.app.vault.on("create", () => {
				loadMarkdownFiles();
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", () => {
				loadMarkdownFiles();
			}),
		);

		this.addCommand({
			id: "automatic-linker:link-current-file",
			name: "Link current file",
			editorCallback: async () => {
				await this.modifyLinks();
			},
		});

		const saveCommandDefinition = (this.app as any).commands?.commands?.[
			"editor:save-file"
		];
		const save = saveCommandDefinition?.callback;
		if (typeof save === "function") {
			saveCommandDefinition.callback = async () => {
				await this.modifyLinks();
			};
		}
	}
}
