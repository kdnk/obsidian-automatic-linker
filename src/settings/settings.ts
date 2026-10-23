import { App, PluginSettingTab, Setting, SettingDefinitionGroup } from "obsidian"
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

    private renderSetting(setting: Setting, entry: SettingCatalogEntry) {
        setting.setName(entry.name).setDesc(entry.description)
        const value = this.plugin.settings[entry.key]

        if (entry.control === "toggle") {
            setting.addToggle((toggle) => {
                toggle
                    .setValue(Boolean(value))
                    .onChange(async (nextValue) => {
                        await this.setSettingValue(entry.key, nextValue)
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
                            .filter(Boolean),
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

    getSettingDefinitions(): SettingDefinitionGroup[] {
        const groups = new Map<string, SettingDefinitionGroup>()
        for (const entry of SETTINGS_CATALOG) {
            let group = groups.get(entry.group)
            if (!group) {
                group = { type: "group", heading: entry.group, items: [] }
                groups.set(entry.group, group)
            }
            group.items?.push({
                name: entry.name,
                desc: entry.description,
                render: setting => this.renderSetting(setting, entry),
            })
        }
        return [...groups.values()]
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
            this.renderSetting(new Setting(containerEl), entry)
        }
    }
}
