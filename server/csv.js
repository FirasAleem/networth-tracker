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

// Map a parsed CSV (Dollarbird or generic) into transaction rows.
// Returns [{ date, category, description, amount, type }].
export function csvToTransactions(rows) {
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const dateIdx = headers.findIndex(h => h.includes('date'))
  const amountIdx = headers.findIndex(h => h.includes('amount') || h === 'value')
  const catIdx = headers.findIndex(h => h.includes('categ'))
  const labelIdx = headers.findIndex(h => h.includes('label'))
  const descIdx = headers.findIndex(h => h.includes('desc'))
  const typeIdx = headers.findIndex(h => h === 'type')
  if (dateIdx === -1 || amountIdx === -1) return []

  const out = []
  for (const cols of rows.slice(1)) {
    const amount = parseFloat((cols[amountIdx] || '').replace(/[^0-9.-]/g, ''))
    if (isNaN(amount) || amount === 0) continue

    let date = (cols[dateIdx] || '').trim()
    const m = date.match(/(\d{4})[/-](\d{2})[/-](\d{2})/)
    if (m) date = `${m[1]}-${m[2]}-${m[3]}`
    if (!date) date = new Date().toISOString().split('T')[0]

    const label = labelIdx >= 0 ? (cols[labelIdx] || '') : ''
    const desc = descIdx >= 0 ? (cols[descIdx] || '') : ''
    const description = [label, desc].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim()

    out.push({
      date,
      category: catIdx >= 0 ? (cols[catIdx] || '') : '',
      description,
      amount: Math.abs(amount),
      type: typeIdx >= 0 ? cols[typeIdx] : (amount < 0 ? 'expense' : 'income')
    })
  }
  return out
}
