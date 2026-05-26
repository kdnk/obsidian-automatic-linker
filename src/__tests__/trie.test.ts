import { describe, expect, it } from "vitest"
import { PathAndAliases } from "../path-and-aliases.types"
import { buildCandidateTrie, buildTrie, getTopLevelDirectoryName } from "../trie"

describe("getTopLevelDirectoryName", () => {
    it("returns the first directory after the baseDir", () => {
        expect(getTopLevelDirectoryName("pages/docs/file", "pages")).toBe("docs")
        expect(getTopLevelDirectoryName("pages/home/readme", "pages")).toBe("home")
    })

    it("returns the first segment if baseDir is not found", () => {
        expect(getTopLevelDirectoryName("docs/file")).toBe("docs")
        expect(getTopLevelDirectoryName("home/readme")).toBe("home")
    })
})

describe("buildTrie", () => {
    it("builds a trie with the given words", () => {
        const words = ["hello", "world", "hi"]
        const trie = buildTrie(words)

        expect(trie.children.has("h")).toBe(true)
        expect(trie.children.has("w")).toBe(true)
        expect(trie.children.get("h")?.children.has("e")).toBe(true)
        expect(trie.children.get("h")?.children.get("i")?.candidate).toBe("hi")
    })
})

describe("buildCandidateTrie", () => {
    it("builds a candidate map and trie", () => {
        const allFiles: PathAndAliases[] = [
            {
                path: "pages/docs/readme",
                scoped: false,
                aliases: ["intro"],
            },
            {
                path: "pages/home/index",
                scoped: false,
                aliases: [],
            },
        ]

        const { candidateMap, trie } = buildCandidateTrie(allFiles, "pages")

        expect(candidateMap.has("pages/docs/readme")).toBe(true)
        expect(candidateMap.has("docs/readme")).toBe(true)
        expect(candidateMap.get("intro")?.candidates[0].canonical).toBe("pages/docs/readme|intro")
        expect(trie.children.has("d")).toBe(true)
        expect(trie.children.has("h")).toBe(true)
    })

    it("handles multiple candidates for the same word", () => {
        const allFiles: PathAndAliases[] = [
            {
                path: "work/meeting",
                scoped: false,
                aliases: [],
            },
            {
                path: "private/meeting",
                scoped: false,
                aliases: [],
            },
        ]

        const { candidateMap } = buildCandidateTrie(allFiles, undefined, true)

        const meetingData = candidateMap.get("meeting")
        expect(meetingData?.candidates).toHaveLength(2)
        expect(meetingData?.candidates.map(c => c.canonical)).toContain("work/meeting")
        expect(meetingData?.candidates.map(c => c.canonical)).toContain("private/meeting")
    })
})
