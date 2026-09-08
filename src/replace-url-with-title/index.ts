import { findBareUrlOccurrences } from "./utils/find-bare-url-occurrences"

type Url = string
type Title = string
interface ReplaceUrlWithTitleOptions {
    body: string
    urlTitleMap: Map<Url, Title>
    ignoredDomains?: string[]
}

const escapeMarkdownLinkTitle = (title: string): string =>
    title.replace(/[\\[\]]/g, "\\$&")

export const replaceUrlWithTitle = ({
    body,
    urlTitleMap,
    ignoredDomains,
}: ReplaceUrlWithTitleOptions): string => {
    if (urlTitleMap.size === 0) {
        return body
    }

    const parts: string[] = []
    let cursor = 0
    for (const { url, start, end } of findBareUrlOccurrences(body, ignoredDomains)) {
        const title = urlTitleMap.get(url)
        if (!title) continue

        parts.push(body.slice(cursor, start))
        parts.push(`[${escapeMarkdownLinkTitle(title)}](${url})`)
        cursor = end
    }

    parts.push(body.slice(cursor))
    return parts.join("")
}
