/**
 * Check if the file has the "off" frontmatter property
 */
export const isLinkingOff = (
	frontmatter: Record<string, unknown> | undefined,
): boolean => {
	return (
		frontmatter?.["automatic-linker-disabled"] === true ||
		frontmatter?.["automatic-linker-off"] === true
	);
};

/**
 * Check if the file has the "scoped" frontmatter property
 */
export const isNamespaceScoped = (
	frontmatter: Record<string, unknown> | undefined,
): boolean => {
	return (
		frontmatter?.["automatic-linker-restrict-namespace"] === true ||
		frontmatter?.["automatic-linker-limited-namespace"] === true ||
		frontmatter?.["automatic-linker-scoped"] === true
	);
};

/**
 * Check if the file has the "exclude" frontmatter property
 */
export const isLinkingExcluded = (
	frontmatter: Record<string, unknown> | undefined,
): boolean => {
	return (
		frontmatter?.["automatic-linker-prevent-linking"] === true ||
		frontmatter?.["automatic-linker-exclude"] === true
	);
};
