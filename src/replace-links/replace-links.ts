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
const FALLBACK_REGEX = /^([\p{L}\p{N}_-]+)/u;

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

const formatLink = (
	linkPath: string,
	displayText: string,
	hasExplicitAlias: boolean,
): string => {
	if (hasExplicitAlias || linkPath.includes("/")) {
		return `[[${linkPath}|${displayText}]]`;
	}
	return `[[${displayText}]]`;
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

			// Find candidate data with case-insensitive matching when needed
			let matchedCandidate = candidate;
			let candidateData: CandidateData | undefined;

			if (settings.ignoreCase) {
				for (const [key, data] of candidateMap.entries()) {
					if (key.toLowerCase() === candidate.toLowerCase()) {
						matchedCandidate = key;
						candidateData = data;
						break;
					}
				}
			} else {
				candidateData = candidateMap.get(candidate);
			}

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

				// Format the link
				if (hasAlias) {
					result += `[[${normalizedPath}|${alias}]]`;
				} else if (normalizedPath.includes("/")) {
					// When ignoreCase is enabled, use the original text to preserve case
					const originalText = settings.ignoreCase
						? text.substring(i, i + candidate.length)
						: candidate;
					const originalSegments = originalText.split("/");
					const displayText =
						originalSegments[originalSegments.length - 1];
					result += `[[${normalizedPath}|${displayText}]]`;
				} else {
					// When ignoreCase is enabled, use the original text to preserve case
					const displayText = settings.ignoreCase
						? text.substring(i, i + candidate.length)
						: matchedCandidate;
					result += `[[${displayText}]]`;
				}

				i += candidate.length;
				continue outer;
			}
		}

		// Fallback: if no candidate was found via the trie.
		if (settings.namespaceResolution) {
			const fallbackMatch = text.slice(i).match(FALLBACK_REGEX);
			if (fallbackMatch) {
				const word = settings.ignoreCase
					? fallbackMatch[1].toLowerCase()
					: fallbackMatch[1];

				// Skip date formats
				if (
					settings.ignoreDateFormats &&
					DATE_FORMAT_REGEX.test(word)
				) {
					result += word;
					i += word.length;
					continue outer;
				}

				// Skip dates and month notes
				if (/^\d{2}$/.test(word) && /\d{4}-\d{2}-$/.test(result)) {
					result += text[i];
					i++;
					continue outer;
				}

				if (isMonthNote(word)) {
					result += word;
					i += word.length;
					continue;
				}

				// Try fallback lookup
				const searchWord = settings.ignoreCase
					? word.toLowerCase()
					: word;
				const candidateList = fallbackIndex.get(searchWord);

				if (candidateList) {
					// Filter candidates to comply with namespace restrictions
					const filteredCandidates = candidateList.filter(
						([, data]) =>
							!(
								data.restrictNamespace &&
								data.namespace !== currentNamespace
							),
					);

					if (filteredCandidates.length === 1) {
						// Single match - straightforward case
						const candidateData = filteredCandidates[0][1];
						const { linkPath, alias, hasAlias } = extractLinkParts(
							candidateData.canonical,
						);
						const normalizedPath = normalizeCanonicalPath(
							linkPath,
							settings.baseDir,
						);

						// Format the link
						if (hasAlias) {
							result += `[[${normalizedPath}|${alias}]]`;
						} else if (normalizedPath.includes("/")) {
							const originalText = settings.ignoreCase
								? text.substring(i, i + word.length)
								: word;
							const originalSegments = originalText.split("/");
							const displayText =
								originalSegments[originalSegments.length - 1];
							result += `[[${normalizedPath}|${displayText}]]`;
						} else {
							result += `[[${word}]]`;
						}

						i += word.length;
						continue outer;
					} else if (filteredCandidates.length > 1) {
						// Multiple matches - find the best candidate
						const bestCandidate = findBestCandidateInSameNamespace(
							filteredCandidates,
							filePath,
							settings,
						);

						if (bestCandidate) {
							const candidateData = bestCandidate[1];
							const { linkPath, alias, hasAlias } =
								extractLinkParts(candidateData.canonical);
							const normalizedPath = normalizeCanonicalPath(
								linkPath,
								settings.baseDir,
							);

							// Format the link
							if (hasAlias) {
								result += `[[${normalizedPath}|${alias}]]`;
							} else if (normalizedPath.includes("/")) {
								const segments = normalizedPath.split("/");
								const lastPart = segments[segments.length - 1];
								result += `[[${normalizedPath}|${lastPart}]]`;
							} else {
								result += `[[${normalizedPath}]]`;
							}

							i += word.length;
							continue outer;
						}
					}
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
