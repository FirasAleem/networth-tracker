import test from 'node:test'
import assert from 'node:assert/strict'
import { addMonths, accountValue, installmentState } from './calc.js'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not ~${expected}`)

// 365-day term, so the rate calc is exactly principal × rate.
const deposit = {
  type: 'deposit', amount: 10000, pending: 0, profit_rate: 5,
  start_date: '2026-01-01', maturity_date: '2027-01-01', expected_profit: null
}
const savings = { type: 'savings', amount: 12000, pending: 0, profit_rate: 4.5, expected_profit: null }

test('deposit before maturity counts the principal only, profit shown alongside', () => {
  const v = accountValue(deposit, '2026-06-01')
  assert.equal(v.effective, 10000)
  near(v.expectedProfit, 500) // 10,000 @ 5% over 365 days
  assert.equal(v.matured, false)
  assert.equal(v.daysLeft, 214)
  assert.equal(v.monthlyProfit, null)
})

test('deposit after maturity counts principal + profit and is flagged matured', () => {
  const v = accountValue(deposit, '2027-01-02')
  near(v.effective, 10500)
  assert.equal(v.matured, true)
  assert.equal(v.daysLeft, 0)
})

test('deposit matures on the maturity date itself, not the day before', () => {
  assert.equal(accountValue(deposit, '2027-01-01').matured, true)
  assert.equal(accountValue(deposit, '2026-12-31').matured, false)
})

test('typed expected profit overrides the rate calculation', () => {
  const v = accountValue({ ...deposit, expected_profit: 320 }, '2027-02-01')
  assert.equal(v.expectedProfit, 320)
  assert.equal(v.effective, 10320)
})

test('deposit missing dates: no rate-based profit, never matured', () => {
  const v = accountValue({ ...deposit, start_date: null, maturity_date: null }, '2030-01-01')
  assert.equal(v.expectedProfit, null)
  assert.equal(v.matured, false)
  assert.equal(v.daysLeft, null)
  assert.equal(v.effective, 10000)
})

test('deposit with a maturity but no start: matures without a profit to add', () => {
  const v = accountValue({ ...deposit, start_date: '' }, '2027-02-01')
  assert.equal(v.expectedProfit, null)
  assert.equal(v.matured, true)
  assert.equal(v.effective, 10000)
})

test('savings profit from a yearly rate; only the balance counts', () => {
  const v = accountValue(savings, '2026-06-01')
  near(v.monthlyProfit, 45) // 12,000 @ 4.5% / 12
  near(v.expectedProfit, 540)
  assert.equal(v.effective, 12000)
  assert.equal(v.matured, false)
  assert.equal(v.daysLeft, null)
})

test('savings typed monthly profit overrides the rate', () => {
  const v = accountValue({ ...savings, expected_profit: 30 }, '2026-06-01')
  assert.equal(v.monthlyProfit, 30)
  assert.equal(v.expectedProfit, 360)
  assert.equal(v.effective, 12000)
})

test('empty strings count as unset, like null', () => {
  const v = accountValue({ ...savings, profit_rate: '', expected_profit: '' }, '2026-06-01')
  assert.equal(v.monthlyProfit, null)
  assert.equal(v.expectedProfit, null)
})

test('pending still subtracts', () => {
  const bank = { type: 'bank', amount: 1000, pending: 250 }
  assert.equal(accountValue(bank, '2026-06-01').effective, 750)
  assert.equal(accountValue({ ...bank, pending: -250 }, '2026-06-01').effective, 750)
  assert.equal(accountValue({ ...savings, pending: 500 }, '2026-06-01').effective, 11500)
  // Matured deposit: (10,000 - 500) principal + 500 profit.
  near(accountValue({ ...deposit, pending: 500 }, '2027-02-01').effective, 10000)
})

test('other account types carry no profit fields', () => {
  assert.deepEqual(accountValue({ type: 'bank', amount: 1000, pending: 0 }, '2026-06-01'), {
    effective: 1000, expectedProfit: null, monthlyProfit: null, matured: false, daysLeft: null
  })
})

test('profit-only deposit counts its full expected profit from day one, never the principal', () => {
  const d = { ...deposit, profit_only: 1 }
  const before = accountValue(d, '2026-06-01')
  near(before.effective, 500) // 10,000 @ 5% over 365 days
  assert.equal(before.matured, false) // matured / daysLeft still work as ever
  assert.equal(before.daysLeft, 214)
  const after = accountValue(d, '2027-01-02')
  near(after.effective, 500) // matured: still only the profit
  assert.equal(after.matured, true)
  assert.equal(after.daysLeft, 0)
})

test('profit-only savings counts its expected yearly profit', () => {
  const v = accountValue({ ...savings, profit_only: 1 }, '2026-06-01')
  near(v.effective, 540) // 12,000 @ 4.5%
  near(v.monthlyProfit, 45) // the profit fields are unchanged
  near(v.expectedProfit, 540)
})

test('profit-only with no rate and no typed profit counts nothing', () => {
  assert.equal(accountValue({ ...savings, profit_rate: null, profit_only: 1 }, '2026-06-01').effective, 0)
  assert.equal(accountValue({ ...deposit, profit_rate: null, profit_only: 1 }, '2027-02-01').effective, 0)
})

test('profit-only still subtracts pending', () => {
  near(accountValue({ ...savings, pending: 40, profit_only: 1 }, '2026-06-01').effective, 500)
})

test('profit_only 0 (the DB default) counts the principal as before; the flag is ignored on other types', () => {
  assert.equal(accountValue({ ...savings, profit_only: 0 }, '2026-06-01').effective, 12000)
  assert.equal(accountValue({ ...deposit, profit_only: 0 }, '2026-06-01').effective, 10000)
  assert.equal(accountValue({ type: 'bank', amount: 1000, pending: 0, profit_only: 1 }, '2026-06-01').effective, 1000)
})

test('addMonths keeps the day, clamped to the month end', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29') // leap year
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31')
  assert.equal(addMonths('2026-03-31', 1), '2026-04-30')
  assert.equal(addMonths('2026-05-15', 0), '2026-05-15')
})

test('addMonths rolls over the year', () => {
  assert.equal(addMonths('2026-12-15', 2), '2027-02-15')
  assert.equal(addMonths('2026-11-30', 14), '2028-01-30')
})

test('installmentState mid-plan', () => {
  const s = installmentState({ total: 1200, count: 12, paid: 5, first_due: '2026-01-31', monthly_pct: null })
  near(s.perInstallment, 100)
  near(s.remaining, 700)
  assert.equal(s.paidOff, false)
  assert.equal(s.nextDue, '2026-06-30') // 6th payment: Jan 31 + 5 months, clamped
  // An equal plan has no balloon and exactly `count` payments.
  assert.equal(s.balloon, null)
  assert.equal(s.payments, 12)
  near(s.nextAmount, 100)
})

test('installmentState paid off: exactly nothing remaining, no next due date', () => {
  // 100.01 / 3 × 3 isn't exactly 100.01, so total − paid × each would leave float dust.
  const s = installmentState({ total: 100.01, count: 3, paid: 3, first_due: '2026-01-31' })
  assert.equal(s.remaining, 0)
  assert.equal(s.paidOff, true)
  assert.equal(s.nextDue, null)
  assert.equal(s.nextAmount, null)
  assert.equal(s.payments, 3)
})

test('installmentState without a first_due has no next due date', () => {
  for (const first_due of [null, undefined, '']) {
    const s = installmentState({ total: 900, count: 3, paid: 1, first_due })
    near(s.remaining, 600)
    assert.equal(s.nextDue, null)
  }
})

test('installmentState balloon: the SNB example, 3,000 at 5% × 3', () => {
  const plan = { total: 3000, count: 3, monthly_pct: 5, first_due: '2026-01-15' }
  const s = installmentState({ ...plan, paid: 0 })
  near(s.perInstallment, 150)
  near(s.balloon, 2550)
  assert.equal(s.payments, 4)
  near(s.remaining, 3000)
  near(s.nextAmount, 150)
  assert.equal(s.nextDue, '2026-01-15')

  // Three 5% payments in: only the balloon is left, due the month after the last one.
  const three = installmentState({ ...plan, paid: 3 })
  near(three.remaining, 2550)
  near(three.nextAmount, 2550)
  assert.equal(three.paidOff, false)
  assert.equal(three.nextDue, '2026-04-15') // first_due + 3 months

  // Balloon ticked too: exactly nothing left.
  const four = installmentState({ ...plan, paid: 4 })
  assert.equal(four.remaining, 0)
  assert.equal(four.paidOff, true)
  assert.equal(four.nextDue, null)
  assert.equal(four.nextAmount, null)
})

test('installmentState balloon: 10,000 at 5% × 12 is 500 × 12 then a 4,000 balloon', () => {
  const plan = { total: 10000, count: 12, monthly_pct: 5, first_due: '2026-10-15' }
  const s = installmentState({ ...plan, paid: 5 })
  near(s.perInstallment, 500)
  near(s.balloon, 4000)
  assert.equal(s.payments, 13)
  near(s.remaining, 7500)
  near(s.nextAmount, 500)
  assert.equal(s.nextDue, '2027-03-15')

  const last = installmentState({ ...plan, paid: 12 }) // only the balloon left
  near(last.remaining, 4000)
  near(last.nextAmount, 4000)
  assert.equal(last.nextDue, '2027-10-15')
  assert.equal(last.paidOff, false)

  const done = installmentState({ ...plan, paid: 13 })
  assert.equal(done.remaining, 0)
  assert.equal(done.paidOff, true)
})

test('installmentState balloon: non-round amounts still land on exactly 0 when paid off', () => {
  const s = installmentState({ total: 1234.56, count: 12, monthly_pct: 5, paid: 13, first_due: '2026-01-31' })
  assert.equal(s.remaining, 0)
  near(s.balloon, 1234.56 * 0.4)
})

test('installmentState balloon without a first_due: no next due date, next amount still known', () => {
  const s = installmentState({ total: 3000, count: 3, monthly_pct: 5, paid: 3, first_due: null })
  assert.equal(s.nextDue, null)
  near(s.nextAmount, 2550)
})
