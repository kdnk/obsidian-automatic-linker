import "obsidian";
import { EditorView } from "@codemirror/view";

declare module "obsidian" {
	interface App {
		commands: {
			commands: {
				"editor:save-file": {
					callback?: () => void;
					checkCallback?: (checking: boolean) => void;
				};
			};
		};
	}

	interface Editor {
		cm?: EditorView;
	}

	interface Vault {
		getConfig(id: string): string;
	}
}
