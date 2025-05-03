import { describe, expect, it } from "vitest";
import { getTitleFromHtml } from "../get-title-from-html";

describe("getTitleFromHtml", () => {
	it("should extract title from HTML", () => {
		const html = "<html><head><title>Example Title</title></head></html>";
		const result = getTitleFromHtml(html);
		expect(result).toBe("Example Title");
	});

	it("should handle empty title tag", () => {
		const html = "<html><head><title></title></head></html>";
		const result = getTitleFromHtml(html);
		expect(result).toBe("");
	});

	it("should handle no title tag", () => {
		const html = "<html><head></head></html>";
		const result = getTitleFromHtml(html);
		expect(result).toBe("");
	});
});
