import { PluginSettingTab, App, Setting } from "obsidian";
import AutomaticLinkerPlugin from "./main";

export type AutomaticLinkerSettings = {
	formatOnSave: boolean;
	baseDir: string;
	showNotice: boolean;
	minCharCount: number; // Minimum character count setting
	considerAliases: boolean; // Consider aliases when linking
	namespaceResolution: boolean; // Automatically resolve namespaces for shorthand links
	ignoreDateFormats: boolean; // Ignore date formatted links (e.g. 2025-02-10)
};

export const DEFAULT_SETTINGS: AutomaticLinkerSettings = {
	formatOnSave: false,
	baseDir: "pages",
	showNotice: false,
	minCharCount: 0, // Default value: 0 (always replace links)
	considerAliases: false, // Default: do not consider aliases
	namespaceResolution: false, // Default: disable automatic namespace resolution
	ignoreDateFormats: true, // Default: ignore date formats (e.g. 2025-02-10)
};

export class AutomaticLinkerPluginSettingsTab extends PluginSettingTab {
	plugin: AutomaticLinkerPlugin;
	constructor(app: App, plugin: AutomaticLinkerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Toggle for "Format on Save" setting.
		new Setting(containerEl)
			.setName("Format on Save")
			.setDesc(
				"When enabled, the file will be automatically formatted (links replaced) when saving.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.formatOnSave)
					.onChange(async (value) => {
						this.plugin.settings.formatOnSave = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Setting for base directories.
		new Setting(containerEl)
			.setName("Base Directory")
			.setDesc(
				"Enter directory that should be treated as base. For example, 'pages' will allow links to be formatted without the 'pages/' prefix.",
			)
			.addText((text) => {
				text.setPlaceholder("e.g. pages\n")
					.setValue(this.plugin.settings.baseDir)
					.onChange(async (value) => {
						this.plugin.settings.baseDir = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Toggle for showing the load notice.
		new Setting(containerEl)
			.setName("Show Load Notice")
			.setDesc("Display a notice when markdown files are loaded.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showNotice)
					.onChange(async (value) => {
						this.plugin.settings.showNotice = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Setting for minimum character count.
		// If the text is below this number of characters, links will not be replaced.
		new Setting(containerEl)
			.setName("Minimum Character Count")
			.setDesc(
				"If the content is below this character count, the links will not be replaced.",
			)
			.addText((text) => {
				text.setPlaceholder("e.g. 4")
					.setValue(this.plugin.settings.minCharCount.toString())
					.onChange(async (value) => {
						const parsedValue = parseInt(value);
						if (!isNaN(parsedValue)) {
							this.plugin.settings.minCharCount = parsedValue;
							await this.plugin.saveData(this.plugin.settings);
						}
					});
			});

		// Toggle for considering aliases.
		new Setting(containerEl)
			.setName("Consider Aliases")
			.setDesc(
				"When enabled, aliases will be taken into account when processing links. !!! Restart required for changes to take effect.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.considerAliases)
					.onChange(async (value) => {
						this.plugin.settings.considerAliases = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Toggle for automatic namespace resolution.
		new Setting(containerEl)
			.setName("Automatic Namespace Resolution")
			.setDesc(
				"When enabled, the plugin will automatically resolve namespaces for shorthand links. If multiple candidates share the same shorthand, the candidate whose full path is closest to the current file (i.e. shares the most common path segments) will be selected.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.namespaceResolution)
					.onChange(async (value) => {
						this.plugin.settings.namespaceResolution = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Toggle for ignoring date formats.
		new Setting(containerEl)
			.setName("Ignore Date Formats")
			.setDesc(
				"When enabled, links that match date formats (e.g. 2025-02-10) will be ignored. This helps maintain compatibility with Obsidian Tasks.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.ignoreDateFormats)
					.onChange(async (value) => {
						this.plugin.settings.ignoreDateFormats = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});
	}
}
