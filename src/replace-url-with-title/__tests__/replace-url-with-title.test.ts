import { describe, expect, it } from "vitest";
import { replaceUrlWithTitle } from "..";

describe("replaceUrlWithTitle", () => {
	it("should replace URLs with titles", async () => {
		const body = "Check this link: https://example.com";
		const getWebTitle = async (url: string) => "Example Title";
		const result = await replaceUrlWithTitle({ getWebTitle })({ body });
		expect(result).toBe(
			"Check this link: [Example Title](https://example.com)",
		);
	});

	it("should handle multiple URLs", async () => {
		const body = "Links: https://example.com and https://another.com";
		const getWebTitle = async (url: string) =>
			url === "https://example.com" ? "Example Title" : "Another Title";
		const result = await replaceUrlWithTitle({ getWebTitle })({ body });
		expect(result).toBe(
			"Links: [Example Title](https://example.com) and [Another Title](https://another.com)",
		);
	});

	it("should ignore markdown link []()", async () => {
		const body = "Check this link: [Example Title](https://example.com)";
		const getWebTitle = async (url: string) => "New Title";
		const result = await replaceUrlWithTitle({ getWebTitle })({ body });
		expect(result).toBe(
			"Check this link: [Example Title](https://example.com)",
		);
	});

	it("should handle multiple lines", async () => {
		const body = "Line 1: https://example.com\nLine 2: https://another.com";
		const getWebTitle = async (url: string) =>
			url === "https://example.com" ? "Example Title" : "Another Title";
		const result = await replaceUrlWithTitle({ getWebTitle })({ body });
		expect(result).toBe(
			"Line 1: [Example Title](https://example.com)\nLine 2: [Another Title](https://another.com)",
		);
	});
});
