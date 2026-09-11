// Run with installed dependencies in all three checkouts and an independent
// CommonMark oracle: node scripts/check-formatter-content.mjs --oracle-root /path/to/oracle
// To prepare the oracle outside these repositories:
// npm install --prefix /path/to/oracle --no-save commonmark@0.31.2 js-yaml@4.1.0
// Optional: --prettier-root PATH --linter-root PATH --linter-settings PATH
// All source bundles, settings, file metadata and formatting remain in memory.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { build } from "esbuild"

process.env.TZ = "UTC"
const { values: args } = parseArgs({ options: {
    "prettier-root": { type: "string" },
    "linter-root": { type: "string" },
    "oracle-root": { type: "string" },
    "linter-settings": { type: "string" },
} })
const linkerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const prettierRoot = resolve(args["prettier-root"] ?? resolve(linkerRoot, "../obsidian-prettier-plugin"))
const linterRoot = resolve(args["linter-root"] ?? resolve(linkerRoot, "../obsidian-linter"))
const requireLinter = createRequire(resolve(linterRoot, "package.json"))
const requireOracle = createRequire(resolve(args["oracle-root"] ?? linterRoot, "oracle-loader.cjs"))
let CommonMark
let parseYaml
try {
    CommonMark = requireOracle("commonmark").Parser
    // js-yaml is also available through Linter's test dependencies.
    try {
        parseYaml = requireOracle("js-yaml").load
    }
    catch {
        parseYaml = requireLinter("js-yaml").load
    }
}
catch (error) {
    throw new Error("Install commonmark and js-yaml outside the repositories, then pass --oracle-root pointing to that directory.", { cause: error })
}

const moment = requireLinter("moment")
const obsidian = {
    moment,
    Modal: class {},
    AbstractInputSuggest: class {},
}

async function loadSource(root, contents, plugins = []) {
    const result = await build({
        absWorkingDir: root,
        stdin: { contents, resolveDir: root },
        bundle: true,
        write: false,
        format: "cjs",
        platform: "node",
        external: ["obsidian"],
        plugins,
    })
    const loaded = { exports: {} }
    const require = createRequire(resolve(root, "package.json"))
    new Function("module", "exports", "require", result.outputFiles[0].text)(
        loaded, loaded.exports, name => name === "obsidian" ? obsidian : require(name),
    )
    return loaded.exports
}

const linker = await loadSource(linkerRoot, `
    export {formatMarkdownDocument} from './src/formatting-run';
    export {DEFAULT_SETTINGS} from './src/settings/settings-info';
    export {buildCandidateTrie} from './src/trie';
`)
const prettier = await loadSource(prettierRoot, "export {formatMarkdown} from './src/format-markdown';")
const linter = await loadSource(linterRoot, `
    import './src/rules-registry';
    export {RulesRunner, createRunLinterRulesOptions} from './src/rules-runner';
    export {DEFAULT_SETTINGS} from './src/settings-data';
    export {rules, sortRules} from './src/rules';
`, [requireLinter("esbuild-plugin-import-glob").default()])
linter.sortRules()

// Enabled rules from the audit, with deterministic file times. An optional
// settings file replaces this profile without changing the file on disk.
const auditedRules = {
    "yaml-timestamp": {
        "date-created": true,
        "date-created-key": "created",
        "date-modified": true,
        "date-modified-key": "modified",
        "format": "YYYY-MM-DD-HHmmss",
        "date-created-source-of-truth": "file system",
        "date-modified-source-of-truth": "file system",
    },
    "footnote-after-punctuation": {},
    "move-footnotes-to-the-bottom": { "include-blank-line-between-footnotes": false },
    "re-index-footnotes": {},
    "remove-consecutive-list-markers": {},
    "remove-empty-list-markers": {},
    "remove-hyphenated-line-breaks": {},
    "compact-yaml": { "inner-new-lines": true },
    "consecutive-blank-lines": {},
    "empty-line-around-code-fences": {},
    "empty-line-around-math-blocks": {},
    "empty-line-around-tables": {},
    "heading-blank-lines": { "bottom": true, "empty-line-after-yaml": true },
    "line-break-at-document-end": {},
    "remove-empty-lines-between-list-markers-and-checklists": {},
    "remove-link-spacing": {},
    "remove-space-before-or-after-characters": {
        "characters-to-remove-space-before": ",!?;:).’”]",
        "characters-to-remove-space-after": "¿¡‘“([ ",
    },
    "space-after-list-markers": {},
    "space-between-chinese-japanese-or-korean-and-english-or-numbers": {
        "english-symbols-punctuation-before": "-+;:°%$)]",
        "english-symbols-punctuation-after": "-+([¥$",
    },
    "trailing-spaces": { "two-space-line-break": true },
    "remove-leftover-footnotes-from-quote-on-paste": {},
    "empty-line-around-horizontal-rules": {},
}
const supplied = args["linter-settings"]
    ? JSON.parse(await readFile(resolve(args["linter-settings"]), "utf8"))
    : { ruleConfigs: Object.fromEntries(Object.entries(auditedRules).map(([id, settings]) => [id, { enabled: true, ...settings }])) }
