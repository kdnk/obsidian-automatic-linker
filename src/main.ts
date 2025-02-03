import { App, getFrontMatterInfo, Plugin, PluginManifest } from "obsidian";
import { replaceLinks } from "./replace-links";
import {
	AutomaticLinkerPluginSettingsTab,
	AutomaticLinkerSettings,
	DEFAULT_SETTINGS,
} from "./settings";
import PCancelable from "p-cancelable";

export default class AutomaticLinkerPlugin extends Plugin {
	settings: AutomaticLinkerSettings;
	private allFileNames: string[] = [];
	// Holds the currently running modifyLinks task
	private currentModifyLinks: PCancelable<void> | null = null;

	constructor(app: App, pluginManifest: PluginManifest) {
		super(app, pluginManifest);
	}

	// Cancelable function to modify links in the active file
	async modifyLinks() {
		// If a previous task is running, cancel it first.
		if (this.currentModifyLinks) {
			this.currentModifyLinks.cancel();
		}

		const cancelableTask = new PCancelable<void>(
			async (resolve, reject, onCancel) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					resolve();
					return;
				}

				// Flag to track cancellation within this task.
				let canceled = false;
				onCancel(() => {
					canceled = true;
				});

				try {
					// Read the active file's content
					const fileContent = await this.app.vault.read(activeFile);
					// If the task was canceled after reading, abort processing.
					if (canceled) {
						return reject(new PCancelable.CancelError());
					}
					// Replace links using the provided utility function.
					const updatedContent = await replaceLinks({
						fileContent,
						allFileNames: this.allFileNames,
						getFrontMatterInfo,
						specialDirs: this.settings.specialDirs,
					});
					// Check again if the task has been canceled.
					if (canceled) {
						return reject(new PCancelable.CancelError());
					}
					// Modify the active file with the updated content.
					await this.app.vault.modify(activeFile, updatedContent);
					resolve();
				} catch (error) {
					reject(error);
				}
			},
		);

		this.currentModifyLinks = cancelableTask;
		return cancelableTask;
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(
			new AutomaticLinkerPluginSettingsTab(this.app, this),
		);

		const loadMarkdownFiles = () => {
			const allMarkdownFiles = this.app.vault.getMarkdownFiles();
			// Create an array of file paths with the ".md" extension removed.
			const allFileNames = allMarkdownFiles.map((file) =>
				file.path.replace(/\.md$/, ""),
			);
			// Sort file names in descending order by length so longer paths match first.
			allFileNames.sort((a, b) => b.length - a.length);
			this.allFileNames = allFileNames;
		};

		// Load markdown file names when the layout is ready.
		this.app.workspace.onLayoutReady(() => {
			loadMarkdownFiles();
			console.log("Automatic Linker: Loaded all markdown files.");
			console.log("this.allFileNames.length", this.allFileNames.length);
		});
		this.registerEvent(
			this.app.vault.on("delete", () => loadMarkdownFiles()),
		);
		this.registerEvent(
			this.app.vault.on("create", () => loadMarkdownFiles()),
		);
		this.registerEvent(
			this.app.vault.on("rename", () => loadMarkdownFiles()),
		);

		// Add a command to trigger modifyLinks manually.
		this.addCommand({
			id: "automatic-linker:link-current-file",
			name: "Link current file",
			editorCallback: async () => {
				try {
					await this.modifyLinks();
				} catch (error) {
					// If the task was canceled, log that it was canceled.
					if (error instanceof PCancelable.CancelError) {
						console.log("modifyLinks was canceled");
					} else {
						console.error(error);
					}
				}
			},
		});

		// Optionally, override the default save command to run modifyLinks with debounce.
		const saveCommandDefinition = (this.app as any)?.commands?.commands?.[
			"editor:save-file"
		];
		const save = saveCommandDefinition?.callback;
		if (typeof save === "function") {
			// Create a debounced version of modifyLinks with a 300ms delay.
			const debouncedModifyLinks = debounce(async () => {
				if (this.settings.formatOnSave) {
					try {
						await this.modifyLinks();
					} catch (error) {
						if (!(error instanceof PCancelable.CancelError)) {
							console.error(error);
						}
					}
				}
			}, 300);
			saveCommandDefinition.callback = async () => {
				// Call the debounced modifyLinks function first.
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
