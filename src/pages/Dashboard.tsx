import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"
import type { Tables } from "../types/database"
import { AIInsightNote } from "../components/ai-insights/AIInsights"
import { useAIInsights } from "../components/ai-insights/useAIInsights"
import type { ReportPeriod } from "../types/aiInsights"
import "./Dashboard.css"

type Transaction = Pick<Tables<"transactions">, "id" | "amount" | "type" | "transaction_date" | "saving_goal_id"> & { category: { name: string } | null }
type SavingGoal = Pick<Tables<"saving_goals">, "savings_id" | "goal_name" | "target_amount" | "target_date">
type Budget = Pick<Tables<"budget_management">, "budget_id" | "budget" | "category" | "category_id" | "start_date" | "end_date">
type Status = "loading" | "ready" | "error"

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 })
const compactPeso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 })
const dateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" })
const pieColors = ["#167348", "#4e9c72", "#ef9d3c", "#6e87c8", "#9a67b6", "#d26868", "#66a8a3", "#b89c4c"]

function toDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }
function getMonthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` }
function validDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date }
function startOfWeek(date: Date) { const result = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result }

async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error("You must be signed in to view dashboard analytics.")
    return user
}

function Dashboard() {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [goals, setGoals] = useState<SavingGoal[]>([])
    const [budgets, setBudgets] = useState<Budget[]>([])
    const [status, setStatus] = useState<Status>("loading")
    const [errorMessage, setErrorMessage] = useState("")
    const [userName, setUserName] = useState("")
    const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("monthly")
    const [dataRevision, setDataRevision] = useState(0)

    const fetchAnalytics = useCallback(async () => {
        setStatus("loading"); setErrorMessage("")
        try {
            const user = await getCurrentUser()
            const userId = user.id
            const [transactionResult, goalResult, budgetResult, profileResult] = await Promise.all([
                supabase.from("transactions").select("id, amount, type, transaction_date, saving_goal_id, category:categories!transactions_category_id_fkey(name)").eq("user_id", userId).order("transaction_date"),
                supabase.from("saving_goals").select("savings_id, goal_name, target_amount, target_date").eq("user_id", userId).order("target_date"),
                supabase.from("budget_management").select("budget_id, budget, category, category_id, start_date, end_date").eq("user_id", userId).order("start_date"),
                supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle(),
            ])
            if (transactionResult.error) throw transactionResult.error
            if (goalResult.error) throw goalResult.error
            if (budgetResult.error) throw budgetResult.error
            setTransactions((transactionResult.data ?? []) as Transaction[])
            if (!profileResult.error) setUserName(profileResult.data?.first_name?.trim() || user.email?.split("@")[0] || "there")
            setGoals(goalResult.data ?? []); setBudgets(budgetResult.data ?? []); setStatus("ready"); setDataRevision((revision) => revision + 1)
        } catch (error) {
            setTransactions([]); setGoals([]); setBudgets([])
            setErrorMessage(error instanceof Error ? error.message : "Unable to load dashboard analytics."); setStatus("error")
        }
    }, [])

    useEffect(() => { const timeoutId = window.setTimeout(() => void fetchAnalytics(), 0); return () => window.clearTimeout(timeoutId) }, [fetchAnalytics])

    useEffect(() => {
        let isDisposed = false
        let channel: ReturnType<typeof supabase.channel> | null = null

        void getCurrentUser().then((user) => {
            if (isDisposed) return
            const userId = user.id
            const refresh = () => void fetchAnalytics()
            channel = supabase
                .channel(`dashboard-finance-${userId}`)
                .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` }, refresh)
                .on("postgres_changes", { event: "*", schema: "public", table: "budget_management", filter: `user_id=eq.${userId}` }, refresh)
                .on("postgres_changes", { event: "*", schema: "public", table: "saving_goals", filter: `user_id=eq.${userId}` }, refresh)
                .subscribe()
        }).catch(() => undefined)

        return () => {
            isDisposed = true
            if (channel) void supabase.removeChannel(channel)
        }
    }, [fetchAnalytics])

    const analytics = useMemo(() => {
        const income = transactions.reduce((sum, item) => sum + (item.type === "income" ? Number(item.amount) : 0), 0)
        const expenses = transactions.reduce((sum, item) => sum + (item.type === "expense" ? Number(item.amount) : 0), 0)
        const saved = transactions.reduce((sum, item) => sum + (item.type === "transfer" && item.saving_goal_id !== null ? Number(item.amount) : 0), 0)
        const goalTarget = goals.reduce((sum, goal) => sum + Number(goal.target_amount ?? 0), 0)
        const budgetTotal = budgets.reduce((sum, budget) => sum + Number(budget.budget ?? 0), 0)

        const categoryMap = new Map<string, number>()
        transactions.forEach((item) => { if (item.type === "expense") { const name = item.category?.name ?? "Uncategorized"; categoryMap.set(name, (categoryMap.get(name) ?? 0) + Number(item.amount)) } })
        const categories = [...categoryMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

        const budgetUsage = budgets.map((budget) => {
            const limit = Number(budget.budget ?? 0)
            const spent = transactions.reduce((sum, item) => { if (item.type !== "expense" || item.category?.name !== budget.category) return sum; const day = item.transaction_date.slice(0, 10); if (budget.start_date && day < budget.start_date) return sum; if (budget.end_date && day > budget.end_date) return sum; return sum + Number(item.amount) }, 0)
            return { id: budget.budget_id, name: budget.category ?? "Uncategorized", limit, spent, percentage: limit > 0 ? (spent / limit) * 100 : 0 }
        }).sort((a, b) => b.percentage - a.percentage)

        const goalProgress = goals.map((goal) => { const target = Number(goal.target_amount ?? 0); const current = transactions.reduce((sum, item) => item.type === "transfer" && item.saving_goal_id === goal.savings_id ? sum + Number(item.amount) : sum, 0); return { id: goal.savings_id, name: goal.goal_name ?? "Saving goal", target, current, percentage: target > 0 ? (current / target) * 100 : 0, targetDate: goal.target_date } }).sort((a, b) => b.percentage - a.percentage)
        return { income, expenses, saved, goalTarget, budgetTotal, categories, budgetUsage, goalProgress }
    }, [budgets, goals, transactions])

    const reportSeries = useMemo(() => {
        const now = new Date()
        const size = reportPeriod === "daily" ? 7 : reportPeriod === "weekly" ? 8 : 6
        const periods = Array.from({ length: size }, (_, index) => {
            const offset = size - 1 - index
            if (reportPeriod === "daily") {
                const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
                return { key: toDateKey(date), label: date.toLocaleDateString("en-PH", { weekday: "short", day: "numeric" }), income: 0, expense: 0 }
            }
            if (reportPeriod === "weekly") {
                const date = startOfWeek(now)
                date.setDate(date.getDate() - offset * 7)
                return { key: toDateKey(date), label: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }), income: 0, expense: 0 }
            }
            const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
            return { key: getMonthKey(date), label: date.toLocaleDateString("en-PH", { month: "short" }), income: 0, expense: 0 }
        })
        transactions.forEach((item) => {
            const date = validDate(item.transaction_date)
            if (!date) return
            const key = reportPeriod === "daily" ? toDateKey(date) : reportPeriod === "weekly" ? toDateKey(startOfWeek(date)) : getMonthKey(date)
            const period = periods.find((entry) => entry.key === key)
            if (!period) return
            if (item.type === "income") period.income += Number(item.amount)
            if (item.type === "expense") period.expense += Number(item.amount)
        })
        return periods
    }, [reportPeriod, transactions])

    const reportAverages = useMemo(() => {
        const divisor = reportSeries.length || 1
        return reportSeries.reduce((result, period) => ({ income: result.income + period.income / divisor, expense: result.expense + period.expense / divisor }), { income: 0, expense: 0 })
    }, [reportSeries])

    const pieGradient = useMemo(() => {
        if (!analytics.expenses || !analytics.categories.length) return "conic-gradient(#e5ebe7 0 100%)"
        let start = 0
        return `conic-gradient(${analytics.categories.map((category, index) => { const end = start + (category.value / analytics.expenses) * 100; const segment = `${pieColors[index % pieColors.length]} ${start}% ${end}%`; start = end; return segment }).join(",")})`
    }, [analytics.categories, analytics.expenses])

    const lineChart = useMemo(() => {
        const width = 620; const height = 250; const left = 52; const right = 18; const top = 22; const bottom = 42
        const maximum = Math.max(...reportSeries.flatMap((period) => [period.income, period.expense]), 1)
        const x = (index: number) => left + index * ((width - left - right) / Math.max(reportSeries.length - 1, 1))
        const y = (value: number) => top + (height - top - bottom) * (1 - value / maximum)
        const path = (key: "income" | "expense") => reportSeries.map((period, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(period[key])}`).join(" ")
        return { width, height, left, right, top, bottom, maximum, x, y, incomePath: path("income"), expensePath: path("expense") }
    }, [reportSeries])

    const aiInsights = useAIInsights(reportPeriod, status === "ready", dataRevision)

    const loading = status === "loading"
    return (
        <main className="dashboard-page">
            <header className="dashboard-header"><div><p className="dashboard-eyebrow">Financial overview</p><h1>Welcome{userName ? `, ${userName}` : ""}!</h1><p>Analytics across your transactions, budgets, and saving goals.</p></div><div className="dashboard-period"><span>Average report</span><div role="group" aria-label="Select report period">{(["daily", "weekly", "monthly"] as const).map((period) => <button type="button" key={period} className={reportPeriod === period ? "active" : ""} aria-pressed={reportPeriod === period} onClick={() => setReportPeriod(period)}>{period}</button>)}</div></div></header>
            {status === "error" && <div className="dashboard-error" role="alert"><span>{errorMessage}</span><button type="button" onClick={() => void fetchAnalytics()}>Try again</button></div>}
            <section className="dashboard-stats" aria-label="Financial totals">
                <article><span>Total income</span><strong>{loading ? "—" : peso.format(analytics.income)}</strong><small>{transactions.filter(({ type }) => type === "income").length} income transactions</small></article>
                <article><span>Total expenses</span><strong>{loading ? "—" : peso.format(analytics.expenses)}</strong><small>{transactions.filter(({ type }) => type === "expense").length} expense transactions</small></article>
                <article><span>Net cash flow</span><strong className={analytics.income - analytics.expenses < 0 ? "negative" : "positive"}>{loading ? "—" : peso.format(analytics.income - analytics.expenses)}</strong><small>Income minus expenses</small></article>
                <article><span>Saved toward goals</span><strong>{loading ? "—" : peso.format(analytics.saved)}</strong><small>of {peso.format(analytics.goalTarget)} targeted</small></article>
            </section>
            <section className="average-report" aria-label={`${reportPeriod} average income and spending`}>
                <div><span>Average {reportPeriod} income</span><strong>{loading ? "—" : peso.format(reportAverages.income)}</strong></div>
                <div><span>Average {reportPeriod} spent</span><strong>{loading ? "—" : peso.format(reportAverages.expense)}</strong></div>
                <div><span>Average {reportPeriod} net</span><strong className={reportAverages.income - reportAverages.expense < 0 ? "negative" : "positive"}>{loading ? "—" : peso.format(reportAverages.income - reportAverages.expense)}</strong></div>
                <p>Based on the last {reportSeries.length} {reportPeriod === "daily" ? "days" : reportPeriod === "weekly" ? "weeks" : "months"}, including intervals with no activity.</p>
                <AIInsightNote placement="average" state={aiInsights} />
            </section>
            <section className="dashboard-chart-grid">
                <article className="analytics-panel spending-panel"><div className="panel-heading"><div><p className="dashboard-eyebrow">Pie chart</p><h2>Spending by category</h2></div><strong>{peso.format(analytics.expenses)}</strong></div>
                    {loading ? <div className="chart-loading" role="status">Loading spending data…</div> : analytics.categories.length === 0 ? <div className="chart-empty">Add expense transactions to see category analytics.</div> : <div className="pie-layout"><div className="pie-chart" style={{ background: pieGradient }} role="img" aria-label={`Pie chart of ${peso.format(analytics.expenses)} in expenses`}><div><strong>{analytics.categories.length}</strong><span>categories</span></div></div><div className="pie-legend">{analytics.categories.slice(0, 8).map((category, index) => <div key={category.name}><span className="legend-dot" style={{ background: pieColors[index % pieColors.length] }} /><span>{category.name}</span><strong>{peso.format(category.value)}</strong><small>{analytics.expenses > 0 ? ((category.value / analytics.expenses) * 100).toFixed(0) : 0}%</small></div>)}</div></div>}
                    <AIInsightNote placement="spending" state={aiInsights} />
                </article>
                <article className="analytics-panel cashflow-panel"><div className="panel-heading"><div><p className="dashboard-eyebrow">{reportPeriod} line chart</p><h2>Income and spending trend</h2></div><div className="chart-legend"><span><i className="income-key" />Income</span><span><i className="expense-key" />Spent</span></div></div>
                    {loading ? <div className="chart-loading" role="status">Loading cash flow…</div> : <div className="line-chart-wrap"><svg className="line-chart" viewBox={`0 0 ${lineChart.width} ${lineChart.height}`} role="img" aria-labelledby="cashflow-title cashflow-desc"><title id="cashflow-title">{reportPeriod} income and spending report</title><desc id="cashflow-desc">Two lines compare income with spending for each displayed {reportPeriod} interval.</desc>{[0, .25, .5, .75, 1].map((ratio) => { const y = lineChart.top + (lineChart.height - lineChart.top - lineChart.bottom) * ratio; return <g key={ratio}><line x1={lineChart.left} y1={y} x2={lineChart.width - lineChart.right} y2={y} className="chart-grid-line" /><text x={lineChart.left - 8} y={y + 4} textAnchor="end">{compactPeso.format(lineChart.maximum * (1 - ratio))}</text></g> })}<path d={lineChart.incomePath} className="income-line" /><path d={lineChart.expensePath} className="expense-line" />{reportSeries.map((period, index) => <g key={period.key}><circle cx={lineChart.x(index)} cy={lineChart.y(period.income)} r="4" className="income-point"><title>{period.label} income: {peso.format(period.income)}</title></circle><circle cx={lineChart.x(index)} cy={lineChart.y(period.expense)} r="4" className="expense-point"><title>{period.label} spent: {peso.format(period.expense)}</title></circle><text x={lineChart.x(index)} y={lineChart.height - 14} textAnchor="middle">{period.label}</text></g>)}</svg></div>}
                    <AIInsightNote placement="cashflow" state={aiInsights} />
                </article>
            </section>
            <section className="dashboard-lower-grid">
                <article className="analytics-panel budget-panel"><div className="panel-heading"><div><p className="dashboard-eyebrow">Bar graph</p><h2>Budget utilization</h2></div><strong>{peso.format(analytics.budgetTotal)} total</strong></div>
                    {loading ? <div className="chart-loading">Loading budgets…</div> : analytics.budgetUsage.length === 0 ? <div className="chart-empty">Create a budget to compare limits with actual spending.</div> : <div className="bar-chart" role="img" aria-label="Horizontal bar graph showing budget utilization">{analytics.budgetUsage.map((budget) => <div className="bar-row" key={budget.id}><div className="bar-label"><strong>{budget.name}</strong><span>{peso.format(budget.spent)} of {peso.format(budget.limit)}</span></div><div className="bar-track"><span className={budget.percentage >= 100 ? "over" : budget.percentage >= 80 ? "warning" : ""} style={{ width: `${Math.min(budget.percentage, 100)}%` }} /></div><strong className="bar-value">{budget.percentage.toFixed(0)}%</strong></div>)}</div>}
                    <AIInsightNote placement="budget" state={aiInsights} />
                </article>
                <article className="analytics-panel goals-panel"><div className="panel-heading"><div><p className="dashboard-eyebrow">Goal analytics</p><h2>Saving progress</h2></div><strong>{goals.length} active</strong></div>
                    {loading ? <div className="chart-loading">Loading goals…</div> : analytics.goalProgress.length === 0 ? <div className="chart-empty">Create a saving goal to track progress here.</div> : <div className="goal-analysis-list">{analytics.goalProgress.map((goal) => <div className="goal-analysis" key={goal.id}><div><strong>{goal.name}</strong><span>{goal.targetDate ? `Due ${dateFormatter.format(new Date(`${goal.targetDate}T00:00:00`))}` : "No target date"}</span></div><div className="goal-analysis-values"><strong>{peso.format(goal.current)}</strong><span>of {peso.format(goal.target)}</span></div><div className="goal-track"><span style={{ width: `${Math.min(goal.percentage, 100)}%` }} /></div><strong className="goal-percent">{goal.percentage.toFixed(0)}%</strong></div>)}</div>}
                    <AIInsightNote placement="savings" state={aiInsights} />
                </article>
            </section>
            <section className="dashboard-summary-strip" aria-label="Data coverage"><div><strong>{transactions.length}</strong><span>Total transactions</span></div><div><strong>{budgets.length}</strong><span>Budgets tracked</span></div><div><strong>{goals.length}</strong><span>Saving goals</span></div><div><strong>{aiInsights.generatedAt ? new Date(aiInsights.generatedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "—"}</strong><span>AI last updated</span></div></section>
        </main>
    )
}

export default Dashboard
