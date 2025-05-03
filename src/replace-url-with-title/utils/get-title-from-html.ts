// Regular expression to capture the content inside the <title> tag
// It handles potential attributes within the title tag (though unlikely)
// and captures the content between <title...> and </title>
// Case-insensitive matching for <title> tag
const TITLE_REGEX = /<title[^>]*>([^<]+)<\/title>/i;

export const getTitleFromHtml = (html: string): string => {
	const match = html.match(TITLE_REGEX);

	if (match && match[1]) {
		// match[1] contains the captured group (the content of the title tag)
		// Trim whitespace from the extracted title
		return match[1].trim();
	}

	// Return empty string if no title tag is found or it's empty
	return "";
};
