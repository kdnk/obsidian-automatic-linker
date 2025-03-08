import { CandidateData, getEffectiveNamespace, TrieNode } from "../trie";

export const replaceLinks = ({
	body,
	linkResolverContext: { filePath, trie, candidateMap },
	settings = {
		minCharCount: 0,
		namespaceResolution: true,
		baseDir: undefined,
		ignoreDateFormats: true,
	},
}: {
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
		ignoreCase?: boolean;
	};
}): string => {
	// Return the body unchanged if its length is below the minimum character count.
	if (body.length <= (settings.minCharCount ?? 0)) {
		return body;
	}

	// Utility: Check if a character is a word boundary.
	const isWordBoundary = (char: string | undefined): boolean => {
		if (char === undefined) return true;
		// Normal word boundary check (applying general rules including CJK languages)
		return !/[\p{L}\p{N}_/-]/u.test(char) || /[\t\n\r ]/.test(char);
	};

	// Utility: Check if a candidate represents a month note (only digits from 1 to 12).
	const isMonthNote = (candidate: string): boolean =>
		!candidate.includes("/") &&
		/^[0-9]{1,2}$/.test(candidate) &&
		parseInt(candidate, 10) >= 1 &&
		parseInt(candidate, 10) <= 12;

	// Regex to protect code blocks, inline code, wikilinks, and Markdown links.
	const protectedRegex =
		/(```[\s\S]*?```|`[^`]*`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;

	// Normalize the body text to NFC.
	body = body.normalize("NFC");

	// If the body consists solely of a protected link, return it unchanged.
	if (/^\s*(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))\s*$/.test(body)) {
		return body;
	}

	// Precompute the fallback index: Map the candidate's shorthand (the substring after the last "/")
	// to an array of entries from candidateMap.
	const fallbackIndex = new Map<string, Array<[string, CandidateData]>>();
	for (const [key, data] of candidateMap.entries()) {
		const slashIndex = key.lastIndexOf("/");
		if (slashIndex === -1) continue;
		const shorthand = key.slice(slashIndex + 1);
		// When ignoreCase is enabled, use lowercase for the fallback index key
		const indexKey = settings.ignoreCase
			? shorthand.toLowerCase()
			: shorthand;
		let arr = fallbackIndex.get(indexKey);
		if (!arr) {
			arr = [];
			fallbackIndex.set(indexKey, arr);
		}
		arr.push([key, data]);
	}

	// Determine the effective namespace of the current file.
	const currentNamespace = settings.baseDir
		? getEffectiveNamespace(filePath, settings.baseDir)
		: (function () {
				const segments = filePath.split("/");
				return segments[0] || "";
			})();

	// Helper function to process an unprotected text segment.
	const replaceInSegment = (text: string): string => {
		let result = "";
		// Check if the text contains CJK characters
		const isCjkText =
			/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
				text,
			);

		// For CJK text, try matching from each character position
		if (isCjkText) {
			// Array to track processed positions
			const processed = new Array(text.length).fill(false);

			// Try matching from each character position
			for (let startPos = 0; startPos < text.length; startPos++) {
				// Skip positions that have already been processed
				if (processed[startPos]) continue;

				// Use the trie to find the longest match
				let node = trie;
				let lastCandidate: {
					candidate: string;
					length: number;
				} | null = null;
				let j = startPos;

				while (j < text.length) {
					const ch = settings.ignoreCase
						? text[j].toLowerCase()
						: text[j];
					const child = node.children.get(ch);
					if (!child) break;
					node = child;
					if (node.candidate) {
						lastCandidate = {
							candidate: node.candidate,
							length: j - startPos + 1,
						};
					}
					j++;
				}

				// If a candidate is found
				if (lastCandidate) {
					const candidate = text.substring(
						startPos,
						startPos + lastCandidate.length,
					);
					const candidateData = settings.ignoreCase
						? Array.from(candidateMap.entries()).find(
								([key]) =>
									key.toLowerCase() ===
									candidate.toLowerCase(),
							)?.[1]
						: candidateMap.get(candidate);

					if (candidateData) {
						// Check for date formats and month notes
						if (
							(settings.ignoreDateFormats &&
								/^\d{4}-\d{2}-\d{2}$/.test(candidate)) ||
							isMonthNote(candidate)
						) {
							// Do nothing (output as is)
						} else if (
							settings.namespaceResolution &&
							candidateData.restrictNamespace &&
							candidateData.namespace !== currentNamespace
						) {
							// Do nothing if namespace restriction applies
						} else {
							// Convert to link
							let linkPath = candidateData.canonical;
							const hasAlias = linkPath.includes("|");
							let alias = "";

							if (hasAlias) {
								[linkPath, alias] = linkPath.split("|");
							}

							// Handle baseDir-related processing
							if (
								settings.baseDir &&
								linkPath.startsWith(settings.baseDir + "/")
							) {
								linkPath = linkPath.slice(
									(settings.baseDir + "/").length,
								);
							}

							// Mark positions as processed
							for (
								let k = startPos;
								k < startPos + lastCandidate.length;
								k++
							) {
								processed[k] = true;
							}

							// リンクの形式を決定
							if (hasAlias) {
								result += `[[${linkPath}|${alias}]]`;
							} else if (linkPath.includes("/")) {
								const segments = linkPath.split("/");
								const lastPart = segments[segments.length - 1];
								result += `[[${linkPath}|${lastPart}]]`;
							} else {
								result += `[[${candidate}]]`;
							}

							startPos += lastCandidate.length - 1; // Adjust the next starting position
							continue;
						}
					}
				}

				// If no match or processing was skipped, output the character as is
				if (!processed[startPos]) {
					result += text[startPos];
				}
			}

			return result;
		}

		// For non-CJK text, use the original processing
		let i = 0;
		outer: while (i < text.length) {
			// If a URL is found, copy it unchanged.
			const urlMatch = text.slice(i).match(/^(https?:\/\/[^\s]+)/);
			if (urlMatch) {
				result += urlMatch[0];
				i += urlMatch[0].length;
				continue;
			}

			// Use the trie to find a candidate.
			let node = trie;
			let lastCandidate: { candidate: string; length: number } | null =
				null;
			let j = i;
			while (j < text.length) {
				const ch = settings.ignoreCase
					? text[j].toLowerCase()
					: text[j];
				const child = node.children.get(ch);
				if (!child) break;
				node = child;
				if (node.candidate) {
					// For CJK text, we need to check if this is a complete CJK segment
					const candidate = text.substring(i, j + 1);
					const isCjkCandidate =
						/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s\d]+$/u.test(
							candidate,
						);
					if (isCjkCandidate) {
						// For CJK text, relax the word boundary check
						// CJK characters don't have spaces between words, so always recognize as candidates
						lastCandidate = {
							candidate: node.candidate,
							length: j - i + 1,
						};
						// Recognize CJK text as candidates even if the next character is not a word boundary
						// This allows both "ひらがな" to be recognized in strings like "ひらがなとひらがな"
					} else if (isWordBoundary(text[j + 1])) {
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
				// If ignoreDateFormats is enabled and the candidate matches YYYY-MM-DD, skip conversion.
				if (
					settings.ignoreDateFormats &&
					/^\d{4}-\d{2}-\d{2}$/.test(candidate)
				) {
					result += candidate;
					i += lastCandidate.length;
					continue outer;
				}
				// Skip conversion for month notes.
				if (isMonthNote(candidate)) {
					result += candidate;
					i += lastCandidate.length;
					continue;
				}
				// Case-insensitive matching when ignoreCase is enabled
				let matchedCandidate = candidate;
				let candidateData: CandidateData | undefined;

				if (settings.ignoreCase) {
					// Try to find a case-insensitive match
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
					// Although candidateMap.has(candidate) returned true, TypeScript still requires a check for undefined.
					if (!candidateData) {
						// If candidateData is not found, skip to the next iteration.
						continue outer;
					}

					// Determine if the candidate is composed solely of CJK characters.
					// No need to check if it's CJK text here as it's handled in the word boundary check
					const isKorean = /^[\p{Script=Hangul}]+$/u.test(candidate);

					// Special handling for Korean
					if (isKorean) {
						{
							const remaining = text.slice(i + candidate.length);

							// Special handling when followed by "이다"
							const suffixMatch = remaining.match(/^(이다\.?)/);
							if (suffixMatch) {
								// Replace the candidate with the wikilink format.
								let linkPath = candidateData.canonical;
								const hasAlias = linkPath.includes("|");
								let alias = "";

								if (hasAlias) {
									[linkPath, alias] = linkPath.split("|");
								}
								// Remove base/ prefix when in base directory
								if (
									settings.baseDir &&
									linkPath.startsWith(settings.baseDir + "/")
								) {
									linkPath = linkPath.slice(
										(settings.baseDir + "/").length,
									);
								}

								// If it has an explicit alias, use it
								if (hasAlias) {
									result +=
										`[[${linkPath}|${alias}]]` +
										suffixMatch[0];
								}
								// If it has a namespace (contains "/"), use the last part as alias
								else if (linkPath.includes("/")) {
									const segments = linkPath.split("/");
									const lastPart =
										segments[segments.length - 1];
									result +=
										`[[${linkPath}|${lastPart}]]` +
										suffixMatch[0];
								}
								// Otherwise, use the normal link format
								else {
									result +=
										`[[${linkPath}]]` + suffixMatch[0];
								}

								i += candidate.length + suffixMatch[0].length;
								continue outer;
							}
						}

						// Special handling when followed by particles like "는" or "은"
						const remaining = text.slice(i + candidate.length);
						if (remaining.match(/^(는|은)/)) {
							// Don't convert to links when followed by Korean particles "는" or "은"
							// For example, don't link the first "문서" in "이 문서는 문서이다."
							result += text[i];
							i++;
							continue outer;
						}
					}

					// Word boundary check (relaxed for CJK text, but special handling for Korean)
					const isCjkCandidate =
						/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s\d]+$/u.test(
							candidate,
						);

					const isKoreanCandidate = /^[\p{Script=Hangul}]+$/u.test(
						candidate,
					);
					const isJapaneseCandidate =
						/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\s\d]+$/u.test(
							candidate,
						) && !/^[\p{Script=Hangul}]+$/u.test(candidate);

					console.log("isCjkCandidate: ", isCjkCandidate);
					console.log("isKoreanCandidate: ", isKoreanCandidate);
					console.log("isJapaneseCandidate: ", isJapaneseCandidate);

					// Processing for CJK text

					// Skip word boundary check for CJK text
					if (!isCjkCandidate) {
						// For non-CJK text, perform normal word boundary check
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

					// Special handling for Japanese (convert to links even when followed by particles like "が", "は", "を")
					if (isJapaneseCandidate) {
						const right =
							i + candidate.length < text.length
								? text.slice(
										i + candidate.length,
										i + candidate.length + 10,
									)
								: "";

						// Convert to links even when followed by Japanese particles
						if (
							right.match(
								/^(が|は|を|に|で|と|から|まで|より|へ|の|や|で|も)/,
							)
						) {
							// Skip word boundary check and force conversion to links when followed by particles
						}
					}

					// Special handling for Korean (treat particles like "는" as separate words)
					if (isKoreanCandidate) {
						// Special handling for Korean when followed by particles like "는" or "이다"
					}

					// If namespace resolution is enabled and candidateData has a namespace restriction,
					// skip conversion if its namespace does not match the current namespace.
					if (
						settings.namespaceResolution &&
						candidateData.restrictNamespace &&
						candidateData.namespace !== currentNamespace
					) {
						result += candidate;
						i += candidate.length;
						continue outer;
					}

					// Replace the candidate with the wikilink format.
					let linkPath = candidateData.canonical;
					const hasAlias = linkPath.includes("|");
					let alias = "";

					if (hasAlias) {
						[linkPath, alias] = linkPath.split("|");
					}

					// Remove pages/ prefix when baseDir is set
					if (settings.baseDir && linkPath.startsWith("pages/")) {
						linkPath = linkPath.slice("pages/".length);
					}

					// Remove base/ prefix when in base directory
					if (
						settings.baseDir &&
						linkPath.startsWith(settings.baseDir + "/")
					) {
						linkPath = linkPath.slice(
							(settings.baseDir + "/").length,
						);
					}

					// If it has an explicit alias, use it
					if (hasAlias) {
						result += `[[${linkPath}|${alias}]]`;
					}
					// If it has a namespace (contains "/"), use the last part as alias
					else if (linkPath.includes("/")) {
						// When ignoreCase is enabled, use the original text to preserve case, but only the last part
						const originalText = settings.ignoreCase
							? text.substring(i, i + candidate.length)
							: candidate;
						const originalSegments = originalText.split("/");
						const displayText =
							originalSegments[originalSegments.length - 1];
						result += `[[${linkPath}|${displayText}]]`;
					}
					// Otherwise, use the original text format
					else {
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
				const fallbackRegex = /^([\p{L}\p{N}_-]+)/u;
				const fallbackMatch = text.slice(i).match(fallbackRegex);
				if (fallbackMatch) {
					const word = settings.ignoreCase
						? fallbackMatch[1].toLowerCase()
						: fallbackMatch[1];

					// If the word is in YYYY-MM-DD format and ignoreDateFormats is enabled, do not convert.
					if (
						settings.ignoreDateFormats &&
						/^\d{4}-\d{2}-\d{2}$/.test(word)
					) {
						result += word;
						i += word.length;
						continue outer;
					}

					// For date formats: if the word is two digits and the result ends with "YYYY-MM-",
					// skip conversion.
					if (/^\d{2}$/.test(word) && /\d{4}-\d{2}-$/.test(result)) {
						result += text[i];
						i++;
						continue outer;
					}

					// Skip conversion for month notes.
					if (isMonthNote(word)) {
						result += word;
						i += word.length;
						continue;
					}

					// Quickly retrieve matching candidate entries using fallbackIndex.
					// When ignoreCase is enabled, use lowercase for searching in the fallbackIndex
					const searchWord = settings.ignoreCase
						? word.toLowerCase()
						: word;
					const candidateList = fallbackIndex.get(searchWord);
					if (candidateList) {
						// Filter candidates that comply with the current namespace restrictions.
						const filteredCandidates = candidateList.filter(
							([, data]) =>
								!(
									data.restrictNamespace &&
									data.namespace !== currentNamespace
								),
						);

						if (filteredCandidates.length === 1) {
							const candidateData = filteredCandidates[0][1];
							let linkPath = candidateData.canonical;
							const hasAlias = linkPath.includes("|");
							let alias = "";

							if (hasAlias) {
								[linkPath, alias] = linkPath.split("|");
							}

							// Remove pages/ prefix when baseDir is set
							if (
								settings.baseDir &&
								linkPath.startsWith("pages/")
							) {
								linkPath = linkPath.slice("pages/".length);
							}

							// Remove base/ prefix when in base directory
							if (
								settings.baseDir &&
								linkPath.startsWith(settings.baseDir + "/")
							) {
								linkPath = linkPath.slice(
									(settings.baseDir + "/").length,
								);
							}

							// If it has an explicit alias, use it
							if (hasAlias) {
								result += `[[${linkPath}|${alias}]]`;
							}
							// If it has a namespace (contains "/"), use the original text as alias
							else if (linkPath.includes("/")) {
								// When ignoreCase is enabled, use the original text to preserve case, but only the last part
								const originalText = settings.ignoreCase
									? text.substring(i, i + word.length)
									: word;
								const originalSegments =
									originalText.split("/");
								const displayText =
									originalSegments[
										originalSegments.length - 1
									];
								result += `[[${linkPath}|${displayText}]]`;
							}
							// Otherwise, use the original text format
							else {
								result += `[[${word}]]`;
							}

							i += word.length;
							continue outer;
						} else if (filteredCandidates.length > 1) {
							let bestCandidate: [string, CandidateData] | null =
								null;
							let bestScore = -1;
							// Get the directory portion of the current file (if any)
							const filePathDir = filePath.includes("/")
								? filePath.slice(0, filePath.lastIndexOf("/"))
								: "";
							const filePathSegments = filePathDir
								? filePathDir.split("/")
								: [];
							for (const [key, data] of filteredCandidates) {
								const slashIndex = key.lastIndexOf("/");
								const candidateDir = key.slice(0, slashIndex);
								const candidateSegments =
									candidateDir.split("/");
								let score = 0;
								for (
									let idx = 0;
									idx <
									Math.min(
										candidateSegments.length,
										filePathSegments.length,
									);
									idx++
								) {
									if (
										candidateSegments[idx] ===
										filePathSegments[idx]
									) {
										score++;
									} else {
										break;
									}
								}
								if (score > bestScore) {
									bestScore = score;
									bestCandidate = [key, data];
								} else if (
									score === bestScore &&
									bestCandidate !== null
								) {
									if (
										filePathDir === "" &&
										settings.baseDir
									) {
										// When the current file is in the base directory, compare candidates by relative depth.
										const basePrefix =
											settings.baseDir + "/";
										const getRelativeDepth = (
											k: string,
										): number => {
											if (k.startsWith(basePrefix)) {
												// Remove the baseDir part and count the remaining segments (excluding the filename)
												const relativeParts = k
													.slice(basePrefix.length)
													.split("/");
												return relativeParts.length - 1;
											}
											return Infinity;
										};

										const candidateDepth =
											getRelativeDepth(key);
										const bestCandidateDepth =
											getRelativeDepth(bestCandidate[0]);

										// Prefer the candidate with fewer directory segments (i.e., lower depth).
										if (
											candidateDepth <
												bestCandidateDepth ||
											(candidateDepth ===
												bestCandidateDepth &&
												key.length <
													bestCandidate[0].length)
										) {
											bestCandidate = [key, data];
										}
									} else {
										// Otherwise, choose the candidate with fewer directory segments.
										const currentBestDir =
											bestCandidate[0].slice(
												0,
												bestCandidate[0].lastIndexOf(
													"/",
												),
											);
										const currentBestSegments =
											currentBestDir.split("/");
										if (
											candidateSegments.length <
												currentBestSegments.length ||
											(candidateSegments.length ===
												currentBestSegments.length &&
												key.length <
													bestCandidate[0].length)
										) {
											bestCandidate = [key, data];
										}
									}
								}
							}
							if (bestCandidate !== null) {
								let linkPath = bestCandidate[1].canonical;
								const hasAlias = linkPath.includes("|");
								let alias = "";

								if (hasAlias) {
									[linkPath, alias] = linkPath.split("|");
								}

								// Remove pages/ prefix when baseDir is set
								if (
									settings.baseDir &&
									linkPath.startsWith("pages/")
								) {
									linkPath = linkPath.slice("pages/".length);
								}

								// Remove base/ prefix when in base directory
								if (
									settings.baseDir &&
									linkPath.startsWith(settings.baseDir + "/")
								) {
									linkPath = linkPath.slice(
										(settings.baseDir + "/").length,
									);
								}

								// If it has an explicit alias, use it
								if (hasAlias) {
									result += `[[${linkPath}|${alias}]]`;
								}
								// If it has a namespace (contains "/"), use the last part as alias
								else if (linkPath.includes("/")) {
									const segments = linkPath.split("/");
									const lastPart =
										segments[segments.length - 1];
									result += `[[${linkPath}|${lastPart}]]`;
								}
								// Otherwise, use the normal link format
								else {
									result += `[[${linkPath}]]`;
								}

								i += word.length;
								continue outer;
							}
						}
					}
					result += text[i];
					i++;
					continue;
				}
			}

			// If no rule applies, output the current character.
			result += text[i];
			i++;
		}
		return result;
	};

	// Process the entire body while preserving protected segments.
	let resultBody = "";
	let lastIndex = 0;
	for (const m of body.matchAll(protectedRegex)) {
		const mIndex = m.index ?? 0;
		const segment = body.slice(lastIndex, mIndex);
		resultBody += replaceInSegment(segment);
		// Append the protected segment unchanged.
		resultBody += m[0];
		lastIndex = mIndex + m[0].length;
	}
	resultBody += replaceInSegment(body.slice(lastIndex));
	return resultBody;
};
