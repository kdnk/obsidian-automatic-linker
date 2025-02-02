import { PluginSettingTab, App, Setting } from "obsidian";
import AutomaticLinkerPlugin from "./main";

export type AutomaticLinkerSettings = {
	formatOnSave: boolean;
	// List of directories to treat as special.
	specialDirs: string[];
};

export const DEFAULT_SETTINGS: AutomaticLinkerSettings = {
	formatOnSave: false,
	// Default special directories: links can be formatted without the prefix.
	specialDirs: ["pages"],
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

		// Text area for configuring Special Directories.
		new Setting(containerEl)
			.setName("Special Directories")
			.setDesc(
				"Enter directories (one per line) that should be treated as special. For example, 'pages' will allow links to be formatted without the 'pages/' prefix.",
			)
			.addTextArea((text) => {
				text.setPlaceholder("e.g. pages\n")
					.setValue(this.plugin.settings.specialDirs.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.specialDirs = value
							.split(/\r?\n/)
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveData(this.plugin.settings);
					});
			});
	}
}
