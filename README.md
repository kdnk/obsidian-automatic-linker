# 🪄 Automatic Linker 🔮

Automatically convert plain text file references into Obsidian wiki links as you write. Keep your knowledge graph connected without manual linking.

## Overview

Automatic Linker scans your notes and intelligently converts text that matches file names in your vault into wiki links (`[[...]]`). Whether you're writing quick notes or maintaining a complex knowledge base, this plugin ensures your notes stay interconnected without interrupting your flow.

## Installation

### From Obsidian Community Plugins

1. Open Settings → Community plugins
2. Disable Safe mode
3. Browse for "Automatic Linker"
4. Click Install, then Enable

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/kdnk/obsidian-automatic-linker/releases)
2. Extract `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/automatic-linker/` directory
3. Reload Obsidian and enable the plugin in Settings → Community plugins

## Key Features

### Automatic Link Conversion

The plugin automatically detects file names in your text and converts them to wiki links. It works seamlessly with:

- **Format on Save**: Automatically convert links when saving files
- **Selected Text**: Convert only highlighted text via command palette
- **Entire Vault**: Batch process all files in your vault at once
- **CJK Support**: Full support for Japanese, Chinese, Korean, and other CJK languages
- **Case Sensitivity**: Optional case-insensitive matching

### Smart Namespace Management

Organize large vaults with sophisticated namespace handling:

- **Base Directory**: Define a base directory (e.g., `pages/`) where the prefix is omitted from links
- **Namespace Resolution**: Automatically resolve shorthand links to their full namespaced paths
- **Namespace Restriction**: Use `automatic-linker-scoped: true` in frontmatter to restrict linking to files within the same namespace
- **Closest Match Selection**: When multiple candidates exist, the plugin selects the file closest to your current note

### URL Formatting

Transform raw URLs into readable Markdown links automatically:

- **GitHub URLs**: Convert `https://github.com/user/repo/issues/123` to `[user/repo#123](URL)`
- **GitHub Enterprise**: Configure custom GitHub Enterprise domains
- **Jira URLs**: Format Jira issue links with custom domain support
- **Linear URLs**: Format Linear issue links
- **Page Titles**: Fetch and replace bare URLs with `[Page Title](URL)` format (cached to minimize requests)

### Advanced Link Control

Fine-tune linking behavior to match your workflow:

- **Alias Support**: Reference files by any of their frontmatter aliases
- **Prevent Linking**: Add `automatic-linker-exclude: true` to frontmatter to exclude files from auto-linking
- **Prevent Self-Linking**: Avoid creating links from a file to itself
- **Remove Aliases**: Automatically strip aliases in specified directories
- **Month Note Handling**: Ignore single/double digit references (1, 01, 12) unless namespaced
- **Date Format Ignoring**: Skip date-formatted text (e.g., `2025-02-10`) for compatibility with Obsidian Tasks

### Quality of Life Features

- **Exclude Directories**: Prevent auto-linking in specified folders
- **Preserve Existing Links**: Never reformats already-linked text
- **Copy Without Links**: Copy note content with wiki links converted back to plain text
- **Copy Selection Without Links**: Copy selected lines with minimal indentation and wiki links removed (supports path-style links like `[[path/to/file]]`)
- **Debug Mode**: Detailed logging for troubleshooting
- **Load Notices**: Optional notifications when files are processed

## Commands

Access these commands via the Command Palette (Cmd/Ctrl + P):

| Command | Description |
|---------|-------------|
| **Automatic Linker: Format file** | Convert text to links in the current file |
| **Automatic Linker: Format selection** | Convert only selected text to links |
| **Automatic Linker: Format vault** | Batch process all files in your vault |
| **Automatic Linker: Copy file without links** | Copy current file content with links as plain text |
| **Automatic Linker: Copy selection without links** | Copy selected lines with minimal indent and links removed |
| **Automatic Linker: Rebuild index** | Rebuild the file index for link candidates |

## Configuration

### General Settings

- **Format on Save**: Enable automatic linking when saving files
- **Format Delay**: Delay in milliseconds before formatting (useful for plugin integration)
- **Base Directory**: Root directory for namespace handling (e.g., `pages`)

### Link Behavior

- **Consider Aliases**: Include frontmatter aliases when matching text
- **Namespace Resolution**: Automatically resolve shorthand to full namespaced links
- **Ignore Case**: Enable case-insensitive link matching
- **Prevent Self-Linking**: Don't create links from a file to itself
- **Ignore Date Formats**: Skip date-formatted text like `2025-02-10`

### URL Formatting

- **Format GitHub URLs**: Convert GitHub links to readable format
- **GitHub Enterprise URLs**: Add custom GitHub Enterprise domains
- **Format Jira URLs**: Convert Jira issue links
- **Jira URLs**: Configure Jira domain(s)
- **Format Linear URLs**: Convert Linear issue links

### Advanced Options

- **Replace URLs with Titles**: Automatically fetch page titles for bare URLs
- **Ignored Domains**: Exclude specific domains from URL title replacement
- **Exclude Directories**: List of directories to skip during auto-linking
- **Remove Alias in Directories**: Strip aliases from links in specified folders

### Integration

- **Run Obsidian Linter After Formatting**: Chain with Obsidian Linter plugin
- **Run Prettier After Formatting**: Chain with Prettier plugin
- **Show Load Notice**: Display notifications when files are loaded
- **Debug Mode**: Enable verbose logging

