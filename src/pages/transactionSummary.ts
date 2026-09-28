export type SummaryTransaction = {
    transaction_date: string
    type: string
    amount: number | string
}

export function getTransactionMonth(value: string) {
    const date = new Date(value)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function getAvailableMonths(transactions: SummaryTransaction[]) {
    return [...new Set(transactions.map((transaction) => getTransactionMonth(transaction.transaction_date)))].sort().reverse()
}

export function filterTransactionsByMonth<T extends SummaryTransaction>(transactions: T[], month: string): T[] {
    return month === "all"
        ? transactions
        : transactions.filter((transaction) => getTransactionMonth(transaction.transaction_date) === month)
}

export function summarizeTransactions(transactions: SummaryTransaction[]) {
    return transactions.reduce((summary, transaction) => ({
        count: summary.count + 1,
        income: summary.income + (transaction.type === "income" ? Number(transaction.amount) : 0),
        expense: summary.expense + (transaction.type === "expense" ? Number(transaction.amount) : 0),
    }), { count: 0, income: 0, expense: 0 })
}