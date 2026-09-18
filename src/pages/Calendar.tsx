import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"
import type { Tables } from "../types/database"
import "./Calendar.css"

type EventKind = "transaction" | "saving" | "budget"
type CalendarEvent = { id: string; kind: EventKind; title: string; subtitle: string; date: Date; amount: number | null; allDay: boolean }
type TransactionRecord = Pick<Tables<"transactions">, "id" | "amount" | "type" | "note" | "transaction_date"> & { category: { name: string } | null }
type SavingGoal = Pick<Tables<"saving_goals">, "savings_id" | "goal_name" | "target_amount" | "start_date" | "target_date">
type Budget = Pick<Tables<"budget_management">, "budget_id" | "budget" | "category" | "start_date" | "end_date">

const pesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const monthFormatter = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" })
const dayTitleFormatter = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric" })
const timeFormatter = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" })
const compactDateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" })
const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const eventKinds: Array<{ kind: EventKind; label: string }> = [
    { kind: "transaction", label: "Transactions" },
    { kind: "saving", label: "Saving goals" },
    { kind: "budget", label: "Budgets" },
]

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()) }
function fromDateOnly(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day) }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }
function sameDay(first: Date, second: Date) { return dateKey(first) === dateKey(second) }
function makeMonthDays(month: Date) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date })
}

async function getAuthenticatedUserId() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error("You must be signed in to view your calendar.")
    return user.id
}

