export type TransactionType = "income" | "expense" | "transfer"

export interface TransactionTableItem {
    id: string
    transaction_id: string
    type: TransactionType
    category: string
    account_wallet: string
    amount: number
    note: string | null
    transaction_date: string
}

interface TransactionTableProps<T extends TransactionTableItem> {
    transactions: T[]
    totalTransactionCount: number
    isLoading: boolean
    deletingId: string | null
    onEdit: (transaction: T) => void
    onDelete: (transaction: T) => void | Promise<void>
}

const pesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const dateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" })

function formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function TransactionTable<T extends TransactionTableItem>({
    transactions,
    totalTransactionCount,
    isLoading,
    deletingId,
    onEdit,
    onDelete,
}: TransactionTableProps<T>) {
    return (
        <div className="table-wrap">
            <table>
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Account</th><th>Note</th><th className="amount-cell">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                    {isLoading ? <tr><td className="empty-state" colSpan={7}>Loading transactions…</td></tr>
                        : transactions.length === 0 ? <tr><td className="empty-state" colSpan={7}>{totalTransactionCount ? "No transactions match your search." : "No transactions yet. Add your first one to get started."}</td></tr>
                        : transactions.map((transaction) => <tr key={transaction.id}>
                            <td><span className="date-primary">{formatDate(transaction.transaction_date)}</span><small>{transaction.transaction_id}</small></td>
                            <td><span className={`type-badge type-${transaction.type}`}>{transaction.type}</span></td>
                            <td>{transaction.category}</td><td>{transaction.account_wallet}</td><td className="note-cell">{transaction.note || "—"}</td>
                            <td className={`amount-cell ${transaction.type === "income" ? "income-text" : transaction.type === "expense" ? "expense-text" : ""}`}>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}{pesoFormatter.format(Number(transaction.amount))}</td>
                            <td><div className="row-actions"><button type="button" onClick={() => onEdit(transaction)}>Edit</button><button className="delete-action" type="button" disabled={deletingId !== null} onClick={() => void onDelete(transaction)}>{deletingId === transaction.id ? "Deleting…" : "Delete"}</button></div></td>
                        </tr>)}
                </tbody>
            </table>
        </div>
    )
}

export default TransactionTable
