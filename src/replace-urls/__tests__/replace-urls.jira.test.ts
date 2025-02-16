import { describe, expect, it } from "vitest";
import {
	AutomaticLinkerSettings,
	DEFAULT_SETTINGS,
} from "../../settings/settings-info";
import { formatJiraURL } from "../jira";

describe("formatJiraURL", () => {
	const baseSettings: AutomaticLinkerSettings = {
		...DEFAULT_SETTINGS,
		jiraURLs: ["sub-domain.work.com", "jira.company.com"],
	};

	describe("Basic Jira URL formatting", () => {
		it("should format basic Jira issue URL", () => {
			const input = "https://sub-domain.work.com/browse/XYZ-123";
			const expected =
				"[[work/jira/XYZ/123]] [🔗](https://sub-domain.work.com/browse/XYZ-123)";
			expect(formatJiraURL(input, baseSettings)).toBe(expected);
		});

		it("should not modify non-Jira URLs", () => {
			const input = "https://example.com/browse/XYZ-123";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});

		it("should handle invalid URLs", () => {
			const input = "not-a-url";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});
	});

	describe("URL pattern validation", () => {
		it("should not format URLs without browse path", () => {
			const input = "https://sub-domain.work.com/XYZ-123";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});

		it("should not format URLs with invalid issue format", () => {
			const input = "https://sub-domain.work.com/browse/XYZ123";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});
	});

	describe("Multiple Jira domains", () => {
		it("should format URLs from different configured domains", () => {
			const input = "https://jira.company.com/browse/ABC-456";
			const expected =
				"[[company/jira/ABC/456]] [🔗](https://jira.company.com/browse/ABC-456)";
			expect(formatJiraURL(input, baseSettings)).toBe(expected);
		});

		it("should not format URLs from non-configured domains", () => {
			const input = "https://jira.other-company.com/browse/DEF-789";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});
	});

	describe("URL with query parameters", () => {
		it("should not format URLs with query parameters (focusedCommentId)", () => {
			const input =
				"https://sub-domain.work.com/browse/XYZ-123?focusedCommentId=12345";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});

		it("should not format URLs with query parameters (selectedIssue)", () => {
			const input =
				"https://sub-domain.work.com/browse/XYZ-123?selectedIssue=XYZ-123";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});

		it("should not format URLs with multiple query parameters", () => {
			const input =
				"https://sub-domain.work.com/browse/XYZ-123?focusedCommentId=12345&selectedIssue=XYZ-123";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});

		it("should not format URLs with empty query parameters", () => {
			const input = "https://sub-domain.work.com/browse/XYZ-123?";
			expect(formatJiraURL(input, baseSettings)).toBe(input);
		});

		it("should format URLs without query parameters", () => {
			const input = "https://sub-domain.work.com/browse/XYZ-123";
			const expected =
				"[[work/jira/XYZ/123]] [🔗](https://sub-domain.work.com/browse/XYZ-123)";
			expect(formatJiraURL(input, baseSettings)).toBe(expected);
		});
	});
});
