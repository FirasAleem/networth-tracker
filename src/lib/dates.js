// Local-time dates as YYYY-MM-DD. UTC-based ISO strings are still "yesterday" in
// Riyadh (UTC+3) between midnight and 3am; the en-CA locale formats local dates
// in the same YYYY-MM-DD shape.
export function today() {
  return new Date().toLocaleDateString('en-CA')
}

// 'YYYY-MM-DD' → local Date. new Date(str) would parse it as UTC midnight.
export function toLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 'YYYY-MM-DD' → "12 Mar 2026" (or "12 Mar"). Built day-first by hand because
// the en-SA locale orders a full date month-first ("Mar 12, 2026"); only the
// month name comes from the locale.
export function fmtDate(str, withYear = true) {
  const d = toLocalDate(str)
  const dayMonth = `${d.getDate()} ${d.toLocaleDateString('en-SA', { month: 'short' })}`
  return withYear ? `${dayMonth} ${d.getFullYear()}` : dayMonth
}

export const RANGES = [
  { key: '1D', days: 1 },
  { key: '1W', days: 7 },
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: '6M', days: 180 },
  { key: 'YTD', ytd: true },
  { key: '1Y', days: 365 },
  { key: '3Y', days: 365 * 3 },
  { key: '5Y', days: 365 * 5 },
  { key: 'Max', all: true },
]

export function cutoffFor(range) {
  if (range.all) return null
  const d = new Date()
  if (range.ytd) return `${d.getFullYear()}-01-01`
  d.setDate(d.getDate() - range.days)
  return d.toLocaleDateString('en-CA')
}
