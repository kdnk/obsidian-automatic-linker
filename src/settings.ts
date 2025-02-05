import { PluginSettingTab, App, Setting } from "obsidian";
import AutomaticLinkerPlugin from "./main";

export type AutomaticLinkerSettings = {
	formatOnSave: boolean;
	baseDirs: string[];
	showNotice: boolean;
	minCharCount: number; // Minimum character count setting
	considerAliases: boolean; // Consider aliases when linking
};

export const DEFAULT_SETTINGS: AutomaticLinkerSettings = {
	formatOnSave: false,
	baseDirs: ["pages"],
	showNotice: false,
	minCharCount: 0, // Default value: 0 (always replace links)
	considerAliases: false, // Default: do not consider aliases
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
			.setName("Base Directories")
			.setDesc(
				"Enter directories (one per line) that should be treated as base. For example, 'pages' will allow links to be formatted without the 'pages/' prefix.",
			)
			.addTextArea((text) => {
				text.setPlaceholder("e.g. pages\n")
					.setValue(this.plugin.settings.baseDirs.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.baseDirs = value
							.split(/\r?\n/)
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
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
				"When enabled, aliases will be taken into account when processing links.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.considerAliases)
					.onChange(async (value) => {
						this.plugin.settings.considerAliases = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});
	}
}
