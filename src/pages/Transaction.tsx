import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { supabase } from "../supabaseClient"
import type { Tables, TablesInsert, TablesUpdate } from "../types/database"
import TransactionCards from "../components/TransactionCards"
import "./Transaction.css"

type TransactionType = "income" | "expense" | "transfer"
type InstitutionType = "bank" | "e_wallet" | "cash"
type Category = Pick<Tables<"categories">, "id" | "name" | "type">
type Account = Pick<Tables<"accounts">, "id" | "account_name" | "account_type" | "financial_institution_id">
type FinancialInstitution = Pick<Tables<"financial_institutions">, "id" | "name"> & { type: InstitutionType }
type SavingGoalOption = Pick<Tables<"saving_goals">, "savings_id" | "goal_name" | "target_amount">
type StatusMessage = { kind: "success" | "error"; text: string }
type CategoryLoadState = "loading" | "ready" | "empty" | "error"
type InstitutionLoadState = "loading" | "ready" | "empty" | "error"
type TransactionRecord = Tables<"transactions"> & {
    category: { name: string } | null
    account: { account_name: string; account_type: string; financial_institution_id: string | null } | null
    from_account: { account_name: string; account_type: string; financial_institution_id: string | null } | null
    to_account: { account_name: string; account_type: string; financial_institution_id: string | null } | null
}
type FormState = {
    type: TransactionType
    categoryId: string
    accountId: string
    savingGoalId: string
    amount: string
    note: string
    transactionDate: string
}

const TRANSACTION_SELECT = `
    *,
    category:categories!transactions_category_id_fkey(name),
    account:accounts!transactions_account_id_fkey(account_name, account_type, financial_institution_id),
    from_account:accounts!transactions_from_account_id_fkey(account_name, account_type, financial_institution_id),
    to_account:accounts!transactions_to_account_id_fkey(account_name, account_type, financial_institution_id)
`
const pesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const institutionGroups: ReadonlyArray<{ type: InstitutionType; label: string }> = [
    { type: "bank", label: "Banks" },
    { type: "e_wallet", label: "e_wallet" },
    { type: "cash", label: "Cash" },
]

function isTransactionType(value: string): value is TransactionType {
    return value === "income" || value === "expense" || value === "transfer"
}

function isInstitutionType(value: string): value is InstitutionType {
    return institutionGroups.some((group) => group.type === value)
}

function toAccountType(institutionType: InstitutionType) {
    return institutionType === "e_wallet" ? "e-wallet" : institutionType
}

function toLocalInputDate(value = new Date().toISOString()) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function createEmptyForm(type: TransactionType = "income"): FormState {
    return { type, categoryId: "", accountId: "", savingGoalId: "", amount: "", note: "", transactionDate: toLocalInputDate() }
}

async function getAuthenticatedUserId() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error("You must be signed in to manage transactions.")
    return user.id
}