const legacySettings = { ...structuredClone(linter.DEFAULT_SETTINGS), ...supplied, ruleConfigs: {} }
for (const rule of linter.rules) {
    legacySettings.ruleConfigs[rule.alias] = { ...rule.getDefaultOptions(), ...supplied.ruleConfigs?.[rule.alias] }
}
// Both profiles intentionally exercise the originally hazardous options.
legacySettings.ruleConfigs["compact-yaml"] = {
    ...legacySettings.ruleConfigs["compact-yaml"], "enabled": true, "inner-new-lines": true,
}
legacySettings.ruleConfigs["remove-space-before-or-after-characters"] = {
    ...legacySettings.ruleConfigs["remove-space-before-or-after-characters"], "enabled": true, "characters-to-remove-space-after": "¿¡‘“([ ",
}
const conflictRule = "remove-empty-lines-between-list-markers-and-checklists"
legacySettings.ruleConfigs[conflictRule].enabled = true
const recommendedSettings = structuredClone(legacySettings)
recommendedSettings.ruleConfigs[conflictRule].enabled = false

const linkerSettings = { ...linker.DEFAULT_SETTINGS, replaceUrlWithTitle: false }
const candidateIndex = linker.buildCandidateTrie([{ path: "IntegrationTarget", aliases: null, scoped: false, exclude: false }], undefined, linkerSettings.ignoreCase)
const fixedTime = 1600000000000
const file = { path: "formatter-fixture.md", basename: "formatter-fixture", stat: { ctime: fixedTime, mtime: fixedTime } }

function frontmatter(text) {
    // Include the newline immediately before the closing marker: it belongs to
    // a keep-chomped scalar and excluding it would falsify the YAML oracle.
    const match = /^---\r?\n((?:[\s\S]*?\r?\n)?)---(?:\r?\n|$)/u.exec(text)
    return { values: match ? parseYaml(match[1]) ?? {} : {}, body: match ? text.slice(match[0].length) : text }
}

function semanticSnapshot(text) {
    const { values, body } = frontmatter(text)
    // Timestamp creation is intentional; all user-authored properties and all
    // block/list relationships must remain equal to the independent input parse.
    const { created: _created, modified: _modified, ...properties } = values
    const tree = new CommonMark().parse(body)
    const visit = (node) => {
        const result = { type: node.type }
        if (node.type === "list") {
            result.ordered = node.listType === "ordered"
            if (result.ordered) result.start = node.listStart
        }
        if (node.type === "code_block") {
            result.text = node.literal
            result.language = node.info
        }
        // Formatting may reflow inline prose or insert a wikilink. Compare block
        // structure, list ownership, and verbatim code, without requiring its
        // intentionally changed inline representation to stay byte-for-byte equal.
        if (!["paragraph", "heading", "code_block"].includes(node.type)) {
            result.children = []
            for (let child = node.firstChild; child; child = child.next) result.children.push(visit(child))
        }
        return result
    }
    return { properties, blocks: visit(tree) }
}

const fixtures = [
    { name: "list continuation", text: "- first\n\n  more\n\n- second\n" },
    { name: "nested code fence", text: "- root\n\t- child\n\t  ```js\n\t  const value = \"IntegrationTarget\";\n\t  ```\n\t- next\n", codes: ["const value = \"IntegrationTarget\";\n"] },
    { name: "ordered indented code", text: "1. root\n\n       const a = 1;\n       const b = 2;\n\n2. next\n", codes: ["const a = 1;\nconst b = 2;\n"] },
    { name: "nested ordered indented code", text: "- root\n  1. item\n\n         const value = 1;\n\n  2. next\n", codes: ["const value = 1;\n"] },
    {
        name: "literal and folded YAML",
        text: "---\n\nliteral: |\n  first\n\n  second\n\nfolded: >\n  first\n\n  second\n\nquoted: \"first\n\n  second\"\n\nplain: first\n\n  second\n\n---\n\nBody\n",
        properties: { literal: "first\n\nsecond\n", folded: "first\nsecond\n", quoted: "first\nsecond", plain: "first\nsecond" },
    },
    ...[
        ["|+", "first\n\nsecond\n\n\n"], [">+", "first\nsecond\n\n\n"],
        ["|-", "first\n\nsecond"], [">-", "first\nsecond"],
        ["|2+", "first\n\nsecond\n\n\n"], [">+2", "first\nsecond\n\n\n"],
    ].map(([style, value]) => ({ name: `YAML closing boundary ${style}`, text: `---\n\nvalue: ${style}\n  first\n\n  second\n\n\n---\n\nBody\n`, properties: { value } })),
    { name: "loose nested list", text: "- root\n\t- child\n\n\t  continued\n" },
    { name: "punctuation whitespace", text: "first 7 second ( spaced ) !\n" },
].map(fixture => ({
    ...fixture,
    // Existing metadata avoids conflating content regressions with first-time
    // timestamp creation. The real timestamp rule still runs on every pass.
    text: (fixture.text.startsWith("---\n") ? "" : "---\ncreated: 2020-09-13-122640\nmodified: 2020-09-13-122640\n---\n\n")
        + fixture.text + "\nIntegrationTarget\n",
}))

