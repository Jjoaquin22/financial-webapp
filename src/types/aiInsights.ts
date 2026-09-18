export type InsightType = "spending" | "budget" | "savings" | "cashflow"
export type InsightSeverity = "info" | "warning" | "success"
export type InsightPlacement = "income" | "expenses" | "net" | "saved" | "average" | "spending" | "cashflow" | "budget" | "savings"
export type ReportPeriod = "daily" | "weekly" | "monthly"

export interface FinancialInsight {
    placement: InsightPlacement
    type: InsightType
    title: string
    description: string
    severity: InsightSeverity
}

export interface FinancialInsightsResponse {
    insights: FinancialInsight[]
    generatedAt: string
    reportPeriod: ReportPeriod
}

const placements = new Set<InsightPlacement>(["income", "expenses", "net", "saved", "average", "spending", "cashflow", "budget", "savings"])
const insightTypes = new Set<InsightType>(["spending", "budget", "savings", "cashflow"])
const severities = new Set<InsightSeverity>(["info", "warning", "success"])
const reportPeriods = new Set<ReportPeriod>(["daily", "weekly", "monthly"])

export function isFinancialInsightsResponse(value: unknown): value is FinancialInsightsResponse {
    if (!value || typeof value !== "object") return false
    const response = value as Partial<FinancialInsightsResponse>
    if (!Array.isArray(response.insights) || response.insights.length > placements.size) return false
    if (typeof response.generatedAt !== "string" || Number.isNaN(Date.parse(response.generatedAt))) return false
    if (!response.reportPeriod || !reportPeriods.has(response.reportPeriod)) return false

    const seen = new Set<InsightPlacement>()
    return response.insights.every((item) => {
        if (!item || typeof item !== "object" || !placements.has(item.placement) || seen.has(item.placement)) return false
        seen.add(item.placement)
        return insightTypes.has(item.type)
            && severities.has(item.severity)
            && typeof item.title === "string"
            && item.title.trim().length > 0
            && item.title.length <= 100
            && typeof item.description === "string"
            && item.description.trim().length > 0
            && item.description.length <= 280
    })
}
