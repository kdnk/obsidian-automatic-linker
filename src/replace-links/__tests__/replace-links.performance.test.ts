import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("replaceLinks performance tests", () => {
    const generateFiles = (count: number) => {
        const files = []
        for (let i = 0; i < count; i++) {
            files.push({
                path: `file${i}`,
            })
            files.push({
                path: `namespace/file${i}`,
            })
            files.push({
                path: `deep/nested/path/file${i}`,
            })
        }
        return files
    }

    const generateBody = (wordCount: number, linkWords: string[]) => {
        const words = ["the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog"]
        const result = []

        for (let i = 0; i < wordCount; i++) {
            if (i % 10 === 0 && linkWords.length > 0) {
                result.push(linkWords[i % linkWords.length])
            }
            else {
                result.push(words[i % words.length])
            }
        }

        return result.join(" ")
    }

    const generateLargeBody = (paragraphs: number) => {
        const sentences = [
            "This is a test document with many words.",
            "It contains various terms that might be linked.",
            "The performance test should measure how quickly the function processes large texts.",
            "Multiple paragraphs help simulate real-world usage scenarios.",
        ]

        const result = []
        for (let p = 0; p < paragraphs; p++) {
            const paragraph = []
            for (let s = 0; s < 5; s++) {
                paragraph.push(sentences[s % sentences.length])
            }
            result.push(paragraph.join(" "))
        }

        return result.join("\n\n")
    }

    describe("small dataset performance", () => {
        it("should process 100 files and 1000 words efficiently", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const files = generateFiles(100)
            const linkWords = files.slice(0, 10).map(f => f.path.split("/").pop()!)
            const body = generateBody(1000, linkWords)

            const { candidateMap, trie } = buildCandidateTrieForTest({
                files,
                settings,
            })

            const startTime = performance.now()

            const result = replaceLinks({
                body,
                linkResolverContext: {
                    filePath: "test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })

            const endTime = performance.now()
            const duration = endTime - startTime

            expect(result).toBeTruthy()
            expect(duration).toBeLessThan(100) // Should complete in less than 100ms
            console.log(`Small dataset processed in ${duration.toFixed(2)}ms`)
        })
    })

    describe("medium dataset performance", () => {
        it("should process 500 files and 5000 words efficiently", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const files = generateFiles(500)
            const linkWords = files.slice(0, 50).map(f => f.path.split("/").pop()!)
            const body = generateBody(5000, linkWords)

            const { candidateMap, trie } = buildCandidateTrieForTest({
                files,
                settings,
            })

            const startTime = performance.now()

            const result = replaceLinks({
                body,
                linkResolverContext: {
                    filePath: "test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })

            const endTime = performance.now()
            const duration = endTime - startTime

            expect(result).toBeTruthy()
            expect(duration).toBeLessThan(500) // Should complete in less than 500ms
            console.log(`Medium dataset processed in ${duration.toFixed(2)}ms`)
        })
    })

    describe("large dataset performance", () => {
        it("should process 1000 files and 10000 words efficiently", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const files = generateFiles(1000)
            const linkWords = files.slice(0, 100).map(f => f.path.split("/").pop()!)
            const body = generateBody(10000, linkWords)

            const { candidateMap, trie } = buildCandidateTrieForTest({
                files,
                settings,
            })

            const startTime = performance.now()

            const result = replaceLinks({
                body,
                linkResolverContext: {
                    filePath: "test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })

            const endTime = performance.now()
            const duration = endTime - startTime

            expect(result).toBeTruthy()
            expect(duration).toBeLessThan(1000) // Should complete in less than 1000ms
            console.log(`Large dataset processed in ${duration.toFixed(2)}ms`)
        })
    })

    describe("real-world document performance", () => {
        it("should process document with code blocks and links efficiently", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
            }
            const files = generateFiles(200)
            const linkWords = files.slice(0, 20).map(f => f.path.split("/").pop()!)

            const body = `
# Document Title

This is a test document with ${linkWords[0]} and ${linkWords[1]}.

\`\`\`javascript
function test() {
	// This should not be processed: ${linkWords[2]}
	return "${linkWords[3]}";
}
\`\`\`

Here are some more references to ${linkWords[4]} and ${linkWords[5]}.

- List item with ${linkWords[6]}
- Another item with ${linkWords[7]}

[Existing link](${linkWords[8]}) should not be modified.

${generateLargeBody(10)}

Final paragraph mentions ${linkWords[9]} again.
			`.trim()

            const { candidateMap, trie } = buildCandidateTrieForTest({
                files,
                settings,
            })

            const startTime = performance.now()

            const result = replaceLinks({
                body,
                linkResolverContext: {
                    filePath: "test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })

            const endTime = performance.now()
            const duration = endTime - startTime

            expect(result).toBeTruthy()
            expect(result).toContain("[[file0]]")
            expect(result).toContain("[[file1]]")
            expect(result).not.toContain("```javascript\nfunction test() {\n\t// This should not be processed: [[file2]]")
            expect(duration).toBeLessThan(200) // Should complete in less than 200ms
            console.log(`Real-world document processed in ${duration.toFixed(2)}ms`)
        })
    })

    describe("namespace resolution performance", () => {
        it("should process namespace resolution efficiently", () => {
            const settings = {
                scoped: true,
                baseDir: "namespace",
                namespaceResolution: true,
            }
            const files = generateFiles(300)
            const linkWords = files.slice(0, 30).map(f => f.path.split("/").pop()!)
            const body = generateBody(3000, linkWords)

            const { candidateMap, trie } = buildCandidateTrieForTest({
                files,
                settings,
            })

            const startTime = performance.now()

            const result = replaceLinks({
                body,
                linkResolverContext: {
                    filePath: "namespace/test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })

            const endTime = performance.now()
            const duration = endTime - startTime

            expect(result).toBeTruthy()
            expect(duration).toBeLessThan(300) // Should complete in less than 300ms
            console.log(`Namespace resolution processed in ${duration.toFixed(2)}ms`)
        })
    })

    describe("ignore case performance", () => {
        it("should process case-insensitive matching efficiently", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                ignoreCase: true,
            }
            const files = generateFiles(200)
            const linkWords = files.slice(0, 20).map(f => f.path.split("/").pop()!)
            const body = generateBody(2000, linkWords.map(w => w.toUpperCase()))

            const { candidateMap, trie } = buildCandidateTrieForTest({
                files,
                settings,
            })

            const startTime = performance.now()

            const result = replaceLinks({
                body,
                linkResolverContext: {
                    filePath: "test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })

            const endTime = performance.now()
            const duration = endTime - startTime

            expect(result).toBeTruthy()
            expect(duration).toBeLessThan(250) // Should complete in less than 250ms
            console.log(`Case-insensitive matching processed in ${duration.toFixed(2)}ms`)
        })
    })

    describe("memory usage optimization", () => {
        it("should handle fallback index caching efficiently", () => {
            const settings = {
                scoped: false,
                baseDir: undefined,
                namespaceResolution: true,
            }
            const files = generateFiles(500)
            const { candidateMap, trie } = buildCandidateTrieForTest({
                files,
                settings,
            })

            // First call should build cache
            const startTime1 = performance.now()
            replaceLinks({
                body: "test file0 file1",
                linkResolverContext: {
                    filePath: "test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })
            const endTime1 = performance.now()
            const duration1 = endTime1 - startTime1

            // Second call should use cache
            const startTime2 = performance.now()
            replaceLinks({
                body: "test file2 file3",
                linkResolverContext: {
                    filePath: "test/document",
                    trie,
                    candidateMap,
                },
                settings,
            })
            const endTime2 = performance.now()
            const duration2 = endTime2 - startTime2

            console.log(`First call (cache build): ${duration1.toFixed(2)}ms`)
            console.log(`Second call (cache hit): ${duration2.toFixed(2)}ms`)

            // Second call should be faster or similar (cache benefit)
            expect(duration2).toBeLessThanOrEqual(duration1 * 1.2) // Allow 20% variance
        })
    })
})
