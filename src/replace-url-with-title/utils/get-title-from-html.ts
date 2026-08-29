import { decodeHTML } from "entities"

// Regular expression to capture the content inside the <title> tag
// It handles potential attributes within the title tag (though unlikely)
// and captures the content between <title...> and </title>
// Case-insensitive matching for <title> tag
const TITLE_REGEX = /<title[^>]*>([^<]+)<\/title>/i

const removeUnsafeControlCharacters = (value: string): string =>
    Array.from(value)
        .filter((character) => {
            const codePoint = character.codePointAt(0) ?? 0
            return !(
                codePoint <= 0x08
                || (codePoint >= 0x0E && codePoint <= 0x1F)
                || codePoint === 0x7F
            )
        })
        .join("")

export const getTitleFromHtml = (html: string): string => {
    const match = html.match(TITLE_REGEX)

    if (match && match[1]) {
        return removeUnsafeControlCharacters(decodeHTML(match[1]))
            .replace(/\s+/gu, " ")
            .trim()
            .normalize("NFC")
    }

    // Return empty string if no title tag is found or it's empty
    return ""
}
