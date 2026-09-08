import { findBareUrlOccurrences } from "./find-bare-url-occurrences"

export const listupAllUrls = (
    body: string,
    ignoredDomains?: string[],
): Set<string> => {
    return new Set(findBareUrlOccurrences(body, ignoredDomains).map(({ url }) => url))
}
