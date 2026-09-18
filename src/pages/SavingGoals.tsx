import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { supabase } from "../supabaseClient"
import type { Tables, TablesInsert } from "../types/database"
import "./SavingGoals.css"

type SavingGoal = Tables<"saving_goals">
type GoalContribution = Pick<Tables<"transactions">, "amount" | "saving_goal_id">
type StatusMessage = { kind: "success" | "error"; text: string }
type GoalForm = { name: string; targetAmount: string; startDate: string; targetDate: string }

const pesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const dateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" })

function toInputDate(date: Date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return localDate.toISOString().slice(0, 10)
}

function createInitialForm(): GoalForm {
    const today = new Date()
    return {
        name: "",
        targetAmount: "",
        startDate: toInputDate(today),
        targetDate: toInputDate(new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())),
    }
}

async function getAuthenticatedUserId() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error("You must be signed in to manage saving goals.")
    return user.id
}

function formatDate(value: string | null) {
    if (!value) return "No target date"
    const date = new Date(`${value}T00:00:00`)
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function SavingGoals() {
    const [goals, setGoals] = useState<SavingGoal[]>([])
    const [contributions, setContributions] = useState<GoalContribution[]>([])
    const [form, setForm] = useState<GoalForm>(createInitialForm)
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const [message, setMessage] = useState<StatusMessage | null>(null)

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
            const userId = await getAuthenticatedUserId()
            const [goalResult, contributionResult] = await Promise.all([
                supabase.from("saving_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
                supabase.from("transactions").select("amount, saving_goal_id").eq("user_id", userId).eq("type", "transfer").not("saving_goal_id", "is", null),
            ])
            if (goalResult.error) throw goalResult.error
            if (contributionResult.error) throw contributionResult.error
            setGoals(goalResult.data ?? [])
            setContributions(contributionResult.data ?? [])
        } catch (error) {
            setGoals([])
            setContributions([])
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to load saving goals." })
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        const timeoutId = window.setTimeout(() => void fetchData(), 0)
        return () => window.clearTimeout(timeoutId)
    }, [fetchData])

    const trackers = useMemo(() => goals.map((goal) => {
        const targetAmount = Number(goal.target_amount ?? 0)
        const savedAmount = contributions.reduce((total, contribution) => (
            contribution.saving_goal_id === goal.savings_id ? total + Number(contribution.amount) : total
        ), 0)
        return {
            ...goal,
            targetAmount,
            savedAmount,
            remainingAmount: Math.max(targetAmount - savedAmount, 0),
            percentage: targetAmount > 0 ? (savedAmount / targetAmount) * 100 : 0,
        }
    }), [contributions, goals])

    const totals = useMemo(() => trackers.reduce((total, goal) => ({
        target: total.target + goal.targetAmount,
        saved: total.saved + goal.savedAmount,
    }), { target: 0, saved: 0 }), [trackers])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const targetAmount = Number(form.targetAmount)
        if (!form.name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) {
            setMessage({ kind: "error", text: "Enter a goal name and a target amount greater than zero." })
            return
        }
        if (!form.startDate || !form.targetDate || form.startDate > form.targetDate) {
            setMessage({ kind: "error", text: "Choose a valid saving period." })
            return
        }

        setIsSubmitting(true)
        setMessage(null)
        try {
            const userId = await getAuthenticatedUserId()
            const payload: TablesInsert<"saving_goals"> = {
                user_id: userId,
                goal_name: form.name.trim(),
                target_amount: targetAmount,
                start_date: form.startDate,
                target_date: form.targetDate,
            }
            const { data, error } = await supabase.from("saving_goals").insert(payload).select("savings_id")
            if (error) throw error
            if (!data?.length) throw new Error("The saving goal could not be created.")
            setForm(createInitialForm())
            setMessage({ kind: "success", text: "Saving goal created. Tag a transfer with this goal to add progress." })
            await fetchData()
        } catch (error) {
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to create saving goal." })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (goal: SavingGoal) => {
        if (!window.confirm(`Delete the ${goal.goal_name ?? "selected"} saving goal?`)) return
        setDeletingId(goal.savings_id)
        setMessage(null)
        try {
            const userId = await getAuthenticatedUserId()
            const { data, error } = await supabase.from("saving_goals").delete().eq("savings_id", goal.savings_id).eq("user_id", userId).select("savings_id")
            if (error) throw error
            if (!data?.length) throw new Error("Saving goal not found or access denied.")
            setGoals((current) => current.filter(({ savings_id }) => savings_id !== goal.savings_id))
            setMessage({ kind: "success", text: "Saving goal deleted." })
        } catch (error) {
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to delete saving goal." })
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <main className="goals-page">
            <section className="goals-heading"><div><p className="goals-eyebrow">Future plans</p><h1>Saving goals</h1><p>Set a target and track every transfer you assign to it.</p></div></section>
            {message && <div className={`goals-notice goals-notice-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}

            <section className="goals-summary" aria-label="Saving goals summary">
                <article><span>Total target</span><strong>{pesoFormatter.format(totals.target)}</strong></article>
                <article><span>Total saved</span><strong>{pesoFormatter.format(totals.saved)}</strong></article>
                <article><span>Total remaining</span><strong>{pesoFormatter.format(Math.max(totals.target - totals.saved, 0))}</strong></article>
            </section>

            <section className="goals-layout">
                <form className="goal-form" onSubmit={handleSubmit}>
                    <div><p className="goals-eyebrow">New goal</p><h2>Create a saving goal</h2></div>
                    <label><span>What are you saving for?</span><input type="text" maxLength={100} placeholder="e.g. New phone" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
                    <label><span>Target amount</span><div className="goal-amount-input"><span>₱</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={form.targetAmount} onChange={(event) => setForm((current) => ({ ...current, targetAmount: event.target.value }))} required /></div></label>
                    <div className="goal-date-grid">
                        <label><span>Start date</span><input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} required /></label>
                        <label><span>Target date</span><input type="date" min={form.startDate} value={form.targetDate} onChange={(event) => setForm((current) => ({ ...current, targetDate: event.target.value }))} required /></label>
                    </div>
                    <button className="goal-primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create goal"}</button>
                </form>

                <section className="goal-trackers" aria-labelledby="goal-trackers-title">
                    <div className="goal-trackers-heading"><div><p className="goals-eyebrow">Progress</p><h2 id="goal-trackers-title">Your goals</h2></div><span>{trackers.length} {trackers.length === 1 ? "goal" : "goals"}</span></div>
                    {isLoading ? <div className="goals-empty" role="status">Loading goals…</div> : trackers.length === 0 ? <div className="goals-empty">Create your first saving goal to start tracking progress.</div> : (
                        <div className="goal-card-list">{trackers.map((goal) => {
                            const isComplete = goal.percentage >= 100
                            return <article className={`goal-card${isComplete ? " goal-card-complete" : ""}`} key={goal.savings_id}>
                                <div className="goal-card-heading"><div><h3>{goal.goal_name ?? "Saving goal"}</h3><p>Target date: {formatDate(goal.target_date)}</p></div><span className={`goal-status${isComplete ? " complete" : ""}`}>{isComplete ? "Goal reached" : "In progress"}</span></div>
                                <div className="goal-progress-label"><span>{pesoFormatter.format(goal.savedAmount)} saved</span><strong>{goal.percentage.toFixed(0)}%</strong></div>
                                <div className="goal-progress" aria-label={`${goal.percentage.toFixed(0)} percent of goal saved`}><span style={{ width: `${Math.min(Math.max(goal.percentage, 0), 100)}%` }} /></div>
                                <div className="goal-card-footer"><span>{pesoFormatter.format(goal.remainingAmount)} remaining</span><span>of {pesoFormatter.format(goal.targetAmount)}</span><button type="button" title={goal.savedAmount > 0 ? "Remove linked transfer contributions before deleting this goal." : undefined} disabled={deletingId === goal.savings_id || goal.savedAmount > 0} onClick={() => void handleDelete(goal)}>{deletingId === goal.savings_id ? "Deleting…" : goal.savedAmount > 0 ? "Has contributions" : "Delete"}</button></div>
                            </article>
                        })}</div>
                    )}
                </section>
            </section>
        </main>
    )
}

export default SavingGoals
