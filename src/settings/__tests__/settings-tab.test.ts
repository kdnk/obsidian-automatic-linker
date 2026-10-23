import { describe, expect, it, vi } from "vitest"
import { App, Setting, SettingGroup } from "obsidian"
import AutomaticLinkerPlugin from "../../main"
import { AutomaticLinkerPluginSettingsTab } from "../settings"
import { DEFAULT_SETTINGS, SETTINGS_CATALOG } from "../settings-catalog"

vi.mock("obsidian", () => ({
    PluginSettingTab: class {},
}))

function createTab() {
    const plugin = {
        settings: { ...DEFAULT_SETTINGS },
        saveData: vi.fn().mockResolvedValue(undefined),
        refreshFileDataAndTrie: vi.fn(),
    }
    const tab = new AutomaticLinkerPluginSettingsTab({} as App, plugin as unknown as AutomaticLinkerPlugin)
    return { tab, plugin }
}

function createSetting() {
    let onToggleChange: (value: boolean) => Promise<void> = async () => {}
    let onTextChange: (value: string) => Promise<void> = async () => {}
    const toggle = {
        setValue: vi.fn().mockReturnThis(),
        onChange: vi.fn((callback: typeof onToggleChange) => {
            onToggleChange = callback
            return toggle
        }),
    }
    const text = {
        inputEl: { rows: 0, cols: 0 },
        setPlaceholder: vi.fn().mockReturnThis(),
        setValue: vi.fn().mockReturnThis(),
        onChange: vi.fn((callback: typeof onTextChange) => {
            onTextChange = callback
            return text
        }),
    }
    const setting = {
        setName: vi.fn().mockReturnThis(),
        setDesc: vi.fn().mockReturnThis(),
        addToggle: vi.fn(callback => callback(toggle)),
        addTextArea: vi.fn(callback => callback(text)),
    }
    return {
        setting: setting as unknown as Setting,
        toggle,
        text,
        changeToggle: (value: boolean) => onToggleChange(value),
        changeText: (value: string) => onTextChange(value),
    }
}

describe("settings search definitions", () => {
    it("exposes every catalog entry in its display group with searchable text", () => {
        const { tab } = createTab()
        const groups = tab.getSettingDefinitions()
        expect(groups.map(group => group.heading)).toEqual([...new Set(SETTINGS_CATALOG.map(entry => entry.group))])
        expect(groups.flatMap(group => group.items ?? []).map(item => ({ name: item.name, desc: item.desc })))
            .toEqual(SETTINGS_CATALOG.map(entry => ({ name: entry.name, desc: entry.description })))
    })

    it("persists toggle changes and refreshes the index", async () => {
        const { tab, plugin } = createTab()
        const definition = tab.getSettingDefinitions().flatMap(group => group.items ?? [])
            .find(item => item.name === "Include aliases")
        const control = createSetting()
        if (!definition || !("render" in definition) || !definition.render) throw new Error("Missing render callback")
        definition.render(control.setting, {} as SettingGroup)
        expect(control.toggle.setValue).toHaveBeenCalledWith(true)
        await control.changeToggle(false)
        expect(plugin.settings.includeAliases).toBe(false)
        expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings)
        expect(plugin.refreshFileDataAndTrie).toHaveBeenCalledOnce()
    })

    it("preserves textarea sizing and persists trimmed lists without refreshing the index", async () => {
        const { tab, plugin } = createTab()
        plugin.settings.githubEnterpriseURLs = ["old.example.com"]
        const definition = tab.getSettingDefinitions().flatMap(group => group.items ?? [])
            .find(item => item.name === "GitHub Enterprise URLs")
        const control = createSetting()
        if (!definition || !("render" in definition) || !definition.render) throw new Error("Missing render callback")
        definition.render(control.setting, {} as SettingGroup)
        expect(control.text.setValue).toHaveBeenCalledWith("old.example.com")
        expect(control.text.inputEl).toEqual({ rows: 4, cols: 50 })
        await control.changeText(" github.example.com \n\n second.example.com ")
        expect(plugin.settings.githubEnterpriseURLs).toEqual(["github.example.com", "second.example.com"])
        expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings)
        expect(plugin.refreshFileDataAndTrie).not.toHaveBeenCalled()
    })
})
