import { CandidateData, TrieNode } from "../trie";

export const getEffectiveNamespace = (
	filePath: string,
	baseDir?: string,
): string => {
	if (baseDir) {
		const prefix = baseDir + "/";
		if (filePath.startsWith(prefix)) {
			const rest = filePath.slice(prefix.length);
			const segments = rest.split("/");
			return segments[0] || "";
		}
	}
	const segments = filePath.split("/");
	return segments[0] || "";
};

export const replaceLinks = async ({
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
	};
}): Promise<string> => {
	// Return the body unchanged if its length is below the minimum character count.
	if (body.length <= (settings.minCharCount ?? 0)) {
		return body;
	}

	// Utility: Check if a character is a word boundary.
	const isWordBoundary = (char: string | undefined): boolean => {
		if (char === undefined) return true;
		return !/[\p{L}\p{N}_/-]/u.test(char);
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
		let arr = fallbackIndex.get(shorthand);
		if (!arr) {
			arr = [];
			fallbackIndex.set(shorthand, arr);
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
				const ch = text[j];
				const child = node.children.get(ch);
				if (!child) break;
				node = child;
				if (node.candidate) {
					lastCandidate = {
						candidate: node.candidate,
						length: j - i + 1,
					};
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
				if (candidateMap.has(candidate)) {
					const candidateData = candidateMap.get(candidate);
					// Although candidateMap.has(candidate) returned true, TypeScript still requires a check for undefined.
					if (!candidateData) {
						// If candidateData is not found, skip to the next iteration.
						continue outer;
					}

					// Determine if the candidate is composed solely of CJK characters.
					const isCjkCandidate =
						/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(
							candidate,
						);
					const isKorean = /^[\p{Script=Hangul}]+$/u.test(candidate);

					// For non-CJK or Korean candidates, perform word boundary checks.
					if (!isCjkCandidate || isKorean) {
						if (isKorean) {
							const remaining = text.slice(i + candidate.length);
							const suffixMatch = remaining.match(/^(이다\.?)/);
							if (suffixMatch) {
								result +=
									`[[${candidateData.canonical}]]` +
									suffixMatch[0];
								i += candidate.length + suffixMatch[0].length;
								continue outer;
							}
						}
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

					result += hasAlias
						? `[[${linkPath}|${alias}]]`
						: `[[${linkPath}]]`;
					i += candidate.length;
					continue outer;
				}
			}

			// Fallback: if no candidate was found via the trie.
			if (settings.namespaceResolution) {
				const fallbackRegex = /^([\p{L}\p{N}_-]+)/u;
				const fallbackMatch = text.slice(i).match(fallbackRegex);
				if (fallbackMatch) {
					const word = fallbackMatch[1];

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
					const candidateList = fallbackIndex.get(word);
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
							result += `[[${linkPath}]]`;
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
								result += `[[${linkPath}]]`;
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
