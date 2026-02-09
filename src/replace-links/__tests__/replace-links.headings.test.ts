import { describe, expect, it } from "vitest"
import { replaceLinks } from "../replace-links"
import { buildCandidateTrieForTest } from "./test-helpers"

describe("replaceLinks - heading handling", () => {
    const { candidateMap, trie } = buildCandidateTrieForTest({
        files: [
            { path: "VPN" },
            { path: "SSH" },
            { path: "Networking" },
            { path: "Security" },
        ],
        settings: {
            scoped: false,
            baseDir: undefined,
        },
    })

    describe("basic heading protection", () => {
        it("should not link text inside h1 heading", () => {
            const input = `# VPN Configuration`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(input)
        })

        it("should not link text inside h2 heading", () => {
            const input = `## SSH Setup`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(input)
        })

        it("should not link text inside h3 heading", () => {
            const input = `### Networking Basics`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(input)
        })

        it("should not link text inside h4 heading", () => {
            const input = `#### Security Overview`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(input)
        })

        it("should not link text inside h5 heading", () => {
            const input = `##### VPN Details`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(input)
        })

        it("should not link text inside h6 heading", () => {
            const input = `###### SSH Notes`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(input)
        })
    })

    describe("text between headings is still linked", () => {
        it("should link text in body paragraphs between headings", () => {
            const input = `# Introduction

VPN is important for Security

## Details

SSH is also useful`

            const expected = `# Introduction

[[VPN]] is important for [[Security]]

## Details

[[SSH]] is also useful`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(expected)
        })
    })

    describe("headings with candidate text are not linked", () => {
        it("should protect heading but link same text in body", () => {
            const input = `# VPN

VPN is a useful tool`

            const expected = `# VPN

[[VPN]] is a useful tool`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(expected)
        })
    })

    describe("feature disabled", () => {
        it("should link text in headings when ignoreHeadings is false", () => {
            const input = `# VPN Configuration`

            const expected = `# [[VPN]] Configuration`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: false },
            })

            expect(result).toBe(expected)
        })
    })

    describe("headings with existing wikilinks", () => {
        it("should preserve existing wikilinks in headings", () => {
            const input = `# [[VPN]] Configuration`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(input)
        })
    })

    describe("multiple headings in one document", () => {
        it("should protect all headings in a document", () => {
            const input = `# VPN Guide

Some text about VPN

## SSH Configuration

More text about SSH

### Networking and Security

Details about Networking and Security`

            const expected = `# VPN Guide

Some text about [[VPN]]

## SSH Configuration

More text about [[SSH]]

### Networking and Security

Details about [[Networking]] and [[Security]]`

            const result = replaceLinks({
                body: input,
                linkResolverContext: {
                    filePath: "test",
                    trie,
                    candidateMap,
                },
                settings: { ignoreHeadings: true },
            })

            expect(result).toBe(expected)
        })
    })
})
