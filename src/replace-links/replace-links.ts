import { CandidateData, getEffectiveNamespace, TrieNode } from "../trie";

// Types for the replaceLinks function
export interface LinkResolverContext {
	filePath: string;
	trie: TrieNode;
	candidateMap: Map<string, CandidateData>;
}

export interface ReplaceLinksSettings {
	namespaceResolution?: boolean;
	baseDir?: string;
	ignoreDateFormats?: boolean;
	ignoreCase?: boolean;
	preventSelfLinking?: boolean;
	removeAliasInDirs?: string[];
}

export interface LinkGeneratorParams {
	linkPath: string;
	sourcePath: string;
	alias?: string;
	isInTable?: boolean;
}

export type LinkGenerator = (params: LinkGeneratorParams) => string;

export interface ReplaceLinksOptions {
	body: string;
	linkResolverContext: LinkResolverContext;
	settings?: ReplaceLinksSettings;
	linkGenerator?: LinkGenerator;
}

// Constants and Regular Expressions
const REGEX_PATTERNS = {
	PROTECTED: /(```[\s\S]*?```|`[^`]*`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\[[^\]]+\]|https?:\/\/[^\s]+)/g,
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
	WORD_BOUNDARY: /[\p{L}\p{N}_/-]/u,
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
	if (baseDir && linkPath.startsWith(baseDir + "/")) {
		return linkPath.slice((baseDir + "/").length);
	}
	return linkPath;
};

const extractLinkParts = (
	canonicalPath: string,
): { linkPath: string; alias: string; hasAlias: boolean } => {
	const pipeIndex = canonicalPath.indexOf("|");
	const hasAlias = pipeIndex !== -1;

	if (hasAlias) {
		const linkPath = canonicalPath.slice(0, pipeIndex);
		const alias = canonicalPath.slice(pipeIndex + 1);
		return { linkPath, alias, hasAlias };
	}

	return { linkPath: canonicalPath, alias: "", hasAlias };
};

// Self-linking Prevention
const isSelfLink = (
	candidateData: CandidateData,
	currentFilePath: string,
	settings: ReplaceLinksSettings = {},
): boolean => {
	if (!settings.preventSelfLinking) {
		return false;
	}

	// Extract the link path from the canonical path
	const { linkPath } = extractLinkParts(candidateData.canonical);

	// Normalize paths for comparison
	const normalizedLinkPath = normalizeCanonicalPath(linkPath, settings.baseDir);
	const normalizedCurrentPath = normalizeCanonicalPath(currentFilePath, settings.baseDir);

	// Compare the paths
	return normalizedLinkPath === normalizedCurrentPath;
};

// Helper function to check if a path should have its alias removed
const shouldRemoveAlias = (normalizedPath: string, removeAliasInDirs?: string[]): boolean => {
	if (!removeAliasInDirs || removeAliasInDirs.length === 0) {
		return false;
	}

	// Early return for paths without slashes
	if (!normalizedPath.includes("/")) {
		return false;
	}

	// Check if the normalized path starts with any of the specified directories
	for (const dir of removeAliasInDirs) {
		if (normalizedPath === dir || normalizedPath.startsWith(dir + "/")) {
			return true;
		}
	}

	return false;
};

// Link Content Creation
const createLinkContent = (
	candidateData: CandidateData,
	originalMatchedText: string,
	settings: ReplaceLinksSettings = {},
): { linkPath: string; alias?: string } => {
	const { linkPath, alias, hasAlias } = extractLinkParts(candidateData.canonical);
	const normalizedPath = normalizeCanonicalPath(linkPath, settings.baseDir);

	// Check if alias should be removed for this directory
	const removeAlias = shouldRemoveAlias(normalizedPath, settings.removeAliasInDirs);

	if (hasAlias) {
		// If alias removal is enabled for this directory, return path without alias
		if (removeAlias) {
			return { linkPath: normalizedPath };
		}
		// Use originalMatchedText to preserve case when ignoreCase is enabled
		const displayAlias = settings.ignoreCase ? originalMatchedText : alias;
		return { linkPath: normalizedPath, alias: displayAlias };
	}

	if (normalizedPath.includes("/")) {
		// If alias removal is enabled for this directory, return path without alias
		if (removeAlias) {
			return { linkPath: normalizedPath };
		}

		// For paths with slashes, use the last segment as the display text
		const lastSegment = normalizedPath.split("/").pop() || originalMatchedText;

		// If ignoreCase is enabled and originalMatchedText contains a slash,
		// use the last segment of originalMatchedText to preserve case
		let displayText = lastSegment;
		if (settings.ignoreCase && originalMatchedText.includes("/")) {
			const originalLastSegment = originalMatchedText.split("/").pop();
			if (originalLastSegment) {
				displayText = originalLastSegment;
			}
		} else if (settings.ignoreCase) {
			// If originalMatchedText doesn't contain a slash, use it as-is
			displayText = originalMatchedText;
		}

		return { linkPath: normalizedPath, alias: displayText };
	}

	// No explicit alias, no '/' in normalizedPath
	if (settings.ignoreCase) {
		if (originalMatchedText.toLowerCase() === normalizedPath.toLowerCase()) {
			return { linkPath: originalMatchedText };
		} else {
			return { linkPath: normalizedPath, alias: originalMatchedText };
		}
	} else {
		if (originalMatchedText !== normalizedPath) {
			return { linkPath: normalizedPath, alias: originalMatchedText };
		} else {
			return { linkPath: normalizedPath };
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

// Default link generator that creates standard Obsidian wikilinks
export const defaultLinkGenerator: LinkGenerator = ({
	linkPath,
	alias,
	isInTable = false,
}: LinkGeneratorParams): string => {
	let linkContent = linkPath;

	if (alias) {
		linkContent = `${linkPath}|${alias}`;
	}

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
	filePath: string,
	linkGenerator: LinkGenerator,
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
		linkGenerator,
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
	linkGenerator: LinkGenerator,
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

	let potentialMatch = '';
	let searchWord = '';

	for (let length = 1; length <= maxSearchLength; length++) {
		const endIndex = startIndex + length;
		const currentChar = text[startIndex + length - 1];
		potentialMatch += currentChar;
		searchWord = settings.ignoreCase
			? searchWord + currentChar.toLowerCase()
			: potentialMatch;

		// Check if this potential match exists in fallback index
		const candidateList = fallbackIndex.get(searchWord);
		if (!candidateList) {
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
		([, data]) => !(data.scoped && data.namespace !== currentNamespace)
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

	// Check if this is a self-link and should be prevented
	if (isSelfLink(bestCandidateData, filePath, settings)) {
		return {
			result: longestMatch.word,
			newIndex: startIndex + longestMatch.length
		};
	}

	// Create the link
	const { linkPath, alias } = createLinkContent(bestCandidateData, longestMatch.word, settings);
	const isInTable = isIndexInsideMarkdownTable(text, startIndex);
	const finalLink = linkGenerator({
		linkPath,
		sourcePath: filePath,
		alias,
		isInTable,
	});

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
	filePath: string,
	linkGenerator: LinkGenerator,
	settings: ReplaceLinksSettings = {},
): { result: string; newIndex: number } | null => {
	const remaining = text.slice(i + candidate.length);

	// Special handling when followed by "이다"
	const suffixMatch = remaining.match(REGEX_PATTERNS.KOREAN_SUFFIX);
	if (suffixMatch) {
		// Check if this is a self-link and should be prevented
		if (isSelfLink(candidateData, filePath, settings)) {
			return {
				result: candidate + suffixMatch[0],
				newIndex: i + candidate.length + suffixMatch[0].length,
			};
		}

		const { linkPath, alias } = createLinkContent(candidateData, candidate, settings);
		const finalLink = linkGenerator({
			linkPath,
			sourcePath: filePath,
			alias,
			isInTable: false,
		});

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
	linkGenerator: LinkGenerator,
	settings: ReplaceLinksSettings = {},
): string => {
	let result = "";
	let i = 0;

	outer: while (i < text.length) {
		// Check for URLs first - only if current character could start a URL
		if (text[i] === 'h' && text.slice(i, i + 4) === 'http') {
			const urlMatch = text.slice(i).match(REGEX_PATTERNS.URL);
			if (urlMatch) {
				result += urlMatch[0];
				i += urlMatch[0].length;
				continue;
			}
		}

		// Try to find a candidate using the trie
		let node = trie;
		let lastCandidate: { candidate: string; length: number } | null = null;
		let j = i;
		let candidateBuilder = '';

		while (j < text.length) {
			const ch = text[j];
			const chLower = settings.ignoreCase ? ch.toLowerCase() : ch;
			candidateBuilder += ch;
			
			const child = node.children.get(chLower);
			if (!child) break;

			node = child;
			if (node.candidate) {
				const candidateIsCjk = isCjkCandidate(candidateBuilder);

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
			const candidate = candidateBuilder.slice(0, lastCandidate.length);

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
				// Check if this is a self-link and should be prevented
				if (isSelfLink(candidateData, filePath, settings)) {
					result += candidate;
					i += candidate.length;
					continue outer;
				}

				// Handle Korean special cases
				const isKorean = isKoreanText(candidate);
				if (isKorean) {
					const koreanResult = handleKoreanSpecialCases(
						text,
						i,
						candidate,
						candidateData,
						filePath,
						linkGenerator,
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
					candidateData.scoped &&
					candidateData.namespace !== currentNamespace
				) {
					result += candidate;
					i += candidate.length;
					continue outer;
				}

				// Create the link
				const { linkPath, alias } = createLinkContent(candidateData, originalMatchedText, settings);
				const isInTable = isIndexInsideMarkdownTable(text, i);
				const finalLink = linkGenerator({
					linkPath,
					sourcePath: filePath,
					alias,
					isInTable,
				});
				result += finalLink;

				i += candidate.length;
				continue outer;
			}
		}

		// Fallback: multi-word lookup using fallback index
		if (settings.namespaceResolution) {
			const fallbackResult = processFallbackSearch(
				text, i, fallbackIndex, filePath, currentNamespace, linkGenerator, settings
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
		namespaceResolution: true,
		baseDir: undefined,
		ignoreDateFormats: true,
	},
	linkGenerator = defaultLinkGenerator,
}: ReplaceLinksOptions): string => {
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
				linkGenerator,
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
				linkGenerator,
				settings,
			);
		}
	};

	// Extract and protect callout blocks first
	// Match callout blocks: starts with > [!type] and continues with lines starting with >
	const calloutPattern = /^>[ \t]*\[![\w-]+\].*?(\n>.*?)*(?=\n(?!>)|$)/gm;
	const callouts: Array<{ placeholder: string; content: string }> = [];
	let calloutIndex = 0;

	// Replace callouts with placeholders
	const bodyWithPlaceholders = body.replace(calloutPattern, (match) => {
		const placeholder = `__CALLOUT_${calloutIndex}__`;
		callouts.push({ placeholder, content: match });
		calloutIndex++;
		return placeholder;
	});

	// Process the entire body while preserving protected segments
	let resultBody = "";
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	// Reset the regex to start from the beginning
	REGEX_PATTERNS.PROTECTED.lastIndex = 0;

	while ((match = REGEX_PATTERNS.PROTECTED.exec(bodyWithPlaceholders)) !== null) {
		const mIndex = match.index;
		const segment = bodyWithPlaceholders.slice(lastIndex, mIndex);
		resultBody += processTextSegment(segment);
		// Append the protected segment unchanged
		resultBody += match[0];
		lastIndex = mIndex + match[0].length;

		// Prevent infinite loop on zero-length matches
		if (match[0].length === 0) {
			REGEX_PATTERNS.PROTECTED.lastIndex++;
		}
	}

	// Process the remaining text
	resultBody += processTextSegment(bodyWithPlaceholders.slice(lastIndex));

	// Restore callouts
	for (const { placeholder, content } of callouts) {
		resultBody = resultBody.replace(placeholder, content);
	}

	return resultBody;
};
