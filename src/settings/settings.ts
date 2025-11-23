import { App, PluginSettingTab, Setting } from "obsidian";
import AutomaticLinkerPlugin from "../main";

export class AutomaticLinkerPluginSettingsTab extends PluginSettingTab {
	plugin: AutomaticLinkerPlugin;
	constructor(app: App, plugin: AutomaticLinkerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("General").setHeading();

		// Toggle for "Format on Save" setting.
		new Setting(containerEl)
			.setName("Format on save")
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

		// Toggle for "Format on save for a current line" setting.
		new Setting(containerEl)
			.setName("Format on save for a current line")
			.setDesc(
				"When enabled, the current line will be formatted (links replaced) when saving. If you enable this, the 'Format on save' setting will be ignored for the current line.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.formatOnSaveCurrentLine)
					.onChange(async (value) => {
						this.plugin.settings.formatOnSaveCurrentLine = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Setting for base directories.
		new Setting(containerEl)
			.setName("Base directory")
			.setDesc(
				"Enter the directory to be treated as the base directory. For example, 'pages' will allow links to be formatted without the 'pages/' prefix. If you want to achieve more complex behavior, consider using Obsidian Linter Plugin.",
			)
			.addText((text) => {
				text.setPlaceholder("e.g. pages\n")
					.setValue(this.plugin.settings.baseDir)
					.onChange(async (value) => {
						this.plugin.settings.baseDir = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Setting for minimum character count.
		// If the text is below this number of characters, links will not be replaced.
		new Setting(containerEl)
			.setName("Minimum character count")
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
			.setName("Consider aliases")
			.setDesc(
				"When enabled, aliases will be taken into account when processing links. Note: A restart is required for changes to take effect.",
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
			.setName("Automatic namespace resolution")
			.setDesc(
				"When enabled, the plugin will automatically resolve namespaces for shorthand links. If multiple candidates share the same shorthand, the candidate with the most common path segments relative to the current file will be selected.",
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
			.setName("Ignore date formats")
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

		// Toggle for ignoring case in link matching
		new Setting(containerEl)
			.setName("Ignore case")
			.setDesc(
				"When enabled, link matching will be case-insensitive. The original case of the text will be preserved in the link.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.ignoreCase)
					.onChange(async (value) => {
						this.plugin.settings.ignoreCase = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Add excluding dirs that you wish to exclude from the automatic linking
		new Setting(containerEl)
			.setName("Exclude directories from automatic linking")
			.setDesc(
				"Directories to be excluded from automatic linking, one per line (e.g. 'Templates')",
			)
			.addTextArea((text) => {
				text.setPlaceholder("Templates\nArchive")
					.setValue(
						this.plugin.settings.excludeDirsFromAutoLinking.join(
							"\n",
						),
					)
					.onChange(async (value) => {
						// Split by newlines and filter out empty lines
						const dirs = value
							.split("\n")
							.map((dir) => dir.trim())
							.filter(Boolean);
						this.plugin.settings.excludeDirsFromAutoLinking = dirs;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		new Setting(containerEl)
			.setName("URL Formatting for GitHub")
			.setHeading();

		// Toggle for formatting GitHub URLs on save
		new Setting(containerEl)
			.setName("Format GitHub URLs on save")
			.setDesc(
				"When enabled, GitHub URLs will be formatted when saving the file.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.formatGitHubURLs)
					.onChange(async (value) => {
						this.plugin.settings.formatGitHubURLs = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Add GitHub Enterprise URLs setting
		new Setting(containerEl)
			.setName("GitHub Enterprise URLs")
			.setDesc(
				"Add your GitHub Enterprise URLs, one per line (e.g. github.enterprise.com)",
			)
			.addTextArea((text) => {
				text.setPlaceholder("github.enterprise.com\ngithub.company.com")
					.setValue(
						this.plugin.settings.githubEnterpriseURLs.join("\n"),
					)
					.onChange(async (value) => {
						// Split by newlines and filter out empty lines
						const urls = value
							.split("\n")
							.map((url) => url.trim())
							.filter(Boolean);
						this.plugin.settings.githubEnterpriseURLs = urls;
						await this.plugin.saveData(this.plugin.settings);
					});
				// Make the text area taller
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
			});

		new Setting(containerEl)
			.setName("URL Formatting for Jira")
			.setHeading();

		// Toggle for formatting JIRA URLs on save
		new Setting(containerEl)
			.setName("Format JIRA URLs on save")
			.setDesc(
				"When enabled, JIRA URLs will be formatted when saving the file.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.formatJiraURLs)
					.onChange(async (value) => {
						this.plugin.settings.formatJiraURLs = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Add JIRA URLs setting
		new Setting(containerEl)
			.setName("JIRA URLs")
			.setDesc(
				"Add your JIRA URLs, one per line (e.g. jira.enterprise.com)",
			)
			.addTextArea((text) => {
				text.setPlaceholder("jira.enterprise.com\njira.company.com")
					.setValue(this.plugin.settings.jiraURLs.join("\n"))
					.onChange(async (value) => {
						// Split by newlines and filter out empty lines
						const urls = value
							.split("\n")
							.map((url) => url.trim())
							.filter(Boolean);
						this.plugin.settings.jiraURLs = urls;
						await this.plugin.saveData(this.plugin.settings);
					});
				// Make the text area taller
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
			});

		new Setting(containerEl)
			.setName("URL Replacement with Title")
			.setHeading();

		// Toggle for replacing URLs with titles
		new Setting(containerEl)
			.setName("Replace URL with title")
			.setDesc(
				"When enabled, raw URLs will be replaced with [Page Title](URL). Requires fetching the URL content.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.replaceUrlWithTitle)
					.onChange(async (value) => {
						this.plugin.settings.replaceUrlWithTitle = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		new Setting(containerEl)
			.setName("Igonre domains")
			.setDesc(
				"Ignore domains for replacing URLs with titles, one per line (e.g. x.com)",
			)
			.addTextArea((text) => {
				text.setPlaceholder("")
					.setValue(
						this.plugin.settings.replaceUrlWithTitleIgnoreDomains.join(
							"\n",
						),
					)
					.onChange(async (value) => {
						// Split by newlines and filter out empty lines
						const urls = value
							.split("\n")
							.map((url) => url.trim())
							.filter(Boolean);
						this.plugin.settings.replaceUrlWithTitleIgnoreDomains =
							urls;
						await this.plugin.saveData(this.plugin.settings);
					});
				// Make the text area taller
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
			});

		new Setting(containerEl).setName("Debug").setHeading();

		// Toggle for showing the load notice.
		new Setting(containerEl)
			.setName("Show load notice")
			.setDesc("Display a notice when markdown files are loaded.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showNotice)
					.onChange(async (value) => {
						this.plugin.settings.showNotice = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});

		// Toggle for debug logging
		new Setting(containerEl)
			.setName("Debug mode")
			.setDesc(
				"When enabled, debug information will be logged to the console.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveData(this.plugin.settings);
					});
			});
	}
}
