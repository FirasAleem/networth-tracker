import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCSV, parseDate, csvToTransactions, splitNew } from './csv.js'

test('parseDate: ISO date', () => {
  assert.equal(parseDate('2026-03-25'), '2026-03-25')
  assert.equal(parseDate('2026/03/25'), '2026-03-25')
})

test('parseDate: ISO date followed by a time', () => {
  assert.equal(parseDate('2026-03-25T14:30:00Z'), '2026-03-25')
  assert.equal(parseDate('2026-03-25 14:30'), '2026-03-25')
})

test('parseDate: day-first, 1- or 2-digit day/month, any separator', () => {
  assert.equal(parseDate('5/6/2026'), '2026-06-05')
  assert.equal(parseDate('05-06-2026'), '2026-06-05')
  assert.equal(parseDate('5.6.2026'), '2026-06-05')
})

test('parseDate: second number > 12 means MM/DD/YYYY', () => {
  assert.equal(parseDate('03/25/2026'), '2026-03-25')
})

test('parseDate: impossible dates and garbage are null', () => {
  assert.equal(parseDate('31/02/2026'), null)
  assert.equal(parseDate('29/02/2025'), null)
  assert.equal(parseDate('garbage'), null)
  assert.equal(parseDate(''), null)
  assert.equal(parseDate(undefined), null)
})

test('csvToTransactions: skips bad-date rows (counted), derives type from amount sign', () => {
  const rows = parseCSV([
    'Date,Amount,Description',
    '2026-03-25,-12.50,Coffee',
    '5/6/2026,1000,Salary',
    'not a date,-3,Mystery',
    ',-4,No date',
    '2026-03-26,0,Zero amount'
  ].join('\n'))
  const { txns, invalid } = csvToTransactions(rows)
  assert.equal(invalid, 2) // zero-amount rows are skipped but not counted as invalid
  assert.deepEqual(txns.map(t => [t.date, t.amount, t.type, t.description]), [
    ['2026-03-25', 12.5, 'expense', 'Coffee'],
    ['2026-06-05', 1000, 'income', 'Salary']
  ])
})

test('csvToTransactions: no date/amount column yields nothing', () => {
  assert.deepEqual(csvToTransactions(parseCSV('foo,bar\n1,2')), { txns: [], invalid: 0 })
})

const coffee = { date: '2026-03-25', type: 'expense', amount: 12.5, description: 'Coffee' }
const salary = { date: '2026-03-31', type: 'income', amount: 1000, description: 'Salary' }

test('splitNew: re-importing the same rows imports nothing', () => {
  const { fresh, skipped } = splitNew([coffee, salary], [{ ...coffee }, { ...salary }])
  assert.equal(fresh.length, 0)
  assert.equal(skipped.length, 2)
})

test('splitNew: two identical rows in the file, one in the DB, imports one', () => {
  const { fresh, skipped } = splitNew([coffee], [{ ...coffee }, { ...coffee }])
  assert.equal(fresh.length, 1)
  assert.equal(skipped.length, 1)
})

test('splitNew: identical rows all import when the DB has none', () => {
  const { fresh, skipped } = splitNew([], [{ ...coffee }, { ...coffee }])
  assert.equal(fresh.length, 2)
  assert.equal(skipped.length, 0)
})
