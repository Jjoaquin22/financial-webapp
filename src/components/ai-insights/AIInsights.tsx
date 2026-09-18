import { useMemo } from "react"
import type { InsightPlacement } from "../../types/aiInsights"
import type { AIInsightsState } from "./useAIInsights"
import "./AIInsights.css"

interface AIInsightNoteProps {
    placement: InsightPlacement
    state: AIInsightsState
}

export function AIInsightNote({ placement, state }: AIInsightNoteProps) {
    const insight = state.insights.get(placement)
    const content = useMemo(() => {
        if (state.isLoading) return <><span className="ai-note-spinner" aria-hidden="true" /> Updating AI insight…</>
        if (insight) return <>{insight.description}</>
        if (state.errorMessage) return <>{state.errorMessage}</>
        return <>Analyzing this card as your financial data updates.</>
    }, [insight, state.errorMessage, state.isLoading])

    return <p className={`ai-card-note${insight ? ` ai-card-note-${insight.severity}` : ""}`} title={insight?.title} aria-live="polite"><span className="ai-note-mark" aria-hidden="true">✦</span><span>{content}</span></p>
}
