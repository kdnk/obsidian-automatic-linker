import {
	App,
	getFrontMatterInfo,
	parseFrontMatterAliases,
	Plugin,
	PluginManifest,
} from "obsidian";
import { replaceLinks } from "./replace-links";
import {
	AutomaticLinkerPluginSettingsTab,
	AutomaticLinkerSettings,
	DEFAULT_SETTINGS,
} from "./settings";

export default class AutomaticLinkerPlugin extends Plugin {
	settings: AutomaticLinkerSettings;

	private allFileNames: string[] = [];

	constructor(app: App, pluginManifest: PluginManifest) {
		super(app, pluginManifest);
	}

	async modifyLinks() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;
		const fileContent = await this.app.vault.read(activeFile);

		const updatedContent = await replaceLinks({
			fileContent,
			allFileNames: this.allFileNames,
			getFrontMatterInfo,
			specialDirs: this.settings.specialDirs,
		});

		await this.app.vault.modify(activeFile, updatedContent);
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(
			new AutomaticLinkerPluginSettingsTab(this.app, this),
		);

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

		// Override the save command callback if available.
		const saveCommandDefinition = (this.app as any)?.commands?.commands?.[
			"editor:save-file"
		];
		const save = saveCommandDefinition?.callback;
		if (typeof save === "function") {
			// Create a debounced version of modifyLinks with a 300ms delay.
			const debouncedModifyLinks = debounce(async () => {
				if (this.settings.formatOnSave) {
					await this.modifyLinks();
				}
			}, 300);
			saveCommandDefinition.callback = async () => {
				// Call the debounced modifyLinks function.
				debouncedModifyLinks();
				// Then, call the original save function.
				save();
			};
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// A simple debounce function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
	let timeout: ReturnType<typeof setTimeout>;
	return function (this: any, ...args: any[]) {
		const context = this;
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(context, args), wait);
	} as T;
}
