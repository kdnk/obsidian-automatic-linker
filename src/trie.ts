/**
 * Builds a candidate map and Trie from a list of file names.
 *
 * The candidate map maps both the full candidate and a short candidate (if applicable)
 * to its canonical replacement.
 *
 * For a normal link, the canonical replacement is the candidate itself (e.g. [[link]]).
 * For an alias, the canonical replacement is "file.path|alias" (e.g. [[file.path|alias]]).
 *
 * @param allFiles - List of files (without the ".md" extension).
 * @param baseDir - List of base directories to consider for short names.
 * @returns An object containing the candidateMap and Trie.
 */
// src/trie.ts

import { PathAndAliases } from "./path-and-aliases.types"

export interface TrieNode {
    children: Map<string, TrieNode>
    candidate?: string
}

/**
 * Returns the top level directory name for a given file path.
 * If the path starts with baseDir (e.g. "pages/"), returns the directory immediately
 * under the baseDir. Otherwise, returns the first directory segment.
 */
export const getTopLevelDirectoryName = (
    path: string,
    baseDir?: string,
): string => {
    const prefix = baseDir + "/"
    if (baseDir) {
        if (path.startsWith(prefix)) {
            const rest = path.slice(prefix.length)
            const segments = rest.split("/")
            return segments[0] || ""
        }
    }
    // Fallback: return the first segment
    const segments = path.split("/")
    return segments[0] || ""
}

export const buildTrie = (words: string[], ignoreCase = false): TrieNode => {
    const root: TrieNode = { children: new Map() }

    for (const word of words) {
        let node = root
        const chars = ignoreCase ? word.toLowerCase() : word
        for (const char of chars) {
            let child = node.children.get(char)
            if (!child) {
                child = { children: new Map() }
                node.children.set(char, child)
            }
            node = child
        }
        node.candidate = word // preserve the original case
    }

    return root
}

// CandidateData holds the canonical replacement string as well as namespace‐設定
export interface CandidateItem {
    canonical: string
    scoped: boolean
    namespace: string
}

export interface CandidateData {
    candidates: CandidateItem[]
}

export const buildCandidateTrie = (
    allFiles: PathAndAliases[],
    baseDir: string | undefined,
    ignoreCase = false,
) => {
    // Filter out files with exclude: true
    const linkableFiles = allFiles.filter(f => !f.exclude)

    // Process candidate strings from file paths.
    type Candidate = {
        full: string
        short: string | null
        scoped: boolean
        // Effective namespace computed relative to baseDir.
        namespace: string
    }
    const basePrefix = baseDir ? `${baseDir}/` : null
    const basePrefixLength = basePrefix?.length || 0

    const candidates: Candidate[] = linkableFiles.map((f) => {
        const candidate: Candidate = {
            full: f.path,
            short: null,
            scoped: f.scoped,
            namespace: getTopLevelDirectoryName(f.path, baseDir),
        }
        if (basePrefix && f.path.startsWith(basePrefix)) {
            candidate.short = f.path.slice(basePrefixLength)
        }
        return candidate
    })

    // Build a mapping from candidate string to its CandidateData.
    const candidateMap = new Map<string, CandidateData>()

    const addCandidate = (key: string, item: CandidateItem) => {
        const existing = candidateMap.get(key)
        if (existing) {
            // Check if this canonical path is already added to avoid duplicates
            if (!existing.candidates.some(c => c.canonical === item.canonical)) {
                existing.candidates.push(item)
            }
        }
        else {
            candidateMap.set(key, { candidates: [item] })
        }
    }

    // Register normal candidates.
    for (const { full, short, scoped, namespace } of candidates) {
        // Register the full path
        addCandidate(full, {
            canonical: full,
            scoped,
            namespace,
        })

        // For paths with a slash, register the last segment
        const lastSlashIndex = full.lastIndexOf("/")
        if (lastSlashIndex !== -1) {
            const lastSegment = full.slice(lastSlashIndex + 1)
            // For CJK paths or when ignoreCase is enabled
            if (
                ignoreCase
                || /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(
                    lastSegment,
                )
            ) {
                const item = {
                    canonical: full,
                    scoped,
                    namespace,
                }
                addCandidate(lastSegment, item)
                if (ignoreCase) {
                    addCandidate(lastSegment.toLowerCase(), item)
                }
            }
        }

        // Register the short path if available
        if (short) {
            addCandidate(short, {
                canonical: full,
                scoped,
                namespace,
            })
        }
    }

    // Register alias candidates.
    for (const file of linkableFiles) {
        if (file.aliases) {
            // Determine shorthand candidate for the file if available.
            let short: string | null = null
            if (basePrefix && file.path.startsWith(basePrefix)) {
                short = file.path.slice(basePrefixLength)
            }
            for (const alias of file.aliases) {
                // If alias equals the shorthand, use alias as canonical; otherwise use "full|alias".
                const canonicalForAlias
                    = short && alias === short ? alias : `${file.path}|${alias}`
                const item = {
                    canonical: canonicalForAlias,
                    scoped: file.scoped,
                    namespace: getTopLevelDirectoryName(file.path, baseDir),
                }
                addCandidate(alias, item)
                // Register lowercase version when ignoreCase is enabled
                if (ignoreCase) {
                    addCandidate(alias.toLowerCase(), item)
                }
            }
        }
    }

    // Build a trie from all candidate strings
    const words = Array.from(candidateMap.keys())
    const trie = buildTrie(words, ignoreCase)

    return { candidateMap, trie }
}

if (import.meta.vitest) {
    const { it, expect, describe } = import.meta.vitest

    // Test for getTopLevelDirectoryName
    describe("getTopLevelDirectoryName", () => {
        it("should return the first directory after the baseDir", () => {
            expect(getTopLevelDirectoryName("pages/docs/file", "pages")).toBe(
                "docs",
            )
            expect(getTopLevelDirectoryName("pages/home/readme", "pages")).toBe(
                "home",
            )
        })

        it("should return the first segment if baseDir is not found", () => {
            expect(getTopLevelDirectoryName("docs/file")).toBe("docs")
            expect(getTopLevelDirectoryName("home/readme")).toBe("home")
        })
    })

    // Test for buildTrie
    describe("buildTrie", () => {
        it("should build a Trie with the given words", () => {
            const words = ["hello", "world", "hi"]
            const trie = buildTrie(words)

            expect(trie.children.has("h")).toBe(true)
            expect(trie.children.has("w")).toBe(true)
            expect(trie.children.get("h")?.children.has("e")).toBe(true)
            expect(trie.children.get("h")?.children.get("i")?.candidate).toBe(
                "hi",
            )
        })
    })

    // Test for buildCandidateTrie
    describe("buildCandidateTrie", () => {
        it("should build a candidate map and trie", () => {
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

            const { candidateMap, trie } = buildCandidateTrie(
                allFiles,
                "pages",
            )

            expect(candidateMap.has("pages/docs/readme")).toBe(true)
            expect(candidateMap.has("docs/readme")).toBe(true)
            expect(candidateMap.get("intro")?.candidates[0].canonical).toBe(
                "pages/docs/readme|intro",
            )
            expect(trie.children.has("d")).toBe(true)
            expect(trie.children.has("h")).toBe(true)
        })

        it("should handle multiple candidates for the same word", () => {
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
}
