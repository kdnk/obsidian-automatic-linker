import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
    test: {
        includeSource: ["src/**/*.{js,ts}"],
        alias: {
            "obsidian": path.resolve(__dirname, "./src/__mocks__/obsidian.ts"),
        },
    },
})
