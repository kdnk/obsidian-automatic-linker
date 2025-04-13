export const excludeLinks = (text: string) => {
	// Split the text into segments of inline code and regular text
	const segments: {isCode: boolean; content: string}[] = [];
	let currentPos = 0;
	const codeBlockRegex = /`([^`]+)`/g;
	let match;

	while ((match = codeBlockRegex.exec(text)) !== null) {
		// Add text before code block
		if (match.index > currentPos) {
			segments.push({
				isCode: false,
				content: text.substring(currentPos, match.index)
			});
		}
		
		// Add code block (which should be preserved as is)
		segments.push({
			isCode: true,
			content: match[0]
		});
		
		currentPos = match.index + match[0].length;
	}
	
	// Add remaining text
	if (currentPos < text.length) {
		segments.push({
			isCode: false,
			content: text.substring(currentPos)
		});
	}
	
	// Process each segment
	const regex = /\[\[(.*?)\]\]/g;
	const processedSegments = segments.map(segment => {
		if (segment.isCode) {
			// Preserve code blocks
			return segment.content;
		} else {
			// Replace links in non-code segments
			return segment.content.replace(regex, "$1");
		}
	});
	
	return processedSegments.join("");
};
