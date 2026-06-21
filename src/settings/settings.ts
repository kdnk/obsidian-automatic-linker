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
        if (key === "replaceUrlWithTitleIgnoreDomains") {
            await this.plugin.buildUrlTitleMap()
        }
        if (settingRefreshesIndex(key)) {
            this.plugin.refreshFileDataAndTrie()
        }
    }

    private parseTextValue<K extends keyof AutomaticLinkerSettings>(
        key: K,
        currentValue: AutomaticLinkerSettings[K],
        nextValue: string,
    ): AutomaticLinkerSettings[K] | null {
        if (typeof currentValue !== "number") {
            return nextValue as AutomaticLinkerSettings[K]
        }

        const parsedValue = parseInt(nextValue)
        if (isNaN(parsedValue)) {
            return null
        }
        if (key === "formatDelayMs" && parsedValue < 0) {
            return null
        }
        if (key === "aiMaxContext" && parsedValue <= 0) {
            return null
        }

        return parsedValue as AutomaticLinkerSettings[K]
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

        if (entry.control === "text") {
            setting.addText((text) => {
                text.setPlaceholder(entry.placeholder ?? "")
                    .setValue(String(value))
                    .onChange(async (nextValue) => {
                        const parsedValue = this.parseTextValue(
                            entry.key,
                            value,
                            nextValue,
                        )
                        if (parsedValue === null) {
                            return
                        }
                        await this.setSettingValue(entry.key, parsedValue)
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
            text.inputEl.rows = 4
            text.inputEl.cols = 50
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
