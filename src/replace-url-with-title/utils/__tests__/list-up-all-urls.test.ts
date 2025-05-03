import { describe, expect, it } from "vitest";
import { listupAllUrls } from "../list-up-all-urls";

describe("listupAllUrls", () => {
	it("should find a URL in the text", () => {
		const body = "Check this link: https://example.com";
		const result = listupAllUrls(body);
		expect(result).toContain("https://example.com");
	});

	it("should ignore URLs inside markdown links", () => {
		const body = "Check this link: [Example](https://example.com)";
		const result = listupAllUrls(body);
		expect(result).not.toContain("https://example.com");
	});

	it("should ignore URLs inside angle brackets", () => {
		const body = "Check this link: <https://example.com>";
		const result = listupAllUrls(body);
		expect(result).not.toContain("https://example.com");
	});

	it("should ignore URLs inside inline code", () => {
		const body = "Check this link: `https://example.com`";
		const result = listupAllUrls(body);
		expect(result).not.toContain("https://example.com");
	});

	it("should ignore URLs inside fenced code blocks", () => {
		const body = "```\nhttps://example.com\n```";
		const result = listupAllUrls(body);
		expect(result).not.toContain("https://example.com");
	});

	it("ignore domains", () => {
		const body = "Check this link: https://example.com";
		const result = listupAllUrls(body, ["example.com"]);
		expect(result).not.toContain("https://example.com");
	});
});
