// Local-time dates as YYYY-MM-DD. UTC-based ISO strings are still "yesterday" in
// Riyadh (UTC+3) between midnight and 3am; the en-CA locale formats local dates
// in the same YYYY-MM-DD shape.
export function today() {
  return new Date().toLocaleDateString('en-CA')
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
