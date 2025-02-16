import { CandidateData, TrieNode } from "../trie";

export interface ReplaceLinksOptions {
    body: string;
    linkResolverContext: {
        filePath: string;
        trie: TrieNode;
        candidateMap: Map<string, CandidateData>;
    };
    settings?: {
        minCharCount?: number;
        namespaceResolution?: boolean;
        baseDir?: string;
        ignoreDateFormats?: boolean;
    };
}
