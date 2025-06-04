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

// Constants and Regular Expressions
const REGEX_PATTERNS = {
	PROTECTED: /(```[\s\S]*?```|`[^`]*`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s]+)/g,
	DATE_FORMAT: /^\d{4}-\d{2}-\d{2}$/,
	MONTH_NOTE: /^[0-9]{1,2}$/,
	CJK: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
	CJK_CANDIDATE: /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s\d]+$/u,
	KOREAN: /^[\p{Script=Hangul}]+$/u,
	JAPANESE: /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\s\d]+$/u,
	URL: /^(https?:\/\/[^\s]+)/,
	PROTECTED_LINK: /^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/,
	KOREAN_SUFFIX: /^(이다\.?)/,
	KOREAN_PARTICLES: /^(는|은)/,
	JAPANESE_PARTICLES: /^(가|는|을|에|서|와|로부터|까지|보다|로|의|나|도|또한)/,
	TABLE_SEPARATOR: /^[|:\s-]+$/,
	WORD_BOUNDARY: /[\p{L}\p{N}_\/-]/u,
	WHITESPACE: /[\t\n\r ]/
} as const;

// Text Analysis Utilities
const isWordBoundary = (char: string | undefined): boolean => {
	if (char === undefined) return true;
	if (REGEX_PATTERNS.CJK.test(char)) return true;
	return !REGEX_PATTERNS.WORD_BOUNDARY.test(char) || REGEX_PATTERNS.WHITESPACE.test(char);
};

const isMonthNote = (candidate: string): boolean =>
	REGEX_PATTERNS.MONTH_NOTE.test(candidate) &&
	parseInt(candidate, 10) >= 1 &&
	parseInt(candidate, 10) <= 12;

const isProtectedLink = (body: string): boolean => 
	REGEX_PATTERNS.PROTECTED_LINK.test(body);

const isCjkText = (text: string): boolean => REGEX_PATTERNS.CJK.test(text);

const isCjkCandidate = (candidate: string): boolean => 
	REGEX_PATTERNS.CJK_CANDIDATE.test(candidate);

const isKoreanText = (text: string): boolean => REGEX_PATTERNS.KOREAN.test(text);

const isJapaneseText = (text: string): boolean => 
	REGEX_PATTERNS.JAPANESE.test(text) && !REGEX_PATTERNS.KOREAN.test(text);

// Cache for fallback index to avoid rebuilding
const fallbackIndexCache = new WeakMap<
	Map<string, CandidateData>,
	Map<string, Map<string, Array<[string, CandidateData]>>>
>();

const buildFallbackIndex = (
	candidateMap: Map<string, CandidateData>,
	ignoreCase?: boolean,
): Map<string, Array<[string, CandidateData]>> => {
	// Get or create cache for this candidateMap
	let cacheForMap = fallbackIndexCache.get(candidateMap);
	if (!cacheForMap) {
		cacheForMap = new Map();
		fallbackIndexCache.set(candidateMap, cacheForMap);
	}

	// Check if we have cached result for this ignoreCase setting
	const cacheKey = ignoreCase ? "ignoreCase" : "normal";
	const cached = cacheForMap.get(cacheKey);
	if (cached) {
		return cached;
	}

	// Build new fallback index
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

	// Cache the result
	cacheForMap.set(cacheKey, fallbackIndex);
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

// Link Content Creation
const createLinkContent = (
	candidateData: CandidateData,
	originalMatchedText: string,
	settings: ReplaceLinksSettings = {},
): string => {
	const { linkPath, alias, hasAlias } = extractLinkParts(candidateData.canonical);
	const normalizedPath = normalizeCanonicalPath(linkPath, settings.baseDir);

	if (hasAlias) {
		return `${normalizedPath}|${alias}`;
	}

	if (normalizedPath.includes("/")) {
		const displayText = settings.ignoreCase
			? originalMatchedText
			: normalizedPath.split("/").pop() || originalMatchedText;
		return `${normalizedPath}|${displayText}`;
	}

	// No explicit alias, no '/' in normalizedPath
	if (settings.ignoreCase) {
		if (originalMatchedText.toLowerCase() === normalizedPath.toLowerCase()) {
			return originalMatchedText;
		} else {
			return `${normalizedPath}|${originalMatchedText}`;
		}
	} else {
		if (originalMatchedText !== normalizedPath) {
			return `${normalizedPath}|${originalMatchedText}`;
		} else {
			return normalizedPath;
		}
	}
};

const formatFinalLink = (
	linkContent: string,
	isInTable: boolean,
): string => {
	if (isInTable && linkContent.includes("|")) {
		linkContent = linkContent.replace(/\|/g, "\\|");
	}
	return `[[${linkContent}]]`;
};

// Candidate Validation
const shouldSkipCandidate = (candidate: string, settings: ReplaceLinksSettings): boolean => {
	if (settings.ignoreDateFormats && REGEX_PATTERNS.DATE_FORMAT.test(candidate)) {
		return true;
	}
	return isMonthNote(candidate);
};

// Markdown Table Detection
const isMarkdownTableLine = (line: string): boolean => {
	const trimmedLine = line.trim();
	if (!trimmedLine || !trimmedLine.includes('|')) {
		return false;
	}
	
	if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|') && 
		REGEX_PATTERNS.TABLE_SEPARATOR.test(trimmedLine)) {
		return true;
	}
	
	return trimmedLine.startsWith('|') && trimmedLine.endsWith('|');
};

const isIndexInsideMarkdownTable = (text: string, index: number): boolean => {
	// Find the start of the line containing the index
	let lineStart = text.lastIndexOf('\n', index - 1) + 1;
	if (lineStart === 0 && text[0] !== '\n') {
		lineStart = 0;
	}

	// Find the end of the line containing the index
	let lineEnd = text.indexOf('\n', index);
	if (lineEnd === -1) {
		lineEnd = text.length;
	}

	// Extract the line and check if it's a table line
	const line = text.slice(lineStart, lineEnd);
	return isMarkdownTableLine(line);
};

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

// Fallback Search Processing
const processFallbackSearch = (
	text: string,
	startIndex: number,
	fallbackIndex: Map<string, Array<[string, CandidateData]>>,
	filePath: string,
	currentNamespace: string,
	settings: ReplaceLinksSettings
): { result: string; newIndex: number } | null => {
	// Early boundary check - if start isn't a word boundary, skip
	const prevChar = text[startIndex - 1];
	if (!isWordBoundary(prevChar)) {
		return null;
	}

	let longestMatch: {
		word: string;
		length: number;
		key: string;
		candidateList: Array<[string, CandidateData]>;
	} | null = null;

	// Iterate through potential multi-word sequences starting from startIndex
	const maxSearchLength = Math.min(text.length - startIndex, 100); // Limit search length for performance
	for (let length = 1; length <= maxSearchLength; length++) {
		const endIndex = startIndex + length;
		const potentialMatch = text.substring(startIndex, endIndex);
		const searchWord = settings.ignoreCase
			? potentialMatch.toLowerCase()
			: potentialMatch;

		// Check if this potential match exists in fallback index
		const candidateList = fallbackIndex.get(searchWord);
		if (!candidateList) {
			// If no match found and we already have a longest match, 
			// unlikely to find longer matches, so break early
			if (longestMatch) {
				break;
			}
			continue;
		}

		// Basic boundary check: next char should be a boundary if not end of text
		const nextChar = text[endIndex];
		if (!isWordBoundary(nextChar)) {
			continue; // This isn't a valid match end
		}

		// Skip date formats and month notes
		if (shouldSkipCandidate(potentialMatch, settings)) {
			continue; // Try longer match
		}

		// Found a valid candidate
		longestMatch = {
			word: potentialMatch,
			length: length,
			key: searchWord,
			candidateList: candidateList,
		};
		// Continue checking for even longer matches
	}

	// Process the longest valid match found
	if (!longestMatch) return null;

	// Filter candidates based on namespace restrictions
	const filteredCandidates = longestMatch.candidateList.filter(
		([, data]) => !(data.restrictNamespace && data.namespace !== currentNamespace)
	);

	let bestCandidateData: CandidateData | null = null;

	if (filteredCandidates.length === 1) {
		bestCandidateData = filteredCandidates[0][1];
	} else if (filteredCandidates.length > 1) {
		const bestCandidateResult = findBestCandidateInSameNamespace(
			filteredCandidates,
			filePath,
			settings,
		);
		if (bestCandidateResult) {
			bestCandidateData = bestCandidateResult[1];
		}
	}

	if (!bestCandidateData) return null;

	// Create the link
	const linkContent = createLinkContent(bestCandidateData, longestMatch.word, settings);
	const isInTable = isIndexInsideMarkdownTable(text, startIndex);
	const finalLink = formatFinalLink(linkContent, isInTable);

	return {
		result: finalLink,
		newIndex: startIndex + longestMatch.length
	};
};

// Korean Language Processing
const handleKoreanSpecialCases = (
	text: string,
	i: number,
	candidate: string,
	candidateData: CandidateData,
	settings: ReplaceLinksSettings = {},
): { result: string; newIndex: number } | null => {
	const remaining = text.slice(i + candidate.length);

	// Special handling when followed by "이다"
	const suffixMatch = remaining.match(REGEX_PATTERNS.KOREAN_SUFFIX);
	if (suffixMatch) {
		const linkContent = createLinkContent(candidateData, candidate, settings);
		const finalLink = formatFinalLink(linkContent, false);
		
		return {
			result: finalLink + suffixMatch[0],
			newIndex: i + candidate.length + suffixMatch[0].length,
		};
	}

	// Special handling when followed by particles like "는" or "은"
	if (remaining.match(REGEX_PATTERNS.KOREAN_PARTICLES)) {
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
		const urlMatch = text.slice(i).match(REGEX_PATTERNS.URL);
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
				const candidateIsCjk = isCjkCandidate(candidate);

				if (candidateIsCjk || isWordBoundary(text[j + 1])) {
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
				REGEX_PATTERNS.DATE_FORMAT.test(candidate)
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
				const isKorean = isKoreanText(candidate);
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
				const candidateIsCjk = isCjkCandidate(candidate);
				if (!candidateIsCjk) {
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
				const isJapaneseCandidate = isJapaneseText(candidate);
				if (isJapaneseCandidate) {
					const right =
						i + candidate.length < text.length
							? text.slice(
									i + candidate.length,
									i + candidate.length + 10,
								)
							: "";

					// Check for Japanese particles (no action needed, just a check point)
					if (right.match(REGEX_PATTERNS.JAPANESE_PARTICLES)) {
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

				// Create the link
				const linkContent = createLinkContent(candidateData, originalMatchedText, settings);
				const isInTable = isIndexInsideMarkdownTable(text, i);
				const finalLink = formatFinalLink(linkContent, isInTable);
				result += finalLink;

				i += candidate.length;
				continue outer;
			}
		}

		// Fallback: multi-word lookup using fallback index
		if (settings.namespaceResolution) {
			const fallbackResult = processFallbackSearch(
				text, i, fallbackIndex, filePath, currentNamespace, settings
			);
			if (fallbackResult) {
				result += fallbackResult.result;
				i = fallbackResult.newIndex;
				continue outer;
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
		const hasCjkText = isCjkText(text);

		if (hasCjkText) {
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

	for (const m of body.matchAll(REGEX_PATTERNS.PROTECTED)) {
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