function Transaction() {
    const [transactions, setTransactions] = useState<TransactionRecord[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [categoryLoadState, setCategoryLoadState] = useState<CategoryLoadState>("loading")
    const [accounts, setAccounts] = useState<Account[]>([])
    const [institutions, setInstitutions] = useState<FinancialInstitution[]>([])
    const [savingGoals, setSavingGoals] = useState<SavingGoalOption[]>([])
    const [institutionLoadState, setInstitutionLoadState] = useState<InstitutionLoadState>("loading")
    const [form, setForm] = useState<FormState>(createEmptyForm)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [isFormVisible, setIsFormVisible] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [message, setMessage] = useState<StatusMessage | null>(null)
    const [search, setSearch] = useState("")
    const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all")

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        setCategoryLoadState("loading")
        setInstitutionLoadState("loading")
        try {
            const userId = await getAuthenticatedUserId()
            const [transactionResult, categoryResult, accountResult, institutionResult, savingGoalResult] = await Promise.all([
                supabase.from("transactions").select(TRANSACTION_SELECT).eq("user_id", userId).order("transaction_date", { ascending: false }),
                supabase.from("categories").select("id, name, type").order("name"),
                supabase.from("accounts").select("id, account_name, account_type, financial_institution_id").eq("user_id", userId).eq("is_active", true).order("account_name"),
                supabase.from("financial_institutions").select("id, name, type").eq("is_active", true).order("name"),
                supabase.from("saving_goals").select("savings_id, goal_name, target_amount").eq("user_id", userId).order("created_at", { ascending: false }),
            ])
            if (transactionResult.error) throw transactionResult.error
            setTransactions((transactionResult.data ?? []) as TransactionRecord[])
            if (categoryResult.error) {
                setCategories([])
                setCategoryLoadState("error")
            } else {
                const categoryRows = (categoryResult.data ?? []).filter((category) => isTransactionType(category.type))
                setCategories(categoryRows)
                setCategoryLoadState(categoryRows.length > 0 ? "ready" : "empty")
            }
            if (accountResult.error) throw accountResult.error
            setAccounts(accountResult.data ?? [])
            if (institutionResult.error) {
                setInstitutions([])
                setInstitutionLoadState("error")
            } else {
                const institutionRows = (institutionResult.data ?? []).filter((institution): institution is FinancialInstitution => isInstitutionType(institution.type))
                setInstitutions(institutionRows)
                setInstitutionLoadState(institutionRows.length > 0 ? "ready" : "empty")
            }
            if (savingGoalResult.error) throw savingGoalResult.error
            setSavingGoals(savingGoalResult.data ?? [])
        } catch (error) {
            setTransactions([])
            setInstitutionLoadState("error")
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to load transactions." })
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        const timeoutId = window.setTimeout(() => void fetchData(), 0)
        return () => window.clearTimeout(timeoutId)
    }, [fetchData])

    const availableCategories = useMemo(() => categories
        .filter((category) => category.type === form.type)
        .sort((first, second) => {
            const firstIsOther = first.name.toLowerCase() === `other ${form.type}`
            const secondIsOther = second.name.toLowerCase() === `other ${form.type}`
            if (firstIsOther !== secondIsOther) return firstIsOther ? 1 : -1
            return first.name.localeCompare(second.name)
        }), [categories, form.type])
    const groupedInstitutions = useMemo(() => institutionGroups.map((group) => ({
        ...group,
        institutions: institutions.filter((institution) => institution.type === group.type),
    })), [institutions])
    const visibleTransactions = useMemo(() => {
        const query = search.trim().toLowerCase()
        return transactions.filter((transaction) => {
            const accountLabel = transaction.type === "transfer"
                ? `${transaction.from_account?.account_name ?? ""} ${transaction.to_account?.account_name ?? ""}`
                : transaction.account?.account_name ?? ""
            const matchesType = typeFilter === "all" || transaction.type === typeFilter
            const matchesSearch = !query || [transaction.transaction_id, transaction.category?.name ?? "", accountLabel, transaction.note ?? ""]
                .some((value) => value.toLowerCase().includes(query))
            return matchesType && matchesSearch
        })
    }, [search, transactions, typeFilter])

    const totals = useMemo(() => transactions.reduce((sum, transaction) => ({
        income: sum.income + (transaction.type === "income" ? Number(transaction.amount) : 0),
        expense: sum.expense + (transaction.type === "expense" ? Number(transaction.amount) : 0),
    }), { income: 0, expense: 0 }), [transactions])

    const closeForm = () => {
        setForm(createEmptyForm())
        setEditingId(null)
        setIsFormVisible(false)
    }

    const openCreateForm = () => {
        const next = createEmptyForm()
        next.categoryId = categories.find((category) => category.type === next.type)?.id ?? ""
        next.accountId = institutions[0]?.id ?? ""
        setForm(next)
        setEditingId(null)
        setMessage(null)
        setIsFormVisible(true)
    }

    const openEditForm = (transaction: TransactionRecord) => {
        const type = isTransactionType(transaction.type) ? transaction.type : "expense"
        const findInstitutionId = (account: TransactionRecord["account"]) => institutions.find((institution) => (
            institution.id === account?.financial_institution_id
            || (institution.name === account?.account_name && toAccountType(institution.type) === account.account_type)
        ))?.id ?? ""
        setForm({
            type,
            categoryId: transaction.category_id ?? "",
            accountId: findInstitutionId(transaction.account),
            savingGoalId: transaction.saving_goal_id === null ? "" : String(transaction.saving_goal_id),
            amount: String(transaction.amount),
            note: transaction.note ?? "",
            transactionDate: toLocalInputDate(transaction.transaction_date),
        })
        setEditingId(transaction.id)
        setMessage(null)
        setIsFormVisible(true)
    }

    const updateForm = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => setForm((current) => ({ ...current, [key]: value }))
    const handleTypeChange = (nextType: TransactionType) => {
        setForm((current) => ({
            ...current,
            type: nextType,
            categoryId: categories.find((category) => category.type === nextType)?.id ?? "",
            accountId: nextType === "transfer" ? "" : current.accountId || institutions[0]?.id || "",
            savingGoalId: nextType === "transfer" ? current.savingGoalId : "",
        }))
    }

    const resolveAccountId = async (institutionId: string, userId: string) => {
        if (!institutionId) return null

        const institution = institutions.find(({ id }) => id === institutionId)
        if (!institution) throw new Error("The selected account is no longer available.")
        const accountType = toAccountType(institution.type)

        const existingAccount = accounts.find((account) => (
            account.financial_institution_id === institution.id
            || (account.account_name === institution.name && account.account_type === accountType)
        ))
        if (existingAccount) return existingAccount.id

        const accountPayload: TablesInsert<"accounts"> = {
            user_id: userId,
            account_name: institution.name,
            account_type: accountType,
            financial_institution_id: institution.id,
            initial_balance: 0,
            is_active: true,
        }
        const { data, error } = await supabase
            .from("accounts")
            .insert(accountPayload)
            .select("id, account_name, account_type, financial_institution_id")
            .single()

        if (error) throw error
        setAccounts((current) => [...current, data])
        return data.id
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const amount = Number(form.amount)
        const date = new Date(form.transactionDate)
        if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) {
            setMessage({ kind: "error", text: "Please enter a valid amount and date." })
            return
        }
        if (form.type === "transfer" && !form.savingGoalId) {
            setMessage({ kind: "error", text: "Please select a saving goal." })
            return
        }

        setIsSubmitting(true)
        setMessage(null)
        try {
            const userId = await getAuthenticatedUserId()
            const existing = editingId ? transactions.find(({ id }) => id === editingId) : undefined
            const accountId = form.type === "transfer" ? null : await resolveAccountId(form.accountId, userId)
            const payload: TablesInsert<"transactions"> = {
                user_id: userId,
                transaction_id: existing?.transaction_id ?? `TXN-${crypto.randomUUID()}`,
                type: form.type,
                amount,
                note: form.note.trim() || null,
                transaction_date: date.toISOString(),
                category_id: form.type === "transfer" ? null : form.categoryId || null,
                account_id: accountId,
                from_account_id: null,
                to_account_id: null,
                saving_goal_id: form.type === "transfer" && form.savingGoalId ? Number(form.savingGoalId) : null,
            }
            const query = editingId
                ? supabase.from("transactions").update(payload satisfies TablesUpdate<"transactions">).eq("id", editingId).eq("user_id", userId)
                : supabase.from("transactions").insert(payload)
            const { data, error } = await query.select("id")
            if (error) throw error
            if (editingId && !data?.length) throw new Error("Transaction not found or access denied.")
            closeForm()
            setMessage({ kind: "success", text: editingId ? "Transaction updated." : "Transaction added." })
            await fetchData()
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
            const { data, error } = await supabase.from("transactions").delete().eq("id", transaction.id).eq("user_id", userId).select("id")
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
        <div className="transactions-page"><main className="transactions-main">
            <section className="page-heading"><div><p className="eyebrow">Overview</p><h1>Transactions</h1><p>Track every peso across your accounts.</p></div><button className="button button-primary" type="button" onClick={openCreateForm}>+ Add transaction</button></section>
            {message && <div className={`notice notice-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
            <section className="summary-grid" aria-label="Transaction summary">
                <article className="summary-card"><span>Total income</span><strong className="income-text">{pesoFormatter.format(totals.income)}</strong></article>
                <article className="summary-card"><span>Total expenses</span><strong className="expense-text">{pesoFormatter.format(totals.expense)}</strong></article>
                <article className="summary-card"><span>Net balance</span><strong>{pesoFormatter.format(totals.income - totals.expense)}</strong></article>
            </section>
            <TransactionCards transactions={visibleTransactions} totalTransactionCount={transactions.length} isLoading={isLoading} deletingId={deletingId} search={search} typeFilter={typeFilter} onSearchChange={setSearch} onTypeFilterChange={setTypeFilter} onEdit={openEditForm} onDelete={handleDelete} />
        </main>
        {isFormVisible && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) closeForm() }}>
            <section className="transaction-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-form-title">
                <div className="modal-heading"><div><p className="eyebrow">{editingId ? "Update record" : "New record"}</p><h2 id="transaction-form-title">{editingId ? "Edit transaction" : "Add transaction"}</h2></div><button className="close-button" type="button" aria-label="Close form" disabled={isSubmitting} onClick={closeForm}>×</button></div>
                <form id="transaction-form" onSubmit={handleSubmit}>
                    <div className="type-picker" role="group" aria-label="Transaction type">{(["income", "expense", "transfer"] as const).map((option) => <button key={option} className={form.type === option ? "selected" : ""} type="button" onClick={() => handleTypeChange(option)}>{option === "transfer" ? "Savings" : option}</button>)}</div>
                    <div className="form-grid">
                        {form.type !== "transfer" && <label><span>Category</span><select value={form.categoryId} onChange={(event) => updateForm("categoryId", event.target.value)} disabled={categoryLoadState !== "ready"} required={categoryLoadState === "ready"}>
                            {categoryLoadState === "loading" && <option value="">Loading categories…</option>}
                            {categoryLoadState === "error" && <option value="">Unable to load categories</option>}
                            {categoryLoadState === "empty" && <option value="">No categories available</option>}
                            {categoryLoadState === "ready" && <option value="">Select category</option>}
                            {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select></label>}
                        {form.type === "transfer" ? <>
                            <label className="full-field"><span>Saving goal</span><select value={form.savingGoalId} onChange={(event) => updateForm("savingGoalId", event.target.value)} required>
                                <option value="">{savingGoals.length ? "Select saving goal" : "No saving goals available"}</option>
                                {savingGoals.map((goal) => <option key={goal.savings_id} value={goal.savings_id}>{goal.goal_name ?? "Saving goal"} — {pesoFormatter.format(Number(goal.target_amount ?? 0))}</option>)}
                            </select></label>
                        </> : <label><span>Account <small>(optional)</small></span><select value={form.accountId} onChange={(event) => updateForm("accountId", event.target.value)} disabled={institutionLoadState !== "ready"}>
                            {institutionLoadState === "loading" && <option value="">Loading accounts…</option>}
                            {institutionLoadState === "error" && <option value="">Unable to load accounts</option>}
                            {institutionLoadState === "empty" && <option value="">No accounts available</option>}
                            {institutionLoadState === "ready" && <option value="">No account</option>}
                            {groupedInstitutions.map((group) => group.institutions.length > 0 && <optgroup key={group.type} label={group.label}>{group.institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</optgroup>)}
                        </select></label>}
                        <label><span>Amount</span><div className="amount-input"><span>₱</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => updateForm("amount", event.target.value)} required /></div></label>
                        <label><span>Date and time</span><input type="datetime-local" value={form.transactionDate} onChange={(event) => updateForm("transactionDate", event.target.value)} required /></label>
                        <label className="full-field"><span>Note <small>(optional)</small></span><textarea rows={3} placeholder="Add a short description" value={form.note} onChange={(event) => updateForm("note", event.target.value)} /></label>
                    </div>
                    <div className="form-actions"><button className="button button-ghost" type="button" disabled={isSubmitting} onClick={closeForm}>Cancel</button><button className="button button-primary" type="submit" disabled={isSubmitting || (form.type === "transfer" && savingGoals.length === 0)}>{isSubmitting ? "Saving…" : editingId ? "Save changes" : "Add transaction"}</button></div>
                </form>
            </section>
        </div>}
        </div>
    )
}

export default Transaction
