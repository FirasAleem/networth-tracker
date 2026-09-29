// Pure valuation math for cash accounts and installment plans — no DB access.
// Dates are 'YYYY-MM-DD' strings; sql.js hands back null for NULL columns.

const DAY = 86_400_000

// null / undefined / '' → null, otherwise a number.
const num = v => (v == null || v === '' ? null : Number(v))

// Whole days from date a to date b. Both parse as UTC midnight, so DST can't skew it.
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

export function riyadhToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
}

// Same day-of-month n months later, clamped to that month's last day (Jan 31 + 1 → Feb 28).
export function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m + n, 0)).getUTCDate() // day 0 of the next month
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

// What a cash_accounts row is worth today, in the account's own currency. Only
// `effective` feeds net worth; the profit fields are for display. Savings: the
// balance counts and profit shows up once you update it. Deposits: principal
// until maturity, then principal + profit.
export function accountValue(c, today) {
  const base = c.amount - Math.abs(c.pending || 0)
  const rate = num(c.profit_rate)
  const typed = num(c.expected_profit)
  const none = { effective: base, expectedProfit: null, monthlyProfit: null, matured: false, daysLeft: null }

  if (c.type === 'savings') {
    // Typed amount is per month; expectedProfit is the yearly figure.
    const monthlyProfit = typed ?? (rate == null ? null : c.amount * rate / 100 / 12)
    return { ...none, monthlyProfit, expectedProfit: monthlyProfit == null ? null : monthlyProfit * 12 }
  }

  if (c.type === 'deposit') {
    const { start_date: start, maturity_date: end } = c
    // ponytail: dates aren't cross-checked, so a maturity before the start gives a negative profit.
    const expectedProfit = typed ?? (rate != null && start && end ? c.amount * rate / 100 * days(start, end) / 365 : null)
    const matured = !!end && today >= end
    return {
      ...none,
      expectedProfit,
      matured,
      daysLeft: end ? Math.max(0, days(today, end)) : null,
      effective: base + (matured ? expectedProfit || 0 : 0)
    }
  }

  return none
}

// A credit-card installment plan: `total` split into `count` equal monthly payments, `paid` ticked off.
export function installmentState(p) {
  const perInstallment = p.total / p.count
  const paidOff = p.paid >= p.count
  return {
    perInstallment,
    remaining: perInstallment * (p.count - p.paid), // exactly 0 once fully paid
    paidOff,
    nextDue: !paidOff && p.first_due ? addMonths(p.first_due, p.paid) : null
  }
}
