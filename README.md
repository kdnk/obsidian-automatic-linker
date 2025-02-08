# 🤖 Automatic Linker 🔗

Automatic Linker Plugin automatically converts plain text file references into Obsidian wiki links (i.e. `[[...]]`) based on the file names in your vault. It can also automatically format links when saving a file and allows you to configure base directories that are treated differently.

## Features

- **Automatic Link Conversion:**  
  The plugin scans your file for text that matches file names in your vault and converts them into wiki links by wrapping them in `[[ ]]`.

- **Format on Save:**  
  Optionally, the plugin can automatically format (i.e. convert links) when you save a file.

- **Configurable Base Directories:**  
  Specify directories (e.g. `pages`) that are treated as base. For files in these directories, the directory prefix can be omitted when linking.

- **Minimum Character Count:**  
  If the file content is shorter than the specified minimum character count, link conversion is skipped. This prevents accidental formatting of very short texts.

- **Respects Existing Links:**  
  Already formatted links (i.e. those wrapped in `[[ ]]`) are preserved and not reformatted.

- **CJK Support:**  
  Handles Japanese, Chinese, and other CJK text correctly.

- **Automatic Namespace Resolution:**  
  When enabled, the plugin automatically resolves shorthand links to their full namespaced candidates. In cases where multiple candidates share the same shorthand (for example, `namespace1/link` and `namespace2/subnamespace/link`), the candidate whose full path is closest to the current file—i.e. shares the most common path segments—is selected. For example, if your current file is located in `namespace2/subnamespace/`, typing `link` will be converted to `[[namespace2/subnamespace/link]]`.

- **Consider Aliases:**  
  When enabled, the plugin takes file aliases into account during link conversion, allowing you to reference a file by any of its aliases.  
  *(Restart is required for changes to take effect.)*

- **Month Note Ignorance:**  
  File references that consist solely of one or two digits (e.g. `1`, `01`, `12`) are commonly used to denote month notes. The plugin automatically ignores these as candidates unless they are explicitly namespaced (e.g. `namespace/01`), preventing unwanted link conversion.

## Usage

- **Automatic Conversion:**  
  When the **Format on Save** setting is enabled, the plugin automatically converts matching text into wiki links each time you save a file.

- **Manual Trigger:**  
  You can also manually run the link conversion command via the Command Palette with the command **Link current file**.

## Configuration

The plugin settings are available under the **Automatic Linker Plugin** settings tab. The available options include:

- **Format on Save:**  
  When enabled, the plugin will automatically convert links when you save a file.

- **Base Directories:**  
  Enter one or more directory names (one per line) that should be treated as base. For example, if you enter `pages`, then file links like `pages/tags` can be referenced simply as `tags`.

- **Minimum Character Count:**  
  Set the minimum number of characters required for the file content to be processed. If the file content is shorter than this value, link conversion will be skipped.

- **Consider Aliases:**  
  When enabled, the plugin will take file aliases into account during link conversion.  
  *(Restart required for changes to take effect.)*

- **Automatic Namespace Resolution:**  
  When enabled, the plugin will automatically resolve namespaces for shorthand links.  
  If multiple candidates share the same shorthand, the candidate whose full path is closest to the current file (i.e. shares the most common path segments) will be selected.

