import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../supabaseClient"
import "./Transaction.css"

const TRANSACTIONS_TABLE = "transactions"
const categoriesByType = {
    income: ["Salary", "Freelance", "Investment", "Gift / Allowance", "Other Income"],
    expense: ["Food & Dining", "Transportation", "Housing", "Bills & Utilities", "Shopping", "Entertainment", "Health & Personal Care", "Other Expense"],
    transfer: ["Account Transfer"],
} as const
const accountWalletOptions = ["GCash", "Maya", "Cash", "Debit", "Credit"] as const

type TransactionType = keyof typeof categoriesByType
type StatusMessage = { kind: "success" | "error"; text: string }
type FormState = {
    type: TransactionType
    category: string
    accountWallet: string
    amount: string
    note: string
    transactionDate: string
}

interface TransactionRecord {
    id: string
    user_id: string
    transaction_id: string
    type: TransactionType
    category: string
    account_wallet: string
    amount: number
    note: string | null
    transaction_date: string
}

type TransactionPayload = Omit<TransactionRecord, "id">

const pesoFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
})
const dateFormatter = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
})

function toLocalInputDate(value = new Date().toISOString()) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function createEmptyForm(): FormState {
    return {
        type: "income",
        category: categoriesByType.income[0],
        accountWallet: accountWalletOptions[0],
        amount: "",
        note: "",
        transactionDate: toLocalInputDate(),
    }
}

function formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

async function getAuthenticatedUserId() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error("You must be signed in to manage transactions.")
    return user.id
}

