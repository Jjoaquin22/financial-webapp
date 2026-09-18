import { useEffect, useRef, useState } from "react"
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js"
import { supabase } from "../../supabaseClient"
import { isFinancialInsightsResponse, type FinancialInsight, type InsightPlacement, type ReportPeriod } from "../../types/aiInsights"

export interface AIInsightsState {
    insights: Map<InsightPlacement, FinancialInsight>
    isLoading: boolean
    errorMessage: string
    generatedAt: string | null
}

async function getFunctionError(error: unknown) {
    if (error instanceof FunctionsHttpError) {
        try {
            const payload = await error.context.json() as { error?: unknown }
            if (typeof payload.error === "string" && payload.error.length <= 180) return payload.error
        } catch {
            // Fall through to a safe public message.
        }
        if (error.context.status === 401) return "Sign in again to refresh this insight."
        if (error.context.status === 429) return "AI insights are temporarily rate limited."
        return "AI insight is temporarily unavailable."
    }
    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) return "AI insight is temporarily unavailable."
    return "AI insight is temporarily unavailable."
}

export function useAIInsights(reportPeriod: ReportPeriod, enabled: boolean, dataRevision: number): AIInsightsState {
    const [insights, setInsights] = useState<Map<InsightPlacement, FinancialInsight>>(new Map())
    const [isLoading, setIsLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")
    const [generatedAt, setGeneratedAt] = useState<string | null>(null)
    const requestSequence = useRef(0)

    useEffect(() => {
        if (!enabled) return
        const sequence = ++requestSequence.current
        const timer = window.setTimeout(async () => {
            setIsLoading(true)
            setErrorMessage("")
            try {
                const { data, error } = await supabase.functions.invoke("financial-insights", {
                    body: { reportPeriod, timezoneOffsetMinutes: new Date().getTimezoneOffset() },
                })
                if (error) throw error
                if (!isFinancialInsightsResponse(data)) throw new Error("INVALID_RESPONSE")
                if (sequence !== requestSequence.current) return
                setInsights(new Map(data.insights.map((insight) => [insight.placement, insight])))
                setGeneratedAt(data.generatedAt)
            } catch (error) {
                if (sequence !== requestSequence.current) return
                setErrorMessage(error instanceof Error && error.message === "INVALID_RESPONSE" ? "AI returned an invalid insight." : await getFunctionError(error))
            } finally {
                if (sequence === requestSequence.current) setIsLoading(false)
            }
        }, 500)

        return () => window.clearTimeout(timer)
    }, [dataRevision, enabled, reportPeriod])

    return { insights, isLoading, errorMessage, generatedAt }
}