## Usage Examples

### Example 1: Basic Linking

You have files: `Python.md`, `JavaScript.md`, `pages/TypeScript.md`

When you type:
```
I'm learning Python and JavaScript for web development.
```

It becomes:
```
I'm learning [[Python]] and [[JavaScript]] for web development.
```

### Example 2: Namespace Resolution

With `baseDir: "pages"` and namespace resolution enabled:

File structure:
```
pages/
  languages/
    Python.md
    TypeScript.md
  frameworks/
    React.md
```

Current file: `pages/frameworks/React.md`

When you type: `React uses TypeScript`

It becomes: `[[frameworks/React]] uses [[languages/TypeScript]]`

### Example 3: Namespace Restriction

File `pages/team-a/internal.md` has frontmatter:
```yaml
---
automatic-linker-scoped: true
---
```

Current file: `pages/team-a/notes.md`

Typing `internal` creates `[[team-a/internal]]` ✅

From `pages/team-b/notes.md`, typing `internal` won't link ❌

### Example 4: URL Formatting

Before:
```
Check out https://github.com/obsidianmd/obsidian-releases/issues/1234
```

After:
```
Check out [obsidianmd/obsidian-releases#1234](https://github.com/obsidianmd/obsidian-releases/issues/1234)
```

### Example 5: Copy Selection Without Links

When you select part of a nested list:

Selection in editor:
```
    - Priority about [[PBI]]
        - High priority for near deadline
    - Chapter [[PBI]]
        - Up to 30% [[story point]] in sprint backlog
```

After running "Copy selection without links", clipboard contains:
```
- Priority about PBI
	- High priority for near deadline
- Chapter PBI
	- Up to 30% story point in sprint backlog
```

Features:
- Removes minimal indentation from selected lines
- Converts path-style links: `[[path/to/file]]` → `file`
- Preserves relative indentation structure
- Gets full lines even if partially selected

## Integration with Obsidian Linter

To avoid conflicts when using both plugins:

1. **Disable** "Lint on Save" in Obsidian Linter settings
2. **Enable** "Format on Save" in Automatic Linker settings
3. **Enable** "Run Obsidian Linter after formatting" in Automatic Linker settings

This ensures Automatic Linker runs first, followed by Linter.

## Frontmatter Options

Add these to individual note frontmatter:

```yaml
---
# Disable automatic linking in this file
automatic-linker-off: true

# Exclude this file from being automatically linked from other files
automatic-linker-exclude: true

# Restrict linking to same namespace only
automatic-linker-scoped: true

# Define aliases for this file (standard Obsidian feature)
aliases: [shortname, alternative-name]
---
```

## Development

### Prerequisites

- Node.js 16+
- pnpm (or npm)

### Setup

```bash
# Clone the repository
git clone https://github.com/kdnk/obsidian-automatic-linker.git
cd obsidian-automatic-linker

# Install dependencies
pnpm install

# Start development mode
pnpm dev
```

### Available Commands

```bash
pnpm build              # Build for production
pnpm dev                # Development mode with watch
pnpm test               # Run all tests
pnpm test:watch         # Run tests in watch mode
pnpm tsc:watch          # TypeScript type checking in watch mode
```

### Running Specific Tests

```bash
# Run a specific test file
npx vitest run src/path/to/test.ts

# Run tests matching a pattern
npx vitest run -t "test description"
```

### Project Structure

```
src/
├── main.ts                    # Main plugin entry point
├── settings/                  # Settings UI and types
├── replace-links/             # Core link replacement logic
├── replace-urls/              # URL formatting (GitHub, Jira, Linear)
├── replace-url-with-title/    # Bare URL to titled link conversion
├── exclude-links/             # Link exclusion logic
├── remove-minimal-indent/     # Remove minimal indentation from text
├── trie.ts                    # Trie data structure for efficient matching
└── update-editor.ts           # Editor update utilities
```

## Performance

The plugin uses a Trie data structure for efficient file name matching, making it performant even with thousands of files. Link conversion is optimized to handle large vaults without noticeable lag.

## Known Limitations

- URL title fetching requires network access and may be slow for many URLs
- Namespace resolution requires files to be indexed (restart may be needed after adding many files)
- Alias consideration requires plugin restart when toggled in settings

## Troubleshooting

**Links aren't being created:**
- Ensure "Format on Save" is enabled or manually trigger the command
- Verify the file isn't in an excluded directory

**Namespace resolution not working:**
- Ensure "Namespace Resolution" is enabled in settings
- Restart Obsidian after changing base directory settings
- Check that files are within the configured base directory

**Conflicts with Obsidian Linter:**
- Follow the integration guide above to run plugins in sequence

**Performance issues:**
- Disable debug mode if enabled
- Consider excluding large directories from auto-linking
- Increase format delay if formatting happens too frequently

## Credits

- `updateEditor` function adapted from [obsidian-linter](https://github.com/platers/obsidian-linter)

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Author

**Kodai Nakamura**

## Support

- [GitHub Issues](https://github.com/kdnk/obsidian-automatic-linker/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/kdnk/obsidian-automatic-linker/discussions) - Questions and community support

---

If you find this plugin useful, consider starring the repository on GitHub!
