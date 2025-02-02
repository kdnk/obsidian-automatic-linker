# 🤖 Automatic Linker 🔗

Automatic Linker Plugin automatically converts plain text file references into Obsidian wiki links (i.e. `[[...]]`) based on the file names in your vault. It can also automatically format links when saving a file and allows you to configure special directories that are treated differently.

## Features

- **Automatic Link Conversion:**  
  The plugin scans your file for text that matches file names in your vault and converts them into wiki links by wrapping them in `[[ ]]`.

- **Format on Save:**  
  Optionally, the plugin can automatically format (i.e. convert links) when you save your file.

- **Configurable Special Directories:**  
  Specify directories (e.g. `pages`) that are treated specially. For files in these directories, the directory prefix can be omitted when linking.

- **Respects Existing Links:**  
  Already formatted links (i.e. those wrapped in `[[ ]]`) are preserved and not reformatted.

- **CJK Support:**  
  Handles Japanese, Chinese, and other CJK text correctly.

## Usage

- **Automatic Conversion:**  
  When the **Format on Save** setting is enabled, the plugin automatically converts matching text into wiki links each time you save a file.

- **Manual Trigger:**  
  You can also manually run the link conversion command via the Command Palette with the command **Link current file**.

## Configuration

The plugin settings are available under the **Automatic Linker Plugin** settings tab. The available options include:

- **Format on Save:**  
  When enabled, the plugin will automatically convert links when you save a file.

- **Special Directories:**  
  Enter one or more directory names (one per line) that should be treated as special. For example, if you enter `pages`, then file links like `pages/tags` can be referenced simply as `tags`.
