import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js"
import { supabase } from "../../supabaseClient"

export interface ChatHistoryMessage {
    role: "user" | "assistant"
    text: string
}

interface ChatResponse {
    reply: string
    generatedAt: string
}

function isChatResponse(value: unknown): value is ChatResponse {
    if (!value || typeof value !== "object") return false
    const candidate = value as Partial<ChatResponse>
    return typeof candidate.reply === "string"
        && candidate.reply.trim().length > 0
        && candidate.reply.length <= 4_000
        && typeof candidate.generatedAt === "string"
        && Number.isFinite(new Date(candidate.generatedAt).getTime())
}

async function getChatError(error: unknown) {
    if (error instanceof FunctionsHttpError) {
        try {
            const payload = await error.context.json() as { error?: unknown }
            if (typeof payload.error === "string" && payload.error.length <= 180) return payload.error
        } catch {
            // Fall through to a safe public message.
        }
        if (error.context.status === 401) return "Your session expired. Please sign in again."
        if (error.context.status === 429) return "Finaura AI is temporarily rate limited. Please try again shortly."
        return "Finaura AI is temporarily unavailable."
    }
    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
        return "Finaura AI is temporarily unavailable."
    }
    return "Finaura AI is temporarily unavailable."
}

export async function sendChatMessage(message: string, history: ChatHistoryMessage[]) {
    const { data, error } = await supabase.functions.invoke("ai-chatbot", {
        body: { message, history: history.slice(-10) },
    })

    if (error) throw new Error(await getChatError(error))
    if (!isChatResponse(data)) throw new Error("Finaura AI returned an invalid response.")
    return data.reply.trim()
}
