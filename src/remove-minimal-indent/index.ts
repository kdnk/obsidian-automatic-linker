const TAB_SIZE = 4

export const removeMinimalIndent = (text: string): string => {
    const lines = text.split("\n")

    // Convert tabs to spaces for consistent handling
    const expandedLines = lines.map((line) => {
        return line.replace(/\t/g, " ".repeat(TAB_SIZE))
    })

    // Find minimal indent (ignoring empty or whitespace-only lines)
    let minIndent = Infinity
    for (const line of expandedLines) {
        // Skip empty or whitespace-only lines
        if (line.trim().length === 0) {
            continue
        }

        // Count leading spaces
        let indent = 0
        for (const char of line) {
            if (char === " ") {
                indent++
            }
            else {
                break
            }
        }

        minIndent = Math.min(minIndent, indent)
    }

    // If no indented lines found, return as-is
    if (minIndent === Infinity || minIndent === 0) {
        return text
    }

    // Remove minimal indent from all lines and convert spaces back to tabs
    const processedLines = expandedLines.map((line) => {
        // Preserve empty or whitespace-only lines
        if (line.trim().length === 0) {
            return ""
        }

        // Remove minIndent spaces from the beginning
        const dedented = line.slice(minIndent)

        // Convert leading spaces back to tabs
        const leadingSpaces = dedented.match(/^ */)?.[0].length || 0
        const tabs = Math.floor(leadingSpaces / TAB_SIZE)
        const remainingSpaces = leadingSpaces % TAB_SIZE
        const rest = dedented.slice(leadingSpaces)

        return "\t".repeat(tabs) + " ".repeat(remainingSpaces) + rest
    })

    return processedLines.join("\n")
}
