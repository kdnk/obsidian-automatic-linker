import { request } from "obsidian"
import { AutomaticLinkerSettings } from "../settings/settings-info"

export interface AIResolveRequest {
    text: string
    word: string
    candidates: string[]
}

export interface AIResolveResponse {
    selectedPath: string | null
}

export const callAI = async (
    settings: AutomaticLinkerSettings,
    prompt: string,
): Promise<string> => {
    const url = `${settings.aiEndpoint}/chat/completions`
    const body = {
        model: settings.aiModel,
        messages: [
            {
                role: "system",
                content: "You are an assistant that helps resolve ambiguous links in Obsidian notes. You must respond ONLY with a valid JSON object. Do not include any explanation or markdown code blocks.",
            },
            {
                role: "user",
                content: prompt,
            },
        ],
        // Some local servers fail with response_format, so we rely on the prompt instructions
        // temperature: 0 to make it more deterministic
        temperature: 0,
    }

    if (settings.debug) {
        console.log("AI Link Enhancer Request:", JSON.stringify(body, null, 2))
    }

    try {
        const response = await request({
            url,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        })

        if (settings.debug) {
            console.log("AI Link Enhancer Response:", response)
        }

        const data = JSON.parse(response)
        return data.choices[0].message.content
    } catch (error) {
        console.error("AI Link Enhancer API Error:", error)
        throw error
    }
}

export const resolveAmbiguitiesBatch = async (
    settings: AutomaticLinkerSettings,
    requests: AIResolveRequest[],
): Promise<Map<string, string>> => {
    if (requests.length === 0) return new Map()

    const prompt = `
Please resolve the following ambiguous links.
Select the most appropriate "selectedPath" from the given "candidates" based on the context.
If no candidate is appropriate, return null for that item.

You MUST respond with a JSON object in the following format:
{
  "results": [
    { "word": "word1", "selectedPath": "path/to/note" },
    ...
  ]
}

Input data:
${JSON.stringify(requests, null, 2)}
`

    const resultRaw = await callAI(settings, prompt)
    
    // Clean up potential markdown code blocks if the AI included them
    const cleanJson = resultRaw.replace(/```json\n?/, "").replace(/\n?```/, "").trim()
    
    const result = JSON.parse(cleanJson)
    const resultMap = new Map<string, string>()

    if (result.results && Array.isArray(result.results)) {
        for (const item of result.results) {
            if (item.selectedPath) {
                resultMap.set(item.word, item.selectedPath)
            }
        }
    }

    return resultMap
}
