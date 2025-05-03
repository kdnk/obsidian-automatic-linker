# 🤖 Automatic Linker 🔗

Automatic Linker Plugin automatically converts plain text file references into Obsidian wiki links (i.e. `[[...]]`) based on the file names in your vault. It can also automatically format links when saving a file and allows you to configure base directories that are treated differently.

## Features

- **Automatic Link Conversion:**
  The plugin scans your file for text that matches file names in your vault and converts them into wiki links by wrapping them in `[[ ]]`.

- **Format on Save:**
  Optionally, the plugin can automatically format (i.e. convert links) when you save a file.

- **Link Selected Text:**
  Convert only selected text into links using the command palette or hotkeys.

- **Copy Without Links:**
  Copy the content of the current file to clipboard with wiki links converted back to plain text, preserving aliases.

- **GitHub URL Formatting:**
  Automatically formats GitHub URLs to a more readable format. Also supports GitHub Enterprise URLs that you can configure in the settings.

- **Jira URL Formatting:**
  Automatically formats Jira URLs to a more readable format. You can configure multiple Jira domains in the settings.

- **Configurable Base Directories and Effective Namespace Handling:**
  Specify one or more directories (e.g. `pages`) that are treated as base. For files in these directories, the directory prefix is omitted when linking. The plugin treats the folder immediately under each base directory as the effective namespace. When resolving links, the candidate file's effective namespace (derived from its path relative to the base directory) is compared to that of the current file to determine if linking should occur when namespace restriction is enabled.

- **Automatic Namespace Resolution:**
  When enabled, the plugin automatically resolves shorthand links to their full namespaced candidates. If multiple candidates share the same shorthand (for example, `namespace1/link` and `namespace2/subnamespace/link`), the candidate whose full path is closest to the current file — i.e. shares the most common path segments or has the shallowest relative depth when the current file is in a base directory — is selected. Additionally, if a candidate file is marked with `automatic-linker-restrict-namespace` in its frontmatter, link conversion occurs only if its effective namespace matches that of the current file. For example, if your current file is located in `pages/set/` and a candidate file in `pages/set/x` has namespace restriction enabled, typing `x` will be converted to `[[set/x]]`, whereas a candidate in a different effective namespace will not be linked.

- **Minimum Character Count:**
  If the file content is shorter than the specified minimum character count, link conversion is skipped. This prevents accidental formatting of very short texts.

- **Respects Existing Links:**
  Already formatted links (i.e. those wrapped in `[[ ]]`) are preserved and not reformatted.

- **CJK Support:**
  Handles Japanese, Chinese, and other CJK text correctly.

- **Consider Aliases:**
  When enabled, the plugin takes file aliases into account during link conversion, allowing you to reference a file by any of its aliases.
  _(Restart is required for changes to take effect.)_

- **Month Note Ignorance:**
  File references that consist solely of one or two digits (e.g. `1`, `01`, `12`) are commonly used to denote month notes. The plugin automatically ignores these as candidates unless they are explicitly namespaced (e.g. `namespace/01`), preventing unwanted link conversion.

- **Ignore Date Formats:**
  When enabled, links that match date formats (e.g. `2025-02-10`) are ignored. This helps maintain compatibility with Obsidian Tasks and similar plugins.

- **Show Load Notice:**
  When enabled, a notice is displayed each time markdown files are loaded.

### Replace Bare URLs with Page Titles

The plugin can automatically find bare URLs (like `https://example.com`) in your notes, fetch the title of the web page from the URL, and replace the bare URL with a standard Markdown link using the fetched title (e.g., `[Example Domain](https://example.com)`). This feature is currently triggered manually via a command.

*   **Title Fetching:** Retrieves the `<title>` tag from the HTML of the linked page.
*   **Caching:** Fetched titles are cached in memory (`urlTitleMap`) during the Obsidian session to avoid redundant network requests.
*   **Context Awareness:** Avoids replacing URLs that are already part of Markdown links (`[text](url)`), inside angle brackets (`<url>`), or within code blocks (inline `code` or fenced ```code blocks```).
*   **Domain Ignore List:** You can configure a list of domains to ignore, preventing title fetching and replacement for those URLs (though this setting is not yet exposed in the UI).
