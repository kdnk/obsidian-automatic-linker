import {
	App,
	Editor,
	getFrontMatterInfo,
	MarkdownView,
	Modal,
	Notice,
	parseFrontMatterAliases,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

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
					//do what you want here, for ex create a new object with the attached file + their alias
					allAlias.push({
						file,
						alias,
					});
				}
			}

			const allFileNames = allMarkdownFiles.map((file) => {
				const path = file.path;
				return path.replace(/\.md$/, "");
			});
			this.allFileNames = allFileNames;
		};

		const replaceLinks = async () => {
			const escapeRegExp = (str: string) =>
				str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const filePathPatterns = this.allFileNames.map((name) =>
				escapeRegExp(name),
			);
			const combinedPattern = filePathPatterns.join("|");
			const regex = new RegExp(
				`\\b(?!\\[\\[)(${combinedPattern})(?!\\]\\])\\b`,
				"g",
			);
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) return;
			const fileContent = await this.app.vault.read(activeFile);
			const { contentStart } = getFrontMatterInfo(fileContent);
			const contentWithoutFrontMatter = fileContent.slice(contentStart);
			const updatedContent = contentWithoutFrontMatter.replace(
				regex,
				"[[$1]]",
			);
			console.log(`[main.ts:70] updatedContent: `, updatedContent);

			// Save the updated content back to the active file
			await this.app.vault.modify(activeFile, updatedContent);
			console.log(`[main.ts:75] File has been updated and saved.`);
		};

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				loadMarkdownFiles();
			}),
		);

		const saveCommandDefinition = (this.app as any).commands?.commands?.[
			"editor:save-file"
		];
		const save = saveCommandDefinition?.callback;

		if (typeof save === "function") {
			saveCommandDefinition.callback = async () => {
				await replaceLinks();
			};
		}

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"dice",
			"Sample Plugin",
			(evt: MouseEvent) => {
				// Called when the user clicks the icon.
				new Notice("This is a notice!");
			},
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-sample-modal-simple",
			name: "Open sample modal (simple)",
			callback: () => {
				new SampleModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "sample-editor-command",
			name: "Sample editor command",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection("Sample Editor Command");
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("click", evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000),
		);
	}

	onunload() {}

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

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
