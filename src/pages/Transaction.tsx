import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { supabase } from "../supabaseClient"
import TransactionCards from "../components/TransactionCards"
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

async function getAuthenticatedUserId() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error("You must be signed in to manage transactions.")
    return user.id
}

function Transaction() {
    const [transactions, setTransactions] = useState<TransactionRecord[]>([])
    const [form, setForm] = useState<FormState>(createEmptyForm)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [isFormVisible, setIsFormVisible] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
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

   
    return (
        <div className="transactions-page">
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

                <TransactionCards
                    transactions={visibleTransactions}
                    totalTransactionCount={transactions.length}
                    isLoading={isLoading}
                    deletingId={deletingId}
                    search={search}
                    typeFilter={typeFilter}
                    onSearchChange={setSearch}
                    onTypeFilterChange={setTypeFilter}
                    onEdit={openEditForm}
                    onDelete={handleDelete}
                />
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
