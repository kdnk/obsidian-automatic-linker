import { describe, expect, it } from "vitest";
import { AutomaticLinkerSettings, DEFAULT_SETTINGS } from "../../settings-info";
import { formatGitHubURL } from "../index";

describe("formatGitHubURL", () => {
	const baseSettings: AutomaticLinkerSettings = {
		...DEFAULT_SETTINGS,
		githubEnterpriseURLs: ["github.enterprise.com", "github.company.com"],
	};

	describe("Basic repository URL formatting", () => {
		it("should format basic repository URL", () => {
			const input = "https://github.com/kdnk/obsidian-automatic-linker";
			const expected =
				"[[kdnk/obsidian-automatic-linker]] [🔗](https://github.com/kdnk/obsidian-automatic-linker)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});

		it("should format repository URL with trailing slash", () => {
			const input = "https://github.com/kdnk/obsidian-automatic-linker/";
			const expected =
				"[[kdnk/obsidian-automatic-linker]] [🔗](https://github.com/kdnk/obsidian-automatic-linker)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});

		it("should not modify non-GitHub URLs", () => {
			const input = "https://example.com/some-path/";
			expect(formatGitHubURL(input, baseSettings)).toBe(input);
		});

		it("should handle invalid URLs", () => {
			const input = "not-a-url";
			expect(formatGitHubURL(input, baseSettings)).toBe(input);
		});
	});

	describe("Pull Request and Issue URL formatting", () => {
		it("should format pull request URLs", () => {
			const input =
				"https://github.com/kdnk/obsidian-automatic-linker/pull/123?diff=split";
			const expected =
				"[[kdnk/obsidian-automatic-linker/pull/123]] [🔗](https://github.com/kdnk/obsidian-automatic-linker/pull/123)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});

		it("should format issue URLs", () => {
			const input =
				"https://github.com/kdnk/obsidian-automatic-linker/issues/456#issuecomment-1234567";
			const expected =
				"[[kdnk/obsidian-automatic-linker/issues/456]] [🔗](https://github.com/kdnk/obsidian-automatic-linker/issues/456)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});
	});

	describe("GitHub Enterprise URL formatting", () => {
		it("should format enterprise repository URLs", () => {
			const input = "https://github.enterprise.com/kdnk/project/";
			const expected =
				"[[kdnk/project]] [🔗](https://github.enterprise.com/kdnk/project)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});

		it("should format enterprise pull request URLs", () => {
			const input =
				"https://github.enterprise.com/kdnk/project/pull/789?diff=split";
			const expected =
				"[[enterprise/kdnk/project/pull/789]] [🔗](https://github.enterprise.com/kdnk/project/pull/789)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});

		it("should handle custom enterprise URLs", () => {
			const input = "https://github.company.com/team/project/issues/123";
			const expected =
				"[[company/team/project/issues/123]] [🔗](https://github.company.com/team/project/issues/123)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});

		it("should not format URLs from non-configured enterprise domains", () => {
			const input = "https://github.other-company.com/team/project/";
			expect(formatGitHubURL(input, baseSettings)).toBe(input);
		});
	});

	describe("URL with query parameters", () => {
		it("should remove query parameters from repository URLs", () => {
			const input =
				"https://github.com/kdnk/obsidian-automatic-linker?tab=repositories";
			const expected =
				"[[kdnk/obsidian-automatic-linker]] [🔗](https://github.com/kdnk/obsidian-automatic-linker)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});

		it("should remove hash from URLs", () => {
			const input =
				"https://github.com/kdnk/obsidian-automatic-linker#readme";
			const expected =
				"[[kdnk/obsidian-automatic-linker]] [🔗](https://github.com/kdnk/obsidian-automatic-linker)";
			expect(formatGitHubURL(input, baseSettings)).toBe(expected);
		});
	});
});
