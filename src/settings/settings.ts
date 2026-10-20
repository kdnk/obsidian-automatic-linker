import { App, PluginSettingTab, Setting } from "obsidian"
import AutomaticLinkerPlugin from "../main"
import {
    AutomaticLinkerSettings,
    SETTINGS_CATALOG,
    SettingCatalogEntry,
    settingRefreshesIndex,
} from "./settings-catalog"

export class AutomaticLinkerPluginSettingsTab extends PluginSettingTab {
    plugin: AutomaticLinkerPlugin
    constructor(app: App, plugin: AutomaticLinkerPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    private async setSettingValue<K extends keyof AutomaticLinkerSettings>(
        key: K,
        value: AutomaticLinkerSettings[K],
    ) {
        this.plugin.settings[key] = value
        await this.plugin.saveData(this.plugin.settings)
        if (settingRefreshesIndex(key)) {
            this.plugin.refreshFileDataAndTrie()
        }
    }

    private renderSetting(containerEl: HTMLElement, entry: SettingCatalogEntry) {
        const setting = new Setting(containerEl)
            .setName(entry.name)
            .setDesc(entry.description)
        const value = this.plugin.settings[entry.key]

        if (entry.control === "toggle") {
            setting.addToggle((toggle) => {
                toggle
                    .setValue(Boolean(value))
                    .onChange(async (nextValue) => {
                        await this.setSettingValue(entry.key, nextValue as never)
                    })
            })
            return
        }

        setting.addTextArea((text) => {
            text.setPlaceholder(entry.placeholder ?? "")
                .setValue(Array.isArray(value) ? value.join("\n") : String(value))
                .onChange(async (nextValue) => {
                    await this.setSettingValue(
                        entry.key,
                        nextValue
                            .split("\n")
                            .map(item => item.trim())
                            .filter(Boolean) as never,
                    )
                })
            if (entry.rows !== undefined) {
                text.inputEl.rows = entry.rows
            }
            if (entry.cols !== undefined) {
                text.inputEl.cols = entry.cols
            }
        })
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        const renderedGroups = new Set<string>()
        for (const entry of SETTINGS_CATALOG) {
            if (!renderedGroups.has(entry.group)) {
                new Setting(containerEl).setName(entry.group).setHeading()
                renderedGroups.add(entry.group)
            }
            this.renderSetting(containerEl, entry)
        }
    }
}
