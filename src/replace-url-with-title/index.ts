import { mapMarkdownProse } from "../markdown-segments"

type Url = string
type Title = string
interface ReplaceUrlWithTitleOptions {
    body: string
    urlTitleMap: Map<Url, Title>
}

export const replaceUrlWithTitle = ({
    body,
    urlTitleMap,
}: ReplaceUrlWithTitleOptions): string => {
    if (urlTitleMap.size === 0) {
        return body
    }

    // Sort URLs by length descending to replace longer URLs first
    // This helps prevent partial replacements (e.g., replacing 'example.com' before 'sub.example.com')
    const sortedUrls = Array.from(urlTitleMap.keys()).sort(
        (a, b) => b.length - a.length,
    )

    const replaceUrlsInProse = (prose: string): string => {
        let resultBody = prose

        for (const url of sortedUrls) {
            const title = urlTitleMap.get(url)
            if (!title) continue

            const markdownLink = `[${title}](${url})`
            let currentIndex = 0
            const newBodyParts: string[] = []

            while (currentIndex < resultBody.length) {
                const nextOccurrence = resultBody.indexOf(url, currentIndex)

                if (nextOccurrence === -1) {
                    newBodyParts.push(resultBody.substring(currentIndex))
                    break
                }

                newBodyParts.push(
                    resultBody.substring(currentIndex, nextOccurrence),
                )

                let shouldReplace = true

                const precedingChars = resultBody.substring(
                    nextOccurrence - 2,
                    nextOccurrence,
                )
                const precedingChar = resultBody[nextOccurrence - 1]
                const followingChar = resultBody[nextOccurrence + url.length]
                if (
                    (precedingChars === "](" && followingChar === ")")
                    || (precedingChar === "<" && followingChar === ">")
                ) {
                    shouldReplace = false
                }

                if (shouldReplace) {
                    const segmentBefore = resultBody.substring(0, nextOccurrence)
                    const backticksCount = (segmentBefore.match(/(?<!\\)`/g) || [])
                        .length

                    if (backticksCount % 2 !== 0) {
                        const lastBacktickIndex = segmentBefore.lastIndexOf("`")
                        if (
                            lastBacktickIndex !== -1
                            && !segmentBefore
                                .substring(lastBacktickIndex + 1)
                                .includes("`")
                        ) {
                            shouldReplace = false
                        }
                    }
                }

                newBodyParts.push(shouldReplace ? markdownLink : url)
                currentIndex = nextOccurrence + url.length
            }

            resultBody = newBodyParts.join("")
        }

        return resultBody
    }

    return mapMarkdownProse(body, replaceUrlsInProse)
}