function Calendar() {
    const today = useMemo(() => startOfDay(new Date()), [])
    const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
    const [selectedDate, setSelectedDate] = useState(today)
    const [transactions, setTransactions] = useState<TransactionRecord[]>([])
    const [savingGoals, setSavingGoals] = useState<SavingGoal[]>([])
    const [budgets, setBudgets] = useState<Budget[]>([])
    const [enabledKinds, setEnabledKinds] = useState<Set<EventKind>>(() => new Set(["transaction", "saving", "budget"]))
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState("")

    const fetchCalendarData = useCallback(async () => {
        setIsLoading(true); setErrorMessage("")
        try {
            const userId = await getAuthenticatedUserId()
            const [transactionResult, savingResult, budgetResult] = await Promise.all([
                supabase.from("transactions").select("id, amount, type, note, transaction_date, category:categories!transactions_category_id_fkey(name)").eq("user_id", userId).order("transaction_date"),
                supabase.from("saving_goals").select("savings_id, goal_name, target_amount, start_date, target_date").eq("user_id", userId).order("target_date"),
                supabase.from("budget_management").select("budget_id, budget, category, start_date, end_date").eq("user_id", userId).order("start_date"),
            ])
            if (transactionResult.error) throw transactionResult.error
            if (savingResult.error) throw savingResult.error
            if (budgetResult.error) throw budgetResult.error
            setTransactions((transactionResult.data ?? []) as TransactionRecord[])
            setSavingGoals(savingResult.data ?? []); setBudgets(budgetResult.data ?? [])
        } catch (error) {
            setTransactions([]); setSavingGoals([]); setBudgets([])
            setErrorMessage(error instanceof Error ? error.message : "Unable to load calendar items.")
        } finally { setIsLoading(false) }
    }, [])

    useEffect(() => { const timeoutId = window.setTimeout(() => void fetchCalendarData(), 0); return () => window.clearTimeout(timeoutId) }, [fetchCalendarData])

    const events = useMemo<CalendarEvent[]>(() => {
        const transactionEvents = transactions.map((transaction): CalendarEvent => ({
            id: `transaction-${transaction.id}`, kind: "transaction",
            title: transaction.category?.name || transaction.note || `${transaction.type} transaction`,
            subtitle: transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1), date: new Date(transaction.transaction_date),
            amount: Number(transaction.amount), allDay: false,
        })).filter((event) => !Number.isNaN(event.date.getTime()))
        const savingEvents = savingGoals.flatMap((goal): CalendarEvent[] => {
            const result: CalendarEvent[] = []; const title = goal.goal_name || "Saving goal"; const amount = Number(goal.target_amount ?? 0)
            if (goal.start_date) result.push({ id: `saving-start-${goal.savings_id}`, kind: "saving", title, subtitle: "Goal started", date: fromDateOnly(goal.start_date), amount, allDay: true })
            if (goal.target_date) result.push({ id: `saving-target-${goal.savings_id}`, kind: "saving", title, subtitle: "Target date", date: fromDateOnly(goal.target_date), amount, allDay: true })
            return result
        })
        const budgetEvents = budgets.flatMap((budget): CalendarEvent[] => {
            const result: CalendarEvent[] = []; const title = `${budget.category || "Budget"} budget`; const amount = Number(budget.budget ?? 0)
            if (budget.start_date) result.push({ id: `budget-start-${budget.budget_id}`, kind: "budget", title, subtitle: "Budget starts", date: fromDateOnly(budget.start_date), amount, allDay: true })
            if (budget.end_date) result.push({ id: `budget-end-${budget.budget_id}`, kind: "budget", title, subtitle: "Budget ends", date: fromDateOnly(budget.end_date), amount, allDay: true })
            return result
        })
        return [...transactionEvents, ...savingEvents, ...budgetEvents].sort((first, second) => first.date.getTime() - second.date.getTime())
    }, [budgets, savingGoals, transactions])

    const filteredEvents = useMemo(() => events.filter((event) => enabledKinds.has(event.kind)), [enabledKinds, events])
    const eventsByDay = useMemo(() => filteredEvents.reduce<Record<string, CalendarEvent[]>>((result, event) => { const key = dateKey(event.date); result[key] = [...(result[key] ?? []), event]; return result }, {}), [filteredEvents])
    const monthDays = useMemo(() => makeMonthDays(visibleMonth), [visibleMonth])
    const selectedEvents = eventsByDay[dateKey(selectedDate)] ?? []
    const monthEventCount = filteredEvents.filter((event) => event.date.getFullYear() === visibleMonth.getFullYear() && event.date.getMonth() === visibleMonth.getMonth()).length
    const upcomingEvents = filteredEvents.filter((event) => event.date >= today).slice(0, 5)

    const moveMonth = (offset: number) => { const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1); setVisibleMonth(next); setSelectedDate(next) }
    const goToToday = () => { setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(today) }
    const selectDay = (date: Date) => { setSelectedDate(date); if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1)) }
    const selectDate = (value: string) => { if (value) selectDay(fromDateOnly(value)) }
    const toggleKind = (kind: EventKind) => setEnabledKinds((current) => { const next = new Set(current); if (next.has(kind)) next.delete(kind); else next.add(kind); return next })

    return (
        <main className="calendar-page">
            <header className="calendar-header">
                <div className="calendar-heading">
                    <p className="calendar-eyebrow">Financial planner</p>
                    <h1>Calendar</h1>
                    <div className="calendar-month-count"><strong>{monthEventCount}</strong><span>total items this month</span></div>
                </div>
                <div className="calendar-controls">
                    <button type="button" className="today-button" onClick={goToToday}>Today</button>
                    <div className="month-navigation" aria-label="Calendar navigation"><button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>›</button></div>
                    <div className="month-and-date">
                        <h2 aria-live="polite">{monthFormatter.format(visibleMonth)}</h2>
                        <label className="date-jump"><span>Jump to date (MM/DD/YYYY)</span><input type="date" lang="en-US" value={dateKey(selectedDate)} aria-label="Jump to date, MM/DD/YYYY" onChange={(event) => selectDate(event.target.value)} /></label>
                    </div>
                </div>
            </header>
            {errorMessage && <div className="calendar-notice" role="alert">{errorMessage}<button type="button" onClick={() => void fetchCalendarData()}>Try again</button></div>}
            <div className="calendar-layout">
                <aside className="calendar-sidebar" aria-label="Calendar filters">
                    <section><p className="sidebar-section-title">My calendars</p><div className="calendar-filter-list">{eventKinds.map(({ kind, label }) => <label key={kind} className={`calendar-filter filter-${kind}`}><input type="checkbox" checked={enabledKinds.has(kind)} onChange={() => toggleKind(kind)} /><span className="filter-check" aria-hidden="true">✓</span><span>{label}</span></label>)}</div></section>
                    <section className="upcoming-section"><p className="sidebar-section-title">Coming up</p>{isLoading ? <p className="sidebar-empty">Loading planner…</p> : upcomingEvents.length === 0 ? <p className="sidebar-empty">Nothing upcoming yet.</p> : <div className="upcoming-list">{upcomingEvents.map((event) => <button type="button" key={event.id} onClick={() => selectDay(event.date)}><span className={`upcoming-dot event-${event.kind}`} /><span><strong>{event.title}</strong><small>{compactDateFormatter.format(event.date)} · {event.allDay ? event.subtitle : timeFormatter.format(event.date)}</small></span></button>)}</div>}</section>
                </aside>
                <section className="calendar-board" aria-label={`${monthFormatter.format(visibleMonth)} calendar`}>
                    <div className="weekday-row">{weekDays.map((day) => <div key={day}>{day}</div>)}</div>
                    <div className="month-grid">{monthDays.map((date) => {
                        const dayEvents = eventsByDay[dateKey(date)] ?? []; const isOutside = date.getMonth() !== visibleMonth.getMonth(); const isToday = sameDay(date, today); const isSelected = sameDay(date, selectedDate)
                        return <button type="button" key={dateKey(date)} className={`calendar-day${isOutside ? " outside-month" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`} aria-label={`${dayTitleFormatter.format(date)}, ${dayEvents.length} items`} onClick={() => selectDay(date)}><span className="day-number">{date.getDate()}</span><span className="day-events">{isLoading && !isOutside ? <span className="event-skeleton" /> : dayEvents.slice(0, 3).map((event) => <span className={`calendar-event event-${event.kind}`} key={event.id} title={`${event.title} — ${event.subtitle}`}>{!event.allDay && <time>{timeFormatter.format(event.date)}</time>}<span>{event.title}</span></span>)}{dayEvents.length > 3 && <span className="more-events">+{dayEvents.length - 3} more</span>}</span></button>
                    })}</div>
                </section>
                <aside className="day-agenda" aria-label="Selected day agenda"><div className="agenda-heading"><span>{selectedDate.toLocaleDateString("en-PH", { weekday: "short" })}</span><strong>{selectedDate.getDate()}</strong><p>{selectedDate.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</p></div><div className="agenda-divider" />{isLoading ? <p className="agenda-empty">Loading your schedule…</p> : selectedEvents.length === 0 ? <div className="agenda-empty"><span>✓</span><strong>All clear</strong><p>No financial activity planned for this day.</p></div> : <div className="agenda-list">{selectedEvents.map((event) => <article className={`agenda-item agenda-${event.kind}`} key={event.id}><div className="agenda-time">{event.allDay ? "All day" : timeFormatter.format(event.date)}</div><div><span className="agenda-kind">{event.subtitle}</span><h3>{event.title}</h3>{event.amount !== null && <p>{pesoFormatter.format(event.amount)}</p>}</div></article>)}</div>}</aside>
            </div>
        </main>
    )
}

export default Calendar
