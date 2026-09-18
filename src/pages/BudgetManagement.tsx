import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { supabase } from "../supabaseClient"
import type { Tables, TablesInsert } from "../types/database"
import "./BudgetManagement.css"

type ExpenseCategory = Pick<Tables<"categories">, "id" | "name">
type BudgetRecord = Tables<"budget_management">
type ExpenseTransaction = Pick<Tables<"transactions">, "amount" | "category_id" | "transaction_date">
type BudgetTracker = BudgetRecord & {
    categoryName: string
    budgetAmount: number
    spentAmount: number
    remainingAmount: number
    percentageUsed: number
}
type StatusMessage = { kind: "success" | "error"; text: string }
type BudgetForm = { categoryId: string; amount: string; startDate: string; endDate: string }

const pesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const dateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" })

function toInputDate(date: Date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return localDate.toISOString().slice(0, 10)
}

function createInitialForm(): BudgetForm {
    const today = new Date()
    return {
        categoryId: "",
        amount: "",
        startDate: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
        endDate: toInputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    }
}

async function getAuthenticatedUserId() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error("You must be signed in to manage budgets.")
    return user.id
}

function getBudgetStatus(percentage: number) {
    if (percentage >=  100) return { className: "danger", label: "Budget limit reached" }
    if (percentage >= 80) return { className: "warning", label: "Near budget limit" }
    return { className: "safe", label: "On track" }
}

