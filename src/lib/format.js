// Money: always 2 decimals with thousands separators.
export function fmtMoney(n) {
  return new Intl.NumberFormat('en-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n || 0)
}

// Quantity: whole numbers show no decimals; fractional shares show at most
// 2 decimals (trailing zeros trimmed). Full precision is kept in the DB.
export function fmtQty(n) {
  if (n == null) return '0'
  if (Number.isInteger(n)) return n.toLocaleString('en-SA')
  return new Intl.NumberFormat('en-SA', { maximumFractionDigits: 2 }).format(n)
}
