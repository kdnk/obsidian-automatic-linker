import { segmentMarkdown } from "../../markdown-segments"

type Url = string

// Regular expression to find URLs starting with http:// or https://
// It avoids matching URLs immediately preceded by `](` or `<` or followed by `)` or `>`
// It also tries to avoid including common trailing punctuation as part of the URL.
// Still simplified and might need refinement for complex edge cases.
// Added ')' to the negated set to prevent matching the closing parenthesis of a Markdown link.
const URL_REGEX = /https?:\/\/[^\s<>"'`)]+/g

// Regex to identify common trailing punctuation that shouldn't be part of the URL
const TRAILING_PUNCTUATION_REGEX = /[.,;!?\]}]+$/ // Removed ')' as it's now handled by URL_REGEX exclusion
export const listupAllUrls = (
    body: string,
    ignoredDomains?: string[],
): Set<Url> => {
    const urls = new Set<Url>()
    let match

    for (const segment of segmentMarkdown(body)) {
        if (segment.kind === "protected") {
            continue
        }

        URL_REGEX.lastIndex = 0
        while ((match = URL_REGEX.exec(segment.text)) !== null) {
            const url = match[0]
            const matchIndex = segment.start + match.index

            let isBareUrl = true

            if (matchIndex >= 2) {
                const followingCharIndex = matchIndex + url.length
                if (followingCharIndex < body.length && body[followingCharIndex] === ")") {
                    const precedingChars = body.substring(matchIndex - 2, matchIndex)
                    if (precedingChars === "](") {
                        isBareUrl = false
                    }
                }
            }

            if (isBareUrl && matchIndex >= 1) {
                const precedingChar = body[matchIndex - 1]
                const followingChar = body[matchIndex + url.length]
                if (precedingChar === "<" && followingChar === ">") {
                    isBareUrl = false
                }
            }

            if (isBareUrl) {
                let finalUrl = url
                let shouldAdd = true

                if (ignoredDomains && ignoredDomains.length > 0) {
                    try {
                        const parsedUrl = new URL(url)
                        const hostname = parsedUrl.hostname
                        if (
                            ignoredDomains.some(
                                domain =>
                                    hostname === domain
                                    || hostname.endsWith(`.${domain}`),
                            )
                        ) {
                            shouldAdd = false
                        }
                    }
                    catch (e) {
                        console.warn(
                            `Failed to parse URL for domain check: ${url}`,
                            e,
                        )
                        shouldAdd = false
                    }
                }

                if (shouldAdd) {
                    const cleanedUrl = url.replace(TRAILING_PUNCTUATION_REGEX, "")
                    if (cleanedUrl.includes("://")) {
                        finalUrl = cleanedUrl
                    }
                    else {
                        finalUrl = url
                        console.warn(`URL cleaning potentially broke the URL: ${url} -> ${cleanedUrl}`)
                    }
                }

                if (shouldAdd) {
                    urls.add(finalUrl)
                }
            }
        }
    }

    return urls
}