function formatDate(value: string | null) {
    if (!value) return "No date"
    const date = new Date(`${value}T00:00:00`)
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function BudgetManagement() {
    const [categories, setCategories] = useState<ExpenseCategory[]>([])
    const [budgets, setBudgets] = useState<BudgetRecord[]>([])
    const [expenseTransactions, setExpenseTransactions] = useState<ExpenseTransaction[]>([])
    const [form, setForm] = useState<BudgetForm>(createInitialForm)
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [message, setMessage] = useState<StatusMessage | null>(null)

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
            const userId = await getAuthenticatedUserId()
            const [categoryResult, budgetResult, transactionResult] = await Promise.all([
                supabase.from("categories").select("id, name").eq("type", "expense").order("name"),
                supabase.from("budget_management").select("*").eq("user_id", userId).order("start_date", { ascending: false }),
                supabase.from("transactions").select("amount, category_id, transaction_date").eq("user_id", userId).eq("type", "expense"),
            ])
            if (categoryResult.error) throw categoryResult.error
            if (budgetResult.error) throw budgetResult.error
            if (transactionResult.error) throw transactionResult.error
            setCategories(categoryResult.data ?? [])
            setBudgets(budgetResult.data ?? [])
            setExpenseTransactions(transactionResult.data ?? [])
        } catch (error) {
            setCategories([])
            setBudgets([])
            setExpenseTransactions([])
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to load budgets." })
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        const timeoutId = window.setTimeout(() => void fetchData(), 0)
        return () => window.clearTimeout(timeoutId)
    }, [fetchData])

    const trackers = useMemo<BudgetTracker[]>(() => budgets.map((budget) => {
        const budgetAmount = Number(budget.budget ?? 0)
        const spentAmount = expenseTransactions.reduce((total, transaction) => {
            const transactionDate = transaction.transaction_date.slice(0, 10)
            const matchesCategory = transaction.category_id === budget.category_id
            const isAfterStart = !budget.start_date || transactionDate >= budget.start_date
            const isBeforeEnd = !budget.end_date || transactionDate <= budget.end_date
            return matchesCategory && isAfterStart && isBeforeEnd ? total + Number(transaction.amount) : total
        }, 0)

        return {
            ...budget,
            categoryName: categories.find(({ id }) => id === budget.category_id)?.name ?? budget.category ?? "Uncategorized",
            budgetAmount,
            spentAmount,
            remainingAmount: budgetAmount - spentAmount,
            percentageUsed: budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0,
        }
    }), [budgets, categories, expenseTransactions])

    const totals = useMemo(() => trackers.reduce((result, tracker) => ({
        budget: result.budget + tracker.budgetAmount,
        spent: result.spent + tracker.spentAmount,
    }), { budget: 0, spent: 0 }), [trackers])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const amount = Number(form.amount)
        const category = categories.find(({ id }) => id === form.categoryId)
        if (!category || !Number.isFinite(amount) || amount <= 0) {
            setMessage({ kind: "error", text: "Choose a category and enter a budget greater than zero." })
            return
        }
        if (!form.startDate || !form.endDate || form.startDate > form.endDate) {
            setMessage({ kind: "error", text: "Choose a valid budget date range." })
            return
        }

        setIsSubmitting(true)
        setMessage(null)
        try {
            const userId = await getAuthenticatedUserId()
            const payload: TablesInsert<"budget_management"> = {
                user_id: userId,
                category_id: category.id,
                category: category.name,
                budget: amount,
                start_date: form.startDate,
                end_date: form.endDate,
                period: "custom",
            }
            const { data, error } = await supabase.from("budget_management").insert(payload).select("budget_id")
            if (error) throw error
            if (!data?.length) throw new Error("The budget could not be created.")
            setForm(createInitialForm())
            setMessage({ kind: "success", text: `${category.name} budget created.` })
            await fetchData()
        } catch (error) {
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to create budget." })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (budget: BudgetTracker) => {
        if (!window.confirm(`Delete the ${budget.categoryName} budget?`)) return
        setDeletingId(budget.budget_id)
        setMessage(null)
        try {
            const userId = await getAuthenticatedUserId()
            const { data, error } = await supabase.from("budget_management").delete().eq("budget_id", budget.budget_id).eq("user_id", userId).select("budget_id")
            if (error) throw error
            if (!data?.length) throw new Error("Budget not found or access denied.")
            setBudgets((current) => current.filter(({ budget_id: id }) => id !== budget.budget_id))
            setMessage({ kind: "success", text: "Budget deleted." })
        } catch (error) {
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to delete budget." })
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <main className="budget-page">
            <section className="budget-heading"><div><p className="budget-eyebrow">Planning</p><h1>Budget management</h1><p>Create a category budget and track spending from your expense transactions.</p></div></section>
            {message && <div className={`budget-notice budget-notice-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}

            <section className="budget-summary" aria-label="Budget summary">
                <article><span>Total budget</span><strong>{pesoFormatter.format(totals.budget)}</strong></article>
                <article><span>Total spent</span><strong>{pesoFormatter.format(totals.spent)}</strong></article>
                <article><span>Total remaining</span><strong>{pesoFormatter.format(totals.budget - totals.spent)}</strong></article>
            </section>

            <section className="budget-layout">
                <form className="budget-form" onSubmit={handleSubmit}>
                    <div><p className="budget-eyebrow">New tracker</p><h2>Create a budget</h2></div>
                    <label><span>Expense category</span><select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))} disabled={isLoading || categories.length === 0} required>
                        <option value="">{isLoading ? "Loading categories…" : categories.length ? "Select category" : "No expense categories available"}</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select></label>
                    <label><span>Budget limit</span><div className="budget-amount-input"><span>₱</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></div></label>
                    <div className="budget-date-grid">
                        <label><span>Start date</span><input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} required /></label>
                        <label><span>End date</span><input type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} required /></label>
                    </div>
                    <button className="budget-primary-button" type="submit" disabled={isSubmitting || isLoading || categories.length === 0}>{isSubmitting ? "Creating…" : "Create budget"}</button>
                </form>

                <section className="budget-trackers" aria-labelledby="budget-trackers-title">
                    <div className="budget-trackers-heading"><div><p className="budget-eyebrow">Progress</p><h2 id="budget-trackers-title">Category trackers</h2></div><span>{trackers.length} {trackers.length === 1 ? "budget" : "budgets"}</span></div>
                    {isLoading ? <div className="budget-empty" role="status">Loading budgets…</div> : trackers.length === 0 ? <div className="budget-empty">Create your first category budget to start tracking expenses.</div> : (
                        <div className="budget-card-list">{trackers.map((budget) => {
                            const status = getBudgetStatus(budget.percentageUsed)
                            return <article className={`budget-card budget-card-${status.className}`} key={budget.budget_id}>
                                <div className="budget-card-heading"><div><h3>{budget.categoryName}</h3><p>{formatDate(budget.start_date)} – {formatDate(budget.end_date)}</p></div><span className={`budget-status budget-status-${status.className}`}>{status.label}</span></div>
                                <div className="budget-progress-label"><span>{pesoFormatter.format(budget.spentAmount)} spent</span><strong>{budget.percentageUsed.toFixed(0)}%</strong></div>
                                <div className="budget-progress" aria-label={`${budget.percentageUsed.toFixed(0)} percent of budget used`}><span style={{ width: `${Math.min(Math.max(budget.percentageUsed, 0), 100)}%` }} /></div>
                                <div className="budget-card-footer"><span>{pesoFormatter.format(Math.abs(budget.remainingAmount))} {budget.remainingAmount < 0 ? "over budget" : "remaining"}</span><span>of {pesoFormatter.format(budget.budgetAmount)}</span><button type="button" disabled={deletingId === budget.budget_id} onClick={() => void handleDelete(budget)}>{deletingId === budget.budget_id ? "Deleting…" : "Delete"}</button></div>
                            </article>
                        })}</div>
                    )}
                </section>
            </section>
        </main>
    )
}

export default BudgetManagement