async function stages(text, options, settings, runner) {
    const linked = linker.formatMarkdownDocument({ content: text, filePath: file.path, settings: linkerSettings, candidateIndex })
    const formatted = await prettier.formatMarkdown(linked, options)
    const lintOptions = linter.createRunLinterRulesOptions(formatted, file, "en", settings, new Map())
    lintOptions.getCurrentTime = () => moment(fixedTime)
    const linted = runner.lintText(lintOptions)
    return [linked, formatted, linted]
}

const stageNames = ["Automatic Linker", "Prettier", "Linter"]
const codeValues = node => node.type === "code_block" ? [node.text] : (node.children ?? []).flatMap(codeValues)
let stageChecks = 0
for (const options of [
    { useTabs: false, tabWidth: 2 }, { useTabs: false, tabWidth: 4 },
    { useTabs: true, tabWidth: 2 }, { useTabs: true, tabWidth: 4 },
]) {
    for (const fixture of fixtures) {
        const baseline = semanticSnapshot(fixture.text)
        if (fixture.codes) assert.deepEqual(codeValues(baseline.blocks), fixture.codes, `${fixture.name}: input must contain the expected code`)
        if (fixture.properties) assert.deepEqual(baseline.properties, fixture.properties, `${fixture.name}: input oracle must retain all scalar newlines`)
        const runner = new linter.RulesRunner()
        let text = fixture.text
        for (let pass = 0; pass < 5; pass++) {
            const results = await stages(text, options, recommendedSettings, runner)
            for (let stage = 0; stage < results.length; stage++) {
                const label = `${fixture.name}, ${JSON.stringify(options)}, pass ${pass + 1}, ${stageNames[stage]}`
                assert.deepEqual(semanticSnapshot(results[stage]), baseline, `${label}: Markdown structure/code or YAML values changed`)
                // Linter can introduce fence spacing on save 1, which Prettier
                // canonicalizes on save 2. Saves 3–5 must perform no stage edits.
                if (pass >= 2) assert.equal(results[stage], stage === 0 ? text : results[stage - 1], `${label}: intermediate edits recurred`)
                stageChecks++
            }
            assert.ok(results[0].includes("[[IntegrationTarget]]"), "Automatic Linker's real link replacement must run")
            text = results.at(-1)
        }
        if (fixture.name === "punctuation whitespace") assert.ok(text.includes("first 7 second (spaced)!"))
    }
}
console.log(`PASS: ${fixtures.length} fixtures × four indentation options × five saves; ${stageChecks} independent stage checks and every stage unchanged on saves 3–5 with the recommended profile`)

// Demonstrate why final-text equality alone cannot validate the save pipeline.
const churnFixture = fixtures.find(fixture => fixture.name === "loose nested list")
const churnBaseline = semanticSnapshot(churnFixture.text)
const runner = new linter.RulesRunner()
let text = churnFixture.text
let firstFinal
for (let pass = 0; pass < 5; pass++) {
    const [linked, formatted, linted] = await stages(text, { useTabs: true, tabWidth: 4 }, legacySettings, runner)
    for (const result of [linked, formatted, linted]) assert.deepEqual(semanticSnapshot(result), churnBaseline)
    if (pass > 0) {
        assert.equal(linked, text)
        assert.notEqual(formatted, linked, "Legacy profile must reproduce Prettier adding a blank line")
        assert.notEqual(linted, formatted, "Legacy profile must reproduce Linter removing that blank line")
        assert.equal(linted, firstFinal, "Identical final text must still hide intermediate churn")
    }
    firstFinal ??= linted
    text = linted
}
console.log(`PASS: enabling ${conflictRule} reproduces intermediate changes on all four subsequent saves despite identical final text`)
