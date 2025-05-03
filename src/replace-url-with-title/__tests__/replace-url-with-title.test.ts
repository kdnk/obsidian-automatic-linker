import { describe, expect, it } from "vitest";
import { replaceUrlWithTitle } from "..";

describe("replaceUrlWithTitle", () => {
	it("should replace URLs with titles", async () => {
		const body = "Check this link: https://example.com";
		const getTitle = async (url: string) => "Example Title";
		const result = await replaceUrlWithTitle({ getTitle })({ body });
		expect(result).toBe(
			"Check this link: [Example Title](https://example.com)",
		);
	});

	it("should handle multiple URLs", () => {
		const body = "Links: https://example.com and https://another.com";
		const getTitle = async (url: string) =>
			url === "https://example.com" ? "Example Title" : "Another Title";
		const result = replaceUrlWithTitle({ getTitle })({ body });
		expect(result).toBe(
			"Links: [Example Title](https://example.com) and [Another Title](https://another.com)",
		);
	});

	it('should ignore markdown link []()', () => {
		const body = "Check this link: [Example Title](https://example.com)";
		const getTitle = async (url: string) => "New Title";
		const result = replaceUrlWithTitle({ getTitle })({ body });
		expect(result).toBe(
			"Check this link: [Example Title](https://example.com)",
		);
	})
});
