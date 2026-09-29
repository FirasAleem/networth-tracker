// Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas,
// escaped quotes ("") and newlines inside quotes. Returns array of rows.
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

// Parse a CSV date cell to YYYY-MM-DD, or null. Accepts YYYY-MM-DD / YYYY/MM/DD
// and day-first D/M/YYYY, D-M-YYYY, D.M.YYYY (month-first when the second number
// is > 12), each optionally followed by a time. Impossible dates (31/02) → null.
export function parseDate(s) {
  const t = String(s ?? '').trim().replace(/[T\s]+\d{1,2}:\d{2}.*$/, '')
  let m, y, mo, d
  if ((m = t.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/))) [, y, mo, d] = m
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [, d, mo, y] = m
    if (+mo > 12) [d, mo] = [mo, d]
  } else return null
  // Round-trip through Date.UTC: 31/02 would roll over into March.
  const dt = new Date(Date.UTC(+y, mo - 1, +d))
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== +d) return null
  return dt.toISOString().slice(0, 10)
}

// Map a parsed CSV (Dollarbird or generic) into transaction rows.
// Returns { txns: [{ date, category, description, amount, type }], invalid },
// where invalid counts rows skipped for a missing/unparseable date.
export function csvToTransactions(rows) {
  if (rows.length < 2) return { txns: [], invalid: 0 }
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const dateIdx = headers.findIndex(h => h.includes('date'))
  const amountIdx = headers.findIndex(h => h.includes('amount') || h === 'value')
  const catIdx = headers.findIndex(h => h.includes('categ'))
  const labelIdx = headers.findIndex(h => h.includes('label'))
  const descIdx = headers.findIndex(h => h.includes('desc'))
  const typeIdx = headers.findIndex(h => h === 'type')
  if (dateIdx === -1 || amountIdx === -1) return { txns: [], invalid: 0 }

  const txns = []
  let invalid = 0
  for (const cols of rows.slice(1)) {
    const amount = parseFloat((cols[amountIdx] || '').replace(/[^0-9.-]/g, ''))
    if (isNaN(amount) || amount === 0) continue

    const date = parseDate(cols[dateIdx])
    if (!date) { invalid++; continue }

    const label = labelIdx >= 0 ? (cols[labelIdx] || '') : ''
    const desc = descIdx >= 0 ? (cols[descIdx] || '') : ''
    const description = [label, desc].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim()

    txns.push({
      date,
      category: catIdx >= 0 ? (cols[catIdx] || '') : '',
      description,
      amount: Math.abs(amount),
      type: typeIdx >= 0 ? cols[typeIdx] : (amount < 0 ? 'expense' : 'income')
    })
  }
  return { txns, invalid }
}

// Split incoming rows into new vs already-present. Multiset difference on
// date|type|amount|description: each existing row absorbs at most one identical
// incoming row, so a re-import adds nothing but genuine repeats within a file survive.
export function splitNew(existing, txns) {
  const key = t => [t.date, t.type, t.amount, t.description].join('|')
  const have = new Map()
  for (const e of existing) have.set(key(e), (have.get(key(e)) || 0) + 1)
  const fresh = []
  const skipped = []
  for (const t of txns) {
    const k = key(t)
    if (have.get(k) > 0) {
      have.set(k, have.get(k) - 1)
      skipped.push(t)
    } else fresh.push(t)
  }
  return { fresh, skipped }
}
