import test from "node:test"
import assert from "node:assert/strict"
import { filterTransactionsByMonth, getAvailableMonths, getTransactionMonth, summarizeTransactions } from "../src/pages/transactionSummary.ts"

const transactions = [
    { transaction_date: "2026-02-28T23:59:59", type: "expense", amount: 50 },
    { transaction_date: "2026-03-01T00:00:00", type: "income", amount: 500 },
    { transaction_date: "2026-03-15T12:00:00", type: "expense", amount: "200" },
    { transaction_date: "2026-03-31T23:59:59", type: "transfer", amount: 100 },
]

test("month filtering uses the displayed local month at the boundary", () => {
    assert.equal(getTransactionMonth(transactions[0].transaction_date), "2026-02")
    assert.equal(getTransactionMonth(transactions[1].transaction_date), "2026-03")
    assert.deepEqual(getAvailableMonths(transactions), ["2026-03", "2026-02"])
    assert.equal(filterTransactionsByMonth(transactions, "2026-03").length, 3)
    assert.equal(filterTransactionsByMonth(transactions, "2026-01").length, 0)
    assert.equal(filterTransactionsByMonth(transactions, "all").length, 4)
})

test("monthly summary counts transfers but excludes them from income and expenses", () => {
    assert.deepEqual(summarizeTransactions(filterTransactionsByMonth(transactions, "2026-03")), {
        count: 3,
        income: 500,
        expense: 200,
    })
    assert.deepEqual(summarizeTransactions([]), { count: 0, income: 0, expense: 0 })
})