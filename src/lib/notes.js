// Rebuilds a hand-written notes format from live data, e.g.:
//
//   x=27
//   y=10000
//   z=20000-5000
//   s=100.00
//   a=200.00
//
//
//   100x+y+z+3.75(s+a) = ...
//
// SAR stock holdings become priced terms (x), SAR cash accounts become plain
// vars (y, z…), and USD accounts are grouped under the 3.75 conversion (s, a…),
// with variable letters mnemonic to the account name where possible.

const plain = (n) => {
  const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100
  return String(r)
}
const commas = (n) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

export function buildNotesText(summary) {
  if (!summary) return ''
  const rate = summary.usdToSar || 3.75
  const used = new Set()
  const pick = (preferred, pool = []) => {
    for (const c of [preferred, ...pool]) {
      const l = (c || '').toLowerCase()
      if (/^[a-z]$/.test(l) && !used.has(l)) { used.add(l); return l }
    }
    for (let i = 0; i < 26; i++) {
      const l = String.fromCharCode(97 + i)
      if (!used.has(l)) { used.add(l); return l }
    }
    return '?'
  }

  const defs = []
  const sarTerms = []

  // SAR stock holdings → priced terms (x, w, v…)
  for (const h of (summary.holdings || []).filter(h => h.currency === 'SAR')) {
    const v = pick('x', ['w', 'v', 'u', 't'])
    defs.push(`${v}=${plain(h.currentPrice)}`)
    sarTerms.push(`${plain(h.quantity)}${v}`)
  }

  // SAR cash accounts → plain vars (y, z…); pending shown as a subtraction
  for (const c of (summary.cash || []).filter(c => c.currency === 'SAR')) {
    const v = pick('y', ['z', 'p', 'q', 'r'])
    const pend = Math.abs(c.pending || 0)
    defs.push(pend ? `${v}=${plain(c.amount)}-${plain(pend)}` : `${v}=${plain(c.amount)}`)
    sarTerms.push(v)
  }

  // USD sources grouped by account → converted at `rate` (s, a…)
  const usdGroups = {}
  for (const h of (summary.holdings || []).filter(h => h.currency === 'USD')) {
    const k = h.account || 'USD'
    usdGroups[k] = (usdGroups[k] || 0) + h.marketValue
  }
  for (const c of (summary.cash || []).filter(c => c.currency === 'USD')) {
    const k = c.name || 'USD'
    usdGroups[k] = (usdGroups[k] || 0) + (c.amount - Math.abs(c.pending || 0))
  }
  const usdVars = []
  for (const [acct, total] of Object.entries(usdGroups)) {
    const v = pick(acct[0])
    defs.push(`${v}=${plain(total)}`)
    usdVars.push(v)
  }

  let formula = sarTerms.join('+')
  if (usdVars.length) {
    formula += `${sarTerms.length ? '+' : ''}${plain(rate)}(${usdVars.join('+')})`
  }
  formula += ` = ${commas(summary.total)}`

  return `${defs.join('\n')}\n\n\n${formula}`
}

// Copy that also works over plain http on a LAN IP, where the async Clipboard
// API is blocked (non-secure context) — falls back to execCommand.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