function Transaction() {
    const navigate = useNavigate()
    const [transactions, setTransactions] = useState<TransactionRecord[]>([])
    const [form, setForm] = useState<FormState>(createEmptyForm)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [isFormVisible, setIsFormVisible] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [message, setMessage] = useState<StatusMessage | null>(null)
    const [search, setSearch] = useState("")
    const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all")

    const fetchTransactions = useCallback(async () => {
        setIsLoading(true)
        try {
            const userId = await getAuthenticatedUserId()
            const { data, error } = await supabase
                .from(TRANSACTIONS_TABLE)
                .select("*")
                .eq("user_id", userId)
                .order("transaction_date", { ascending: false })
                .returns<TransactionRecord[]>()
            if (error) throw error
            setTransactions(data ?? [])
        } catch (error) {
            setTransactions([])
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to load transactions." })
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        const timeoutId = window.setTimeout(() => void fetchTransactions(), 0)
        return () => window.clearTimeout(timeoutId)
    }, [fetchTransactions])

    const visibleTransactions = useMemo(() => {
        const query = search.trim().toLowerCase()
        return transactions.filter((transaction) => {
            const matchesType = typeFilter === "all" || transaction.type === typeFilter
            const matchesSearch = !query || [
                transaction.transaction_id,
                transaction.category,
                transaction.account_wallet,
                transaction.note ?? "",
            ].some((value) => value.toLowerCase().includes(query))
            return matchesType && matchesSearch
        })
    }, [search, transactions, typeFilter])

    const totals = useMemo(() => transactions.reduce(
        (sum, transaction) => ({
            income: sum.income + (transaction.type === "income" ? Number(transaction.amount) : 0),
            expense: sum.expense + (transaction.type === "expense" ? Number(transaction.amount) : 0),
        }),
        { income: 0, expense: 0 },
    ), [transactions])

    const closeForm = () => {
        setForm(createEmptyForm())
        setEditingId(null)
        setIsFormVisible(false)
    }

    const openCreateForm = () => {
        setForm(createEmptyForm())
        setEditingId(null)
        setMessage(null)
        setIsFormVisible(true)
    }

    const openEditForm = (transaction: TransactionRecord) => {
        setForm({
            type: transaction.type,
            category: transaction.category,
            accountWallet: transaction.account_wallet,
            amount: String(transaction.amount),
            note: transaction.note ?? "",
            transactionDate: toLocalInputDate(transaction.transaction_date),
        })
        setEditingId(transaction.id)
        setMessage(null)
        setIsFormVisible(true)
    }

    const updateForm = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
        setForm((current) => ({ ...current, [key]: value }))
    }

    const handleTypeChange = (nextType: TransactionType) => {
        setForm((current) => ({
            ...current,
            type: nextType,
            category: categoriesByType[nextType][0],
        }))
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const amount = Number(form.amount)
        const date = new Date(form.transactionDate)
        if (!Number.isFinite(amount) || amount <= 0 || !form.accountWallet.trim() || Number.isNaN(date.getTime())) {
            setMessage({ kind: "error", text: "Please enter a valid amount, wallet, and date." })
            return
        }

        setIsSubmitting(true)
        setMessage(null)
        try {
            const userId = await getAuthenticatedUserId()
            const existing = editingId ? transactions.find(({ id }) => id === editingId) : undefined
            const payload: TransactionPayload = {
                user_id: userId,
                transaction_id: existing?.transaction_id ?? `TXN-${crypto.randomUUID()}`,
                type: form.type,
                category: form.category,
                account_wallet: form.accountWallet.trim(),
                amount,
                note: form.note.trim() || null,
                transaction_date: date.toISOString(),
            }
            const query = editingId
                ? supabase.from(TRANSACTIONS_TABLE).update(payload).eq("id", editingId).eq("user_id", userId)
                : supabase.from(TRANSACTIONS_TABLE).insert(payload)
            const { data, error } = await query.select("id")
            if (error) throw error
            if (editingId && !data?.length) throw new Error("Transaction not found or access denied.")

            const successText = editingId ? "Transaction updated." : "Transaction added."
            closeForm()
            setMessage({ kind: "success", text: successText })
            await fetchTransactions()
        } catch (error) {
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to save transaction." })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (transaction: TransactionRecord) => {
        if (!window.confirm(`Delete ${transaction.transaction_id}? This cannot be undone.`)) return
        setDeletingId(transaction.id)
        setMessage(null)
        try {
            const userId = await getAuthenticatedUserId()
            const { data, error } = await supabase.from(TRANSACTIONS_TABLE).delete()
                .eq("id", transaction.id).eq("user_id", userId).select("id")
            if (error) throw error
            if (!data?.length) throw new Error("Transaction not found or access denied.")
            if (editingId === transaction.id) closeForm()
            setTransactions((current) => current.filter(({ id }) => id !== transaction.id))
            setMessage({ kind: "success", text: "Transaction deleted." })
        } catch (error) {
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to delete transaction." })
        } finally {
            setDeletingId(null)
        }
    }

    const handleLogout = async () => {
        setIsLoggingOut(true)
        const { error } = await supabase.auth.signOut()
        if (error) {
            setMessage({ kind: "error", text: `Unable to log out: ${error.message}` })
            setIsLoggingOut(false)
            return
        }
        navigate("/Login", { replace: true })
    }

    return (
        <div className="transactions-page">
            <header className="transactions-header">
                <Link className="brand" to="/Transaction" aria-label="Finaura transactions">
                    <span className="brand-mark">F</span><span>Finaura</span>
                </Link>
                <nav aria-label="Primary navigation">
                    <Link className="nav-link active" to="/Transaction">Transactions</Link>
                </nav>
                <button className="button button-ghost" type="button" disabled={isLoggingOut} onClick={() => void handleLogout()}>
                    {isLoggingOut ? "Logging out…" : "Log out"}
                </button>
            </header>

            <main className="transactions-main">
                <section className="page-heading">
                    <div><p className="eyebrow">Overview</p><h1>Transactions</h1><p>Track every peso across your accounts.</p></div>
                    <button className="button button-primary" type="button" onClick={openCreateForm}>+ Add transaction</button>
                </section>

                {message && <div className={`notice notice-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}

                <section className="summary-grid" aria-label="Transaction summary">
                    <article className="summary-card"><span>Total income</span><strong className="income-text">{pesoFormatter.format(totals.income)}</strong></article>
                    <article className="summary-card"><span>Total expenses</span><strong className="expense-text">{pesoFormatter.format(totals.expense)}</strong></article>
                    <article className="summary-card"><span>Net balance</span><strong>{pesoFormatter.format(totals.income - totals.expense)}</strong></article>
                </section>

                <section className="transactions-card">
                    <div className="toolbar">
                        <div className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Search transactions" type="search" placeholder="Search ID, category, wallet, or note" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
                        <label className="filter-field"><span>Type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | TransactionType)}>
                            <option value="all">All transactions</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option>
                        </select></label>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Account</th><th>Note</th><th className="amount-cell">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
                            <tbody>
                                {isLoading ? <tr><td className="empty-state" colSpan={7}>Loading transactions…</td></tr>
                                    : visibleTransactions.length === 0 ? <tr><td className="empty-state" colSpan={7}>{transactions.length ? "No transactions match your search." : "No transactions yet. Add your first one to get started."}</td></tr>
                                    : visibleTransactions.map((transaction) => <tr key={transaction.id}>
                                        <td><span className="date-primary">{formatDate(transaction.transaction_date)}</span><small>{transaction.transaction_id}</small></td>
                                        <td><span className={`type-badge type-${transaction.type}`}>{transaction.type}</span></td>
                                        <td>{transaction.category}</td><td>{transaction.account_wallet}</td><td className="note-cell">{transaction.note || "—"}</td>
                                        <td className={`amount-cell ${transaction.type === "income" ? "income-text" : transaction.type === "expense" ? "expense-text" : ""}`}>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}{pesoFormatter.format(Number(transaction.amount))}</td>
                                        <td><div className="row-actions"><button type="button" onClick={() => openEditForm(transaction)}>Edit</button><button className="delete-action" type="button" disabled={deletingId !== null} onClick={() => void handleDelete(transaction)}>{deletingId === transaction.id ? "Deleting…" : "Delete"}</button></div></td>
                                    </tr>)}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            {isFormVisible && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) closeForm() }}>
                <section className="transaction-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-form-title">
                    <div className="modal-heading"><div><p className="eyebrow">{editingId ? "Update record" : "New record"}</p><h2 id="transaction-form-title">{editingId ? "Edit transaction" : "Add transaction"}</h2></div><button className="close-button" type="button" aria-label="Close form" disabled={isSubmitting} onClick={closeForm}>×</button></div>
                    <form id="transaction-form" onSubmit={handleSubmit}>
                        <div className="type-picker" role="group" aria-label="Transaction type">{(["income", "expense", "transfer"] as const).map((option) => <button key={option} className={form.type === option ? "selected" : ""} type="button" onClick={() => handleTypeChange(option)}>{option}</button>)}</div>
                        <div className="form-grid">
                            <label><span>Category</span><select value={form.category} onChange={(event) => updateForm("category", event.target.value)} required>{categoriesByType[form.type].map((option) => <option key={option}>{option}</option>)}</select></label>
                            <label><span>Account / wallet</span><input list="account-wallet-options" value={form.accountWallet} onChange={(event) => updateForm("accountWallet", event.target.value)} required /><datalist id="account-wallet-options">{accountWalletOptions.map((option) => <option key={option} value={option} />)}</datalist></label>
                            <label><span>Amount</span><div className="amount-input"><span>₱</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => updateForm("amount", event.target.value)} required /></div></label>
                            <label><span>Date and time</span><input type="datetime-local" value={form.transactionDate} onChange={(event) => updateForm("transactionDate", event.target.value)} required /></label>
                            <label className="full-field"><span>Note <small>(optional)</small></span><textarea rows={3} placeholder="Add a short description" value={form.note} onChange={(event) => updateForm("note", event.target.value)} /></label>
                        </div>
                        <div className="form-actions"><button className="button button-ghost" type="button" disabled={isSubmitting} onClick={closeForm}>Cancel</button><button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : editingId ? "Save changes" : "Add transaction"}</button></div>
                    </form>
                </section>
            </div>}
        </div>
    )
}

export default Transaction
