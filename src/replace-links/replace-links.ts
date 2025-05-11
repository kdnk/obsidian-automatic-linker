import { CandidateData, getEffectiveNamespace, TrieNode } from "../trie";

// Types for the replaceLinks function
export interface LinkResolverContext {
	filePath: string;
	trie: TrieNode;
	candidateMap: Map<string, CandidateData>;
}

export interface ReplaceLinksSettings {
	minCharCount?: number;
	namespaceResolution?: boolean;
	baseDir?: string;
	ignoreDateFormats?: boolean;
	ignoreCase?: boolean;
}

export interface ReplaceLinksOptions {
	body: string;
	linkResolverContext: LinkResolverContext;
	settings?: ReplaceLinksSettings;
}

// RegEx patterns
const PROTECTED_REGEX =
	/(```[\s\S]*?```|`[^`]*`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s]+)/g;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_NOTE_REGEX = /^[0-9]{1,2}$/;
const CJK_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CJK_CANDIDATE_REGEX =
	/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s\d]+$/u;
const KOREAN_REGEX = /^[\p{Script=Hangul}]+$/u;
const JAPANESE_REGEX =
	/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\s\d]+$/u;
const URL_REGEX = /^(https?:\/\/[^\s]+)/;

// Utility functions
const isWordBoundary = (char: string | undefined): boolean => {
	if (char === undefined) return true;
	// CJK characters should be considered as word boundaries
	if (CJK_REGEX.test(char)) return true;
	return !/[\p{L}\p{N}_/-]/u.test(char) || /[\t\n\r ]/.test(char);
};

const isMonthNote = (candidate: string): boolean =>
	MONTH_NOTE_REGEX.test(candidate) &&
	parseInt(candidate, 10) >= 1 &&
	parseInt(candidate, 10) <= 12;

const isProtectedLink = (body: string): boolean => {
	return /^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/.test(body);
};

const buildFallbackIndex = (
	candidateMap: Map<string, CandidateData>,
	ignoreCase?: boolean,
): Map<string, Array<[string, CandidateData]>> => {
	const fallbackIndex = new Map<string, Array<[string, CandidateData]>>();

	for (const [key, data] of candidateMap.entries()) {
		const slashIndex = key.lastIndexOf("/");
		if (slashIndex === -1) continue;

		const shorthand = key.slice(slashIndex + 1);
		const indexKey = ignoreCase ? shorthand.toLowerCase() : shorthand;

		let arr = fallbackIndex.get(indexKey);
		if (!arr) {
			arr = [];
			fallbackIndex.set(indexKey, arr);
		}
		arr.push([key, data]);
	}

	return fallbackIndex;
};

const getCurrentNamespace = (filePath: string, baseDir?: string): string => {
	if (baseDir) {
		return getEffectiveNamespace(filePath, baseDir);
	}

	const segments = filePath.split("/");
	return segments[0] || "";
};

const normalizeCanonicalPath = (linkPath: string, baseDir?: string): string => {
	if (baseDir) {
		if (linkPath.startsWith("pages/")) {
			linkPath = linkPath.slice("pages/".length);
		}
		if (linkPath.startsWith(baseDir + "/")) {
			linkPath = linkPath.slice((baseDir + "/").length);
		}
	}
	return linkPath;
};

const extractLinkParts = (
	canonicalPath: string,
): { linkPath: string; alias: string; hasAlias: boolean } => {
	const hasAlias = canonicalPath.includes("|");
	let linkPath = canonicalPath;
	let alias = "";

	if (hasAlias) {
		[linkPath, alias] = canonicalPath.split("|");
	}

	return { linkPath, alias, hasAlias };
};

function isMarkdownTableLine(line: string): boolean {
    const trimmedLine = line.trim();
    // A line is considered a table line if it's not empty and starts and ends with '|'
    // This covers data rows, header rows, and separator lines like |---|---|
    // It also handles lines that might only contain the separator like |---|
    if (!trimmedLine || !trimmedLine.includes('|')) {
        return false;
    }
    // Check if it's a separator line: |---|---| or |:---|:---|
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|') && /^[|:\s-]+$/.test(trimmedLine)) {
        return true;
    }
    // Check if it's a data/header row: | Col A | Col B |
    return trimmedLine.startsWith('|') && trimmedLine.endsWith('|');
}

function isIndexInsideMarkdownTable(text: string, index: number): boolean {
    const lines = text.split('\n');
    let charCount = 0;
    for (const line of lines) {
        const lineStart = charCount;
        const lineEnd = charCount + line.length;

        if (index >= lineStart && index <= lineEnd) {
            return isMarkdownTableLine(line);
        }
        charCount += line.length + 1; // +1 for the newline character
    }
    return false;
}

// Processing functions for different text types
const processCjkText = (
	text: string,
	trie: TrieNode,
	candidateMap: Map<string, CandidateData>,
	currentNamespace: string,
	filePath: string, // Add filePath parameter
	settings: ReplaceLinksSettings = {},
): string => {
	// For CJK texts that might contain non-CJK terms like "taro-san", ensure we use a consistent approach
	// Pass the proper filePath to maintain correct namespace resolution
	return processStandardText(
		text,
		trie,
		candidateMap,
		buildFallbackIndex(candidateMap, settings.ignoreCase),
		filePath,
		currentNamespace,
		settings,
	);
};

const handleKoreanSpecialCases = (
	text: string,
	i: number,
	candidate: string,
	candidateData: CandidateData,
	settings: ReplaceLinksSettings = {},
): { result: string; newIndex: number } | null => {
	const remaining = text.slice(i + candidate.length);

	// Special handling when followed by "이다"
	const suffixMatch = remaining.match(/^(이다\.?)/);
	if (suffixMatch) {
		const { linkPath, alias, hasAlias } = extractLinkParts(
			candidateData.canonical,
		);
		const normalizedPath = normalizeCanonicalPath(
			linkPath,
			settings.baseDir,
		);

		let result = "";
		// Format the link with the suffix
		if (hasAlias) {
			result = `[[${normalizedPath}|${alias}]]` + suffixMatch[0];
		} else if (normalizedPath.includes("/")) {
			const segments = normalizedPath.split("/");
			const lastPart = segments[segments.length - 1];
			result = `[[${normalizedPath}|${lastPart}]]` + suffixMatch[0];
		} else {
			result = `[[${normalizedPath}]]` + suffixMatch[0];
		}

		return {
			result,
			newIndex: i + candidate.length + suffixMatch[0].length,
		};
	}

	// Special handling when followed by particles like "는" or "은"
	if (remaining.match(/^(는|은)/)) {
		// Don't convert to links when followed by Korean particles
		return {
			result: text[i],
			newIndex: i + 1,
		};
	}

	return null;
};

const findBestCandidateInSameNamespace = (
	filteredCandidates: Array<[string, CandidateData]>,
	filePath: string,
	settings: ReplaceLinksSettings = {},
): [string, CandidateData] | null => {
	let bestCandidate: [string, CandidateData] | null = null;
	let bestScore = -1;

	// Get the directory portion of the current file (if any)
	const filePathDir = filePath.includes("/")
		? filePath.slice(0, filePath.lastIndexOf("/"))
		: "";
	const filePathSegments = filePathDir ? filePathDir.split("/") : [];

	for (const [key, data] of filteredCandidates) {
		const slashIndex = key.lastIndexOf("/");
		const candidateDir = key.slice(0, slashIndex);
		const candidateSegments = candidateDir.split("/");
		let score = 0;

		// Calculate common prefix score
		for (
			let idx = 0;
			idx < Math.min(candidateSegments.length, filePathSegments.length);
			idx++
		) {
			if (candidateSegments[idx] === filePathSegments[idx]) {
				score++;
			} else {
				break;
			}
		}

		if (score > bestScore) {
			bestScore = score;
			bestCandidate = [key, data];
		} else if (score === bestScore && bestCandidate !== null) {
			if (filePathDir === "" && settings.baseDir) {
				// When the current file is in the base directory, compare candidates by relative depth
				const basePrefix = settings.baseDir + "/";
				const getRelativeDepth = (k: string): number => {
					if (k.startsWith(basePrefix)) {
						// Remove the baseDir part and count the remaining segments
						const relativeParts = k
							.slice(basePrefix.length)
							.split("/");
						return relativeParts.length - 1;
					}
					return Infinity;
				};

				const candidateDepth = getRelativeDepth(key);
				const bestCandidateDepth = getRelativeDepth(bestCandidate[0]);

				// Prefer the candidate with lower depth or shorter path
				if (
					candidateDepth < bestCandidateDepth ||
					(candidateDepth === bestCandidateDepth &&
						key.length < bestCandidate[0].length)
				) {
					bestCandidate = [key, data];
				}
			} else {
				// Otherwise, choose the candidate with fewer directory segments
				const currentBestDir = bestCandidate[0].slice(
					0,
					bestCandidate[0].lastIndexOf("/"),
				);
				const currentBestSegments = currentBestDir.split("/");

				if (
					candidateSegments.length < currentBestSegments.length ||
					(candidateSegments.length === currentBestSegments.length &&
						key.length < bestCandidate[0].length)
				) {
					bestCandidate = [key, data];
				}
			}
		}
	}

	return bestCandidate;
};

const processStandardText = (
	text: string,
	trie: TrieNode,
	candidateMap: Map<string, CandidateData>,
	fallbackIndex: Map<string, Array<[string, CandidateData]>>,
	filePath: string,
	currentNamespace: string,
	settings: ReplaceLinksSettings = {},
): string => {
	let result = "";
	let i = 0;

	outer: while (i < text.length) {
		// Check for URLs first
		const urlMatch = text.slice(i).match(URL_REGEX);
		if (urlMatch) {
			result += urlMatch[0];
			i += urlMatch[0].length;
			continue;
		}

		// Try to find a candidate using the trie
		let node = trie;
		let lastCandidate: { candidate: string; length: number } | null = null;
		let j = i;

		while (j < text.length) {
			const ch = settings.ignoreCase ? text[j].toLowerCase() : text[j];
			const child = node.children.get(ch);
			if (!child) break;

			node = child;
			if (node.candidate) {
				const candidate = text.substring(i, j + 1);
				const isCjkCandidate = CJK_CANDIDATE_REGEX.test(candidate);

				if (isCjkCandidate || isWordBoundary(text[j + 1])) {
					lastCandidate = {
						candidate: node.candidate,
						length: j - i + 1,
					};
				}
			}
			j++;
		}

		if (lastCandidate) {
			const candidate = text.substring(i, i + lastCandidate.length);

			// Skip if it's a date format
			if (
				settings.ignoreDateFormats &&
				DATE_FORMAT_REGEX.test(candidate)
			) {
				result += candidate;
				i += lastCandidate.length;
				continue outer;
			}

			// Skip month notes
			if (isMonthNote(candidate)) {
				result += candidate;
				i += lastCandidate.length;
				continue;
			}

			// Use the candidate found in the trie (lastCandidate.candidate) to look up in candidateMap
			const trieCandidateKey = lastCandidate.candidate;

			// candidateMap lookup should always use the exact key from the trie result.
			// Case comparison happened during trie traversal if ignoreCase is true.
			const candidateData = candidateMap.get(trieCandidateKey);

			// Store the original text matched for potential use as display text
			const originalMatchedText = text.substring(
				i,
				i + lastCandidate.length,
			);

			if (candidateData) {
				// Handle Korean special cases
				const isKorean = KOREAN_REGEX.test(candidate);
				if (isKorean) {
					const koreanResult = handleKoreanSpecialCases(
						text,
						i,
						candidate,
						candidateData,
						settings,
					);
					if (koreanResult) {
						result += koreanResult.result;
						i = koreanResult.newIndex;
						continue outer;
					}
				}

				// Word boundary check for non-CJK text
				const isCjkCandidate = CJK_CANDIDATE_REGEX.test(candidate);
				if (!isCjkCandidate) {
					const left = i > 0 ? text[i - 1] : undefined;
					const right =
						i + candidate.length < text.length
							? text[i + candidate.length]
							: undefined;

					if (!isWordBoundary(left) || !isWordBoundary(right)) {
						result += text[i];
						i++;
						continue outer;
					}
				}

				// Check for Japanese particles
				const isJapaneseCandidate =
					JAPANESE_REGEX.test(candidate) &&
					!KOREAN_REGEX.test(candidate);
				if (isJapaneseCandidate) {
					const right =
						i + candidate.length < text.length
							? text.slice(
									i + candidate.length,
									i + candidate.length + 10,
								)
							: "";

					// Check for Japanese particles (no action needed, just a check point)
					if (
						right.match(
							/^(が|は|を|に|で|と|から|まで|より|へ|の|や|で|も)/,
						)
					) {
						// Skip word boundary check for Japanese particles
					}
				}

				// Skip if namespace restriction applies
				if (
					settings.namespaceResolution &&
					candidateData.restrictNamespace &&
					candidateData.namespace !== currentNamespace
				) {
					result += candidate;
					i += candidate.length;
					continue outer;
				}

				// Process the link
				const { linkPath, alias, hasAlias } = extractLinkParts(
					candidateData.canonical,
				);
				const normalizedPath = normalizeCanonicalPath(
					linkPath,
					settings.baseDir,
				);

				// Determine link content (path and alias if any)
				let linkContent: string;
				if (hasAlias) {
					linkContent = `${normalizedPath}|${alias}`;
				} else if (normalizedPath.includes("/")) {
					const displayText = settings.ignoreCase
						? originalMatchedText
						: normalizedPath.split("/").pop() ||
							originalMatchedText;
					linkContent = `${normalizedPath}|${displayText}`;
				} else {
                    // Simpler logic for the "else" block (no explicit alias, no namespace in normalizedPath)
                    if (settings.ignoreCase && originalMatchedText.toLowerCase() === normalizedPath.toLowerCase() && originalMatchedText !== normalizedPath) {
                        // Case difference, use original as alias
                        linkContent = `${normalizedPath}|${originalMatchedText}`;
                    } else if (!settings.ignoreCase && originalMatchedText !== normalizedPath) {
                        // Different text, not due to case, use original as alias
                        linkContent = `${normalizedPath}|${originalMatchedText}`;
                    }
                    else {
                        // Otherwise, just the path
                        linkContent = normalizedPath;
                    }
				}

				// Escape pipe if inside a table and an alias exists (i.e., linkContent contains '|')
				if (isIndexInsideMarkdownTable(text, i) && linkContent.includes("|")) {
					linkContent = linkContent.replace(/\|/g, "\\|"); // Replace all pipes
				}
				result += `[[${linkContent}]]`;

				i += candidate.length;
				continue outer;
			}
		}

		// Fallback: if no candidate was found via the trie, try multi-word fallback lookup.
		if (settings.namespaceResolution) {
			let longestMatch: {
				word: string;
				length: number;
				key: string;
				candidateList: Array<[string, CandidateData]>;
			} | null = null;

			// Iterate through potential multi-word sequences starting from i
			for (let k = i; k < text.length; k++) {
				const potentialMatch = text.substring(i, k + 1);
				const searchWord = settings.ignoreCase
					? potentialMatch.toLowerCase()
					: potentialMatch;

				// Basic boundary check: next char should be a boundary if not end of text
				const nextChar = text[k + 1];
				if (!isWordBoundary(nextChar)) {
					// If the potential match itself isn't in the index, continue extending
					if (!fallbackIndex.has(searchWord)) {
						continue;
					}
					// If it is in the index, but the next char isn't a boundary, it's not a valid match end here.
					// But a shorter version might have been valid, so we don't break yet.
				}

				const candidateList = fallbackIndex.get(searchWord);
				if (candidateList) {
					// Check word boundary at the beginning
					const prevChar = text[i - 1];
					if (!isWordBoundary(prevChar)) {
						// If the start isn't a word boundary, this isn't a valid match.
						// However, a shorter match starting later might be, so just continue the outer loop.
						// We break the inner loop (k) because extending this further won't help.
						break;
					}

					// Skip date formats
					if (
						settings.ignoreDateFormats &&
						DATE_FORMAT_REGEX.test(potentialMatch)
					) {
						continue; // Try longer match
					}
					// Skip month notes
					if (isMonthNote(potentialMatch)) {
						continue; // Try longer match
					}

					// Found a potential candidate in the fallback index
					longestMatch = {
						word: potentialMatch,
						length: potentialMatch.length,
						key: searchWord,
						candidateList: candidateList,
					};
					// Continue checking for even longer matches
				} else if (longestMatch && k > i + longestMatch.length - 1) {
					// If we had a match but the current longer string doesn't match,
					// stop extending for this starting position 'i'.
					break;
				}
			}

			// Process the longest valid match found
			if (longestMatch) {
				// Filter candidates based on namespace restrictions
				const filteredCandidates = longestMatch.candidateList.filter(
					([, data]) =>
						!(
							data.restrictNamespace &&
							data.namespace !== currentNamespace
						),
				);

				let bestCandidateData: CandidateData | null = null;

				if (filteredCandidates.length === 1) {
					bestCandidateData = filteredCandidates[0][1];
				} else if (filteredCandidates.length > 1) {
					const bestCandidateResult =
						findBestCandidateInSameNamespace(
							filteredCandidates,
							filePath,
							settings,
						);
					if (bestCandidateResult) {
						bestCandidateData = bestCandidateResult[1];
					}
				}

				if (bestCandidateData) {
					// Found a valid candidate through fallback

					const { linkPath, alias, hasAlias } = extractLinkParts(
						bestCandidateData.canonical,
					);
					const normalizedPath = normalizeCanonicalPath(
						linkPath,
						settings.baseDir,
					);

					// Determine link content (path and alias if any)
					const originalMatchedWord = longestMatch.word;
					let linkContent: string;
					if (hasAlias) {
						linkContent = `${normalizedPath}|${alias}`;
					} else if (normalizedPath.includes("/")) {
						const displayText = settings.ignoreCase
							? originalMatchedWord
							: normalizedPath.split("/").pop() ||
								originalMatchedWord;
						linkContent = `${normalizedPath}|${displayText}`;
					} else {
                        // Simpler logic for the "else" block (no explicit alias, no namespace in normalizedPath)
                        if (settings.ignoreCase && originalMatchedWord.toLowerCase() === normalizedPath.toLowerCase() && originalMatchedWord !== normalizedPath) {
                            // Case difference, use original as alias
                            linkContent = `${normalizedPath}|${originalMatchedWord}`;
                        } else if (!settings.ignoreCase && originalMatchedWord !== normalizedPath) {
                            // Different text, not due to case, use original as alias
                            linkContent = `${normalizedPath}|${originalMatchedWord}`;
                        }
                        else {
                            // Otherwise, just the path
                            linkContent = normalizedPath;
                        }
					}

					// Escape pipe if inside a table and an alias exists (i.e., linkContent contains '|')
					if (isIndexInsideMarkdownTable(text, i) && linkContent.includes("|")) {
						linkContent = linkContent.replace(/\|/g, "\\|"); // Replace all pipes
					}
					result += `[[${linkContent}]]`;

					i += longestMatch.length; // Advance index by the length of the matched word
					continue outer; // Continue processing from the new index
				}
			}
		}

		// If no rule applies, output the current character
		result += text[i];
		i++;
	}

	return result;
};

// Main function
export const replaceLinks = ({
	body,
	linkResolverContext: { filePath, trie, candidateMap },
	settings = {
		minCharCount: 0,
		namespaceResolution: true,
		baseDir: undefined,
		ignoreDateFormats: true,
	},
}: ReplaceLinksOptions): string => {
	// Return the body unchanged if its length is below the minimum character count
	if (body.length <= (settings.minCharCount ?? 0)) {
		return body;
	}

	// Normalize the body text to NFC
	body = body.normalize("NFC");

	// If the body consists solely of a protected link, return it unchanged
	if (isProtectedLink(body)) {
		return body;
	}

	// Build the fallback index
	const fallbackIndex = buildFallbackIndex(candidateMap, settings.ignoreCase);

	// Get the current namespace
	const currentNamespace = getCurrentNamespace(filePath, settings.baseDir);

	// Process segments of text
	const processTextSegment = (text: string): string => {
		// Check if the text contains CJK characters
		const isCjkText = CJK_REGEX.test(text);

		if (isCjkText) {
			return processCjkText(
				text,
				trie,
				candidateMap,
				currentNamespace,
				filePath,
				settings,
			);
		} else {
			return processStandardText(
				text,
				trie,
				candidateMap,
				fallbackIndex,
				filePath,
				currentNamespace,
				settings,
			);
		}
	};

	// Process the entire body while preserving protected segments
	let resultBody = "";
	let lastIndex = 0;

	for (const m of body.matchAll(PROTECTED_REGEX)) {
		const mIndex = m.index ?? 0;
		const segment = body.slice(lastIndex, mIndex);
		resultBody += processTextSegment(segment);
		// Append the protected segment unchanged
		resultBody += m[0];
		lastIndex = mIndex + m[0].length;
	}

	// Process the remaining text
	resultBody += processTextSegment(body.slice(lastIndex));

	return resultBody;
};
