# 🤖 Automatic Linker 🔗

Automatic Linker Plugin automatically converts plain text file references into Obsidian wiki links (i.e. `[[...]]`) based on the file names in your vault. It can also automatically format links when saving a file and allows you to configure base directories that are treated differently.

## Features

- **Automatic Link Conversion:**  
  The plugin scans your file for text that matches file names in your vault and converts them into wiki links by wrapping them in `[[ ]]`.

- **Format on Save:**  
  Optionally, the plugin can automatically format (i.e. convert links) when you save a file.

- **Configurable Base Directories and Effective Namespace Handling:**  
  Specify one or more directories (e.g. `pages`) that are treated as base. For files in these directories, the directory prefix is omitted when linking. The plugin treats the folder immediately under each base directory as the effective namespace. When resolving links, the candidate file’s effective namespace (derived from its path relative to the base directory) is compared to that of the current file to determine if linking should occur when namespace restriction is enabled.

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

## Usage

- **Automatic Conversion:**  
  When the **Format on Save** setting is enabled, the plugin automatically converts matching text into wiki links each time you save a file.

- **Manual Trigger:**  
  You can also manually run the link conversion command via the Command Palette with the command **Link current file**.

## Configuration

The plugin settings are available under the **Automatic Linker Plugin** settings tab. The available options include:

- **Format on Save:**  
  When enabled, the plugin will automatically convert links when you save a file.

- **Base Directory:**  
  Enter the directory that should be treated as base. For example, if you enter `pages`, then file links like `pages/tags` can be referenced simply as `tags`. The folder immediately under the base directory is considered the effective namespace for link resolution.

- **Show Load Notice:**  
  When enabled, a notice will be displayed when markdown files are loaded.

- **Minimum Character Count:**  
  Set the minimum number of characters required for the file content to be processed. If the file content is shorter than this value, link conversion will be skipped.

- **Consider Aliases:**  
  When enabled, the plugin will take file aliases into account during link conversion.  
  _(Restart required for changes to take effect.)_

- **Automatic Namespace Resolution:**  
  When enabled, the plugin will automatically resolve namespaces for shorthand links.  
  If multiple candidates share the same shorthand, the candidate whose full path is closest to the current file (i.e. shares the most common path segments or has the shallowest relative depth when the current file is in a base directory) will be selected. Additionally, if a candidate is marked with `automatic-linker-restrict-namespace` in its frontmatter, link conversion is performed only if its effective namespace (derived from the configured base directory) matches that of the current file.

- **Ignore Date Formats:**  
  When enabled, links that match date formats (e.g. `2025-02-10`) will be ignored. This helps maintain compatibility with Obsidian Tasks and similar plugins.
