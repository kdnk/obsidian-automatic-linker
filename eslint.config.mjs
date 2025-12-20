import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import { defineConfig } from "eslint/config"
import globals from "globals"
import stylistic from "@stylistic/eslint-plugin"

export default defineConfig([
    {
        ...stylistic.configs.customize({
            indent: 4,
            quotes: "double",
            semi: false,
        }),
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
            },
            parserOptions: {
                sourceType: "module",
            },
        },
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "no-prototype-builtins": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
    {
        ignores: [
            "node_modules/",
            "main.js",
            "src/main.js",
            "version-bump.mjs",
        ],
    },
])
