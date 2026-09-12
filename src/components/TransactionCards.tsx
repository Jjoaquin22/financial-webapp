import TransactionTable, { type TransactionTableItem, type TransactionType } from "./TransactionTable"

export type TransactionCardType = TransactionType
export type TransactionCardItem = TransactionTableItem

interface TransactionCardsProps<T extends TransactionCardItem> {
    transactions: T[]
    totalTransactionCount: number
    isLoading: boolean
    deletingId: string | null
    search: string
    typeFilter: "all" | TransactionCardType
    onSearchChange: (value: string) => void
    onTypeFilterChange: (value: "all" | TransactionCardType) => void
    onEdit: (transaction: T) => void
    onDelete: (transaction: T) => void | Promise<void>
}

function TransactionCards<T extends TransactionCardItem>({
    transactions, totalTransactionCount, isLoading, deletingId, search, typeFilter,
    onSearchChange, onTypeFilterChange, onEdit, onDelete,
}: TransactionCardsProps<T>) {
    return (
        <section className="transactions-card">
            <div className="toolbar">
                <div className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Search transactions" type="search" placeholder="Search ID, category, wallet, or note" value={search} onChange={(event) => onSearchChange(event.target.value)} /></div>
                <label className="filter-field"><span>Type</span><select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value as "all" | TransactionCardType)}>
                    <option value="all">All transactions</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option>
                </select></label>
            </div>
            <TransactionTable
                transactions={transactions}
                totalTransactionCount={totalTransactionCount}
                isLoading={isLoading}
                deletingId={deletingId}
                onEdit={onEdit}
                onDelete={onDelete}
            />
        </section>
    )
}

export default TransactionCards
