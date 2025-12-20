import { ChangeSpec } from "@codemirror/state"
import { Editor } from "obsidian"
import DiffMatchPatch from "diff-match-patch"

function endOfDocument(doc: string) {
    const lines = doc.split("\n")
    return { line: lines.length - 1, ch: lines[lines.length - 1].length }
}

export function updateEditor(
    oldText: string,
    newText: string,
    editor: Editor,
): DiffMatchPatch.Diff[] {
    const dmp = new DiffMatchPatch.diff_match_patch()
    const changes = dmp.diff_main(oldText, newText)
    let curText = ""
    changes.forEach((change) => {
        const [type, value] = change

        if (type == DiffMatchPatch.DIFF_INSERT) {
            // use codemirror dispatch in order to bypass the filter on transactions that causes editor.replaceRange not to not work in Live Preview
            editor?.cm?.dispatch({
                changes: [
                    {
                        from: editor.posToOffset(endOfDocument(curText)),
                        insert: value,
                    } as ChangeSpec,
                ],
                filter: false,
            })
            curText += value
        }
        else if (type == DiffMatchPatch.DIFF_DELETE) {
            const start = endOfDocument(curText)
            let tempText = curText
            tempText += value
            const end = endOfDocument(tempText)

            // use codemirror dispatch in order to bypass the filter on transactions that causes editor.replaceRange not to not work in Live Preview
            editor?.cm?.dispatch({
                changes: [
                    {
                        from: editor.posToOffset(start),
                        to: editor.posToOffset(end),
                        insert: "",
                    } as ChangeSpec,
                ],
                filter: false,
            })
        }
        else {
            curText += value
        }
    })

    return changes
}
