import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { initDb, all, get, run } from './db.js'
import { parseCSV, parseDate, csvToTransactions, splitNew } from './csv.js'
import { riyadhToday, accountValue, installmentState } from './calc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 2307
const upload = multer({ storage: multer.memoryStorage() })

app.use(express.json())

const USD_TO_SAR = 3.75

// ── Holdings ──

app.get('/api/holdings', (req, res) => {
  res.json(all('SELECT * FROM holdings ORDER BY account, ticker'))
})

app.post('/api/holdings', (req, res) => {
  const { ticker, name, quantity, cost_price, purchase_date, account, currency } = req.body
  const result = run(
    'INSERT INTO holdings (ticker, name, quantity, cost_price, purchase_date, account, currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ticker, name || '', quantity, cost_price, purchase_date || null, account || 'Default', currency || 'USD']
  )
  res.json(get('SELECT * FROM holdings WHERE id = ?', [result.lastInsertRowid]))
})

app.put('/api/holdings/:id', (req, res) => {
  const { ticker, name, quantity, cost_price, purchase_date, account, currency } = req.body
  run(
    `UPDATE holdings SET ticker=?, name=?, quantity=?, cost_price=?, purchase_date=?, account=?, currency=?, updated_at=datetime('now') WHERE id=?`,
    [ticker, name || '', quantity, cost_price, purchase_date || null, account || 'Default', currency || 'USD', req.params.id]
  )
  // A holding with lots keeps its lot-derived quantity/cost/date; the other fields stay editable.
  recomputeHolding(req.params.id)
  res.json(get('SELECT * FROM holdings WHERE id = ?', [req.params.id]))
})

app.delete('/api/holdings/:id', (req, res) => {
  run('DELETE FROM lots WHERE holding_id = ?', [req.params.id])
  run('DELETE FROM holdings WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// ── Purchase lots ──

// Recompute a holding's aggregate (qty, weighted-avg cost, earliest date) from
// its lots. No-op if the holding has no lots, so manually-aggregated holdings
// keep working until you start adding lots to them.
function recomputeHolding(holdingId) {
  const lots = all('SELECT * FROM lots WHERE holding_id = ?', [holdingId])
  if (lots.length === 0) return
  const qty = lots.reduce((s, l) => s + l.quantity, 0)
  const totalCost = lots.reduce((s, l) => s + l.quantity * l.cost_price, 0)
  const avg = qty ? totalCost / qty : 0
  const dates = lots.map(l => l.purchase_date).filter(Boolean).sort()
  run(`UPDATE holdings SET quantity=?, cost_price=?, purchase_date=?, updated_at=datetime('now') WHERE id=?`,
      [qty, avg, dates[0] || null, holdingId])
}

app.get('/api/holdings/:id/lots', (req, res) => {
  res.json(all('SELECT * FROM lots WHERE holding_id = ? ORDER BY purchase_date, id', [req.params.id]))
})

app.post('/api/holdings/:id/lots', (req, res) => {
  const id = req.params.id
  const h = get('SELECT * FROM holdings WHERE id = ?', [id])
  if (!h) return res.status(404).json({ error: 'No such holding' })
  const quantity = Number(req.body.quantity)
  const cost_price = Number(req.body.cost_price) || 0
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be > 0' })
  // First lot for this holding? Seed one from the existing aggregate so the
  // pre-lot quantity/cost isn't lost.
  if (all('SELECT id FROM lots WHERE holding_id = ?', [id]).length === 0) {
    run('INSERT INTO lots (holding_id, quantity, cost_price, purchase_date) VALUES (?, ?, ?, ?)',
        [id, h.quantity, h.cost_price, h.purchase_date])
  }
  run('INSERT INTO lots (holding_id, quantity, cost_price, purchase_date) VALUES (?, ?, ?, ?)',
      [id, quantity, cost_price, req.body.purchase_date || null])
  recomputeHolding(id)
  res.json(all('SELECT * FROM lots WHERE holding_id = ? ORDER BY purchase_date, id', [id]))
})

app.delete('/api/lots/:id', (req, res) => {
  const lot = get('SELECT * FROM lots WHERE id = ?', [req.params.id])
  if (!lot) return res.status(404).json({ error: 'No such lot' })
  // recomputeHolding no-ops on zero lots, so the holding would keep the deleted lot's quantity.
  if (get('SELECT COUNT(*) AS c FROM lots WHERE holding_id = ?', [lot.holding_id]).c === 1) {
    return res.status(400).json({ error: "Can't delete a holding's last lot — edit or delete the holding instead" })
  }
  run('DELETE FROM lots WHERE id = ?', [req.params.id])
  recomputeHolding(lot.holding_id)
  res.json(all('SELECT * FROM lots WHERE holding_id = ? ORDER BY purchase_date, id', [lot.holding_id]))
})

// ── Cash Accounts ──

const CASH_TYPES = ['bank', 'physical', 'other', 'savings', 'deposit']
const CURRENCIES = ['SAR', 'USD'] // anything else would silently be valued as SAR
const PAYOUTS = ['monthly', 'daily']

const blank = v => v == null || String(v).trim() === ''
const numOrNull = v => (blank(v) || !Number.isFinite(Number(v)) ? null : Number(v))
// Shared by cash + installments: a typed date must be readable (parseDate normalises it to YYYY-MM-DD); blank is fine.
const badDate = v => !blank(v) && parseDate(v) === null

// Validate a cash account body → { error } or the SQL params in column order. Only the known keys
// are read, so the frontend can PUT a whole summary row back (computed fields and all).
function cashParams(b) {
  const name = String(b.name ?? '').trim()
  if (!name) return { error: 'name is required' }
  const type = b.type || 'bank'
  if (!CASH_TYPES.includes(type)) return { error: `type must be one of: ${CASH_TYPES.join(', ')}` }
  const currency = blank(b.currency) ? 'SAR' : b.currency
  if (!CURRENCIES.includes(currency)) return { error: `currency must be one of: ${CURRENCIES.join(', ')}` }
  if (!blank(b.payout) && !PAYOUTS.includes(b.payout)) return { error: `payout must be one of: ${PAYOUTS.join(', ')}` }
  if (badDate(b.start_date) || badDate(b.maturity_date)) {
    return { error: 'start_date and maturity_date must be dates (YYYY-MM-DD) or empty' }
  }
  // "Not my money": only meaningful on savings/deposits, so it's stored 0 on anything else.
  const profitOnly = [true, 1, '1'].includes(b.profit_only) && ['savings', 'deposit'].includes(type)
  return {
    params: [
      name, Number(b.amount) || 0, Number(b.pending) || 0, type, currency,
      numOrNull(b.profit_rate), blank(b.payout) ? null : b.payout,
      parseDate(b.start_date), parseDate(b.maturity_date), numOrNull(b.expected_profit), profitOnly ? 1 : 0
    ]
  }
}

app.get('/api/cash', (req, res) => {
  res.json(all('SELECT * FROM cash_accounts ORDER BY id'))
})

app.post('/api/cash', (req, res) => {
  const { error, params } = cashParams(req.body)
  if (error) return res.status(400).json({ error })
  const result = run(
    `INSERT INTO cash_accounts (name, amount, pending, type, currency, profit_rate, payout, start_date, maturity_date,
       expected_profit, profit_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  )
  res.json(get('SELECT * FROM cash_accounts WHERE id = ?', [result.lastInsertRowid]))
})

app.put('/api/cash/:id', (req, res) => {
  const { error, params } = cashParams(req.body)
  if (error) return res.status(400).json({ error })
  run(
    `UPDATE cash_accounts SET name=?, amount=?, pending=?, type=?, currency=?, profit_rate=?, payout=?, start_date=?, maturity_date=?,
       expected_profit=?, profit_only=?, updated_at=datetime('now') WHERE id=?`,
    [...params, req.params.id]
  )
  res.json(get('SELECT * FROM cash_accounts WHERE id = ?', [req.params.id]))
})

app.delete('/api/cash/:id', (req, res) => {
  run('DELETE FROM cash_accounts WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// ── Installments ──
// No list endpoint: the plans ride along in /api/summary.

// Validate a plan body → { error } or the SQL params in column order. A blank `monthly_pct` is an
// equal split; a set one makes a balloon plan (that % of total a month for `count` months, then the
// rest as a balloon), which has one more payment to tick off.
function installmentParams(b) {
  const name = String(b.name ?? '').trim()
  const total = Number(b.total)
  const count = Number(b.count)
  const pct = blank(b.monthly_pct) ? null : Number(b.monthly_pct)
  const paid = Number(b.paid)
  if (!name) return { error: 'name is required' }
  if (!Number.isFinite(total) || total <= 0) return { error: 'total must be a number greater than 0' }
  if (!Number.isInteger(count) || count < 1) return { error: 'count must be a whole number, 1 or more' }
  if (pct !== null && (!Number.isFinite(pct) || pct <= 0)) {
    return { error: 'monthly_pct must be a number greater than 0, or empty for an equal split' }
  }
  if (pct !== null && pct * count >= 100) {
    return { error: 'monthly % × months must be under 100 — use an equal plan to split the whole amount' }
  }
  const payments = count + (pct === null ? 0 : 1) // the balloon is the last payment
  if (!Number.isInteger(paid) || paid < 0 || paid > payments) return { error: `paid must be a whole number from 0 to ${payments}` }
  if (badDate(b.first_due)) return { error: 'first_due must be a date (YYYY-MM-DD) or empty' }
  return { params: [name, total, count, paid, parseDate(b.first_due), pct] }
}

app.post('/api/installments', (req, res) => {
  const { error, params } = installmentParams({ paid: 0, ...req.body })
  if (error) return res.status(400).json({ error })
  const result = run('INSERT INTO installments (name, total, count, paid, first_due, monthly_pct) VALUES (?, ?, ?, ?, ?, ?)', params)
  res.json(get('SELECT * FROM installments WHERE id = ?', [result.lastInsertRowid]))
})

app.put('/api/installments/:id', (req, res) => {
  const plan = get('SELECT id FROM installments WHERE id = ?', [req.params.id])
  if (!plan) return res.status(404).json({ error: 'No such installment plan' })
  const { error, params } = installmentParams(req.body)
  if (error) return res.status(400).json({ error })
  run('UPDATE installments SET name=?, total=?, count=?, paid=?, first_due=?, monthly_pct=? WHERE id=?', [...params, req.params.id])
  res.json(get('SELECT * FROM installments WHERE id = ?', [req.params.id]))
})

app.delete('/api/installments/:id', (req, res) => {
  run('DELETE FROM installments WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// ── Live Prices ──

// Per-ticker cache: { [ticker]: { value, ts } }. While a ticker's market is
// open we refresh every OPEN_TTL (live); while closed we back off to CLOSED_TTL
// so we're not hammering Yahoo overnight or all weekend when nothing moves.
let priceCache = {}
const OPEN_TTL = 60_000           // 1 min during market hours
const CLOSED_TTL = 6 * 3_600_000  // 6 h when the market is shut

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }

// Read the current wall-clock weekday/time in a given IANA timezone.
function zonedNow(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date())
  const get = t => parts.find(p => p.type === t)?.value
  const dayIdx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')]
  let hour = parseInt(get('hour'), 10)
  if (hour === 24) hour = 0 // some ICU builds emit "24" at midnight
  return { day: dayIdx, minutes: hour * 60 + parseInt(get('minute'), 10) }
}

// Is the market for this ticker currently open? Tadawul for .SR, US otherwise.
function isMarketOpen(ticker) {
  if (/\.SR$/i.test(ticker)) {
    const { day, minutes } = zonedNow('Asia/Riyadh')
    return day >= 0 && day <= 4 && minutes >= 600 && minutes < 900 // Sun–Thu 10:00–15:00
  }
  const { day, minutes } = zonedNow('America/New_York')
  return day >= 1 && day <= 5 && minutes >= 570 && minutes < 960 // Mon–Fri 09:30–16:00
}

function ttlFor(ticker) {
  return isMarketOpen(ticker) ? OPEN_TTL : CLOSED_TTL
}

async function fetchSingleQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`
  const res = await fetch(url, { headers: YF_HEADERS })
  if (!res.ok) return null
  const data = await res.json()
  const result = data.chart?.result?.[0]
  if (!result) return null
  const meta = result.meta
  const closes = result.indicators?.quote?.[0]?.close || []
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : meta.chartPreviousClose
  const price = meta.regularMarketPrice
  const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0
  return {
    price,
    change,
    name: meta.shortName || meta.longName || ticker,
    currency: meta.currency || 'USD',
    previousClose: prevClose
  }
}

async function fetchPrices(tickers) {
  const now = Date.now()
  const stale = tickers.filter(t => {
    const c = priceCache[t]
    return !c || now - c.ts > ttlFor(t)
  })

  if (stale.length > 0) {
    const results = await Promise.allSettled(stale.map(fetchSingleQuote))
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        priceCache[stale[i]] = { value: r.value, ts: now }
      }
    })
  }

  const prices = {}
  tickers.forEach(t => { prices[t] = priceCache[t]?.value || null })
  return prices
}

app.get('/api/prices', async (req, res) => {
  const tickers = (req.query.tickers || '').split(',').filter(Boolean)
  if (tickers.length === 0) return res.json({})
  res.json(await fetchPrices(tickers))
})

// ── Historical price data ──

app.get('/api/price-history/:ticker', async (req, res) => {
  try {
    const from = req.query.from || '2024-01-01'
    const p1 = Math.floor(new Date(from).getTime() / 1000)
    const p2 = Math.floor(Date.now() / 1000)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(req.params.ticker)}?period1=${p1}&period2=${p2}&interval=1d`
    const r = await fetch(url, { headers: YF_HEADERS })
    const json = await r.json()
    const result = json.chart?.result?.[0]
    if (!result) return res.json([])
    const timestamps = result.timestamp || []
    const closes = result.indicators?.quote?.[0]?.close || []
    const data = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i]
    })).filter(d => d.close != null)
    res.json(data)
  } catch (e) {
    res.json([])
  }
})

// ── Snapshots ──

app.get('/api/snapshots', (req, res) => {
  const rows = all('SELECT * FROM snapshots ORDER BY date ASC')
  const parse = (b) => { try { return b ? JSON.parse(b) : null } catch { return null } }
  res.json(rows.map(r => ({ ...r, breakdown: parse(r.breakdown) })))
})

// ── Transactions ──

app.get('/api/transactions', (req, res) => {
  const { account } = req.query
  if (account && account !== 'all') {
    return res.json(all('SELECT * FROM transactions WHERE account = ? ORDER BY date DESC', [account]))
  }
  res.json(all('SELECT * FROM transactions ORDER BY date DESC'))
})

// Distinct account names that have transactions (for the filter toggle).
app.get('/api/transactions/accounts', (req, res) => {
  const rows = all("SELECT DISTINCT account FROM transactions WHERE account != '' ORDER BY account")
  res.json(rows.map(r => r.account))
})

// Cumulative balance over time, built from the transaction history.
// Returns [{ date, balance }] — a running net of income minus expenses.
app.get('/api/history', (req, res) => {
  const { account } = req.query
  const rows = (account && account !== 'all')
    ? all('SELECT date, amount, type FROM transactions WHERE account = ? ORDER BY date ASC', [account])
    : all('SELECT date, amount, type FROM transactions ORDER BY date ASC')

  const byDate = new Map()
  let running = 0
  for (const r of rows) {
    running += r.type === 'income' ? r.amount : -r.amount
    byDate.set(r.date, running) // last write per date wins → end-of-day balance
  }
  res.json([...byDate.entries()].map(([date, balance]) => ({ date, balance })))
})

app.post('/api/transactions', (req, res) => {
  const { date, category, description, amount, type, account } = req.body
  const result = run(
    'INSERT INTO transactions (date, category, description, amount, type, account) VALUES (?, ?, ?, ?, ?, ?)',
    [date, category || '', description || '', amount, type || 'expense', account || '']
  )
  res.json(get('SELECT * FROM transactions WHERE id = ?', [result.lastInsertRowid]))
})

app.post('/api/transactions/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' })
  const account = req.body.account || ''
  const rows = parseCSV(req.file.buffer.toString('utf-8'))
  const { txns, invalid } = csvToTransactions(rows)
  if (txns.length === 0) {
    return res.status(400).json({
      error: invalid
        ? `No rows with a readable date (${invalid} skipped) — dates must be YYYY-MM-DD or DD/MM/YYYY`
        : 'CSV must have a date and a value/amount column'
    })
  }
  const existing = all('SELECT date, type, amount, description FROM transactions WHERE account = ?', [account])
  const { fresh, skipped } = splitNew(existing, txns)
  for (const t of fresh) {
    run(
      'INSERT INTO transactions (date, category, description, amount, type, account) VALUES (?, ?, ?, ?, ?, ?)',
      [t.date, t.category, t.description, t.amount, t.type, account]
    )
  }
  res.json({ imported: fresh.length, skipped: skipped.length, invalid })
})

app.get('/api/transactions/export', (req, res) => {
  const rows = all('SELECT * FROM transactions ORDER BY date DESC')
  const header = 'date,account,category,description,amount,type'
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [header, ...rows.map(r =>
    [r.date, r.account, r.category, r.description, r.amount, r.type].map(esc).join(',')
  )].join('\n')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv')
  res.send(csv)
})

app.delete('/api/transactions/:id', (req, res) => {
  run('DELETE FROM transactions WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// ── Net Worth Summary ──

async function computeSummary() {
  const holdings = all('SELECT h.*, (SELECT COUNT(*) FROM lots l WHERE l.holding_id = h.id) AS lot_count FROM holdings h')
  const cash = all('SELECT * FROM cash_accounts')
  const plans = all('SELECT * FROM installments')

  const tickers = [...new Set(holdings.map(h => h.ticker))]
  const prices = tickers.length > 0 ? await fetchPrices(tickers) : {}

  // Effective cash = balance minus any pending amounts (e.g. money owed to a friend); a matured
  // deposit also counts its profit, and a profit-only account counts only that. See accountValue.
  const today = riyadhToday()
  const cashDetails = cash.map(c => {
    const v = accountValue(c, today)
    const effectiveSAR = c.currency === 'USD' ? v.effective * USD_TO_SAR : v.effective
    return { ...c, ...v, effectiveSAR }
  })
  const sumSAR = rows => rows.reduce((sum, c) => sum + c.effectiveSAR, 0)
  const isSavings = c => c.type === 'savings' || c.type === 'deposit'
  const cashTotal = sumSAR(cashDetails.filter(c => !isSavings(c)))
  const savingsTotal = sumSAR(cashDetails.filter(isSavings))

  // Unpaid remainder of each installment plan (SAR only) is a liability. Open plans first, then by id
  // (sorted on the computed paidOff: a balloon plan still owes its balloon after `count` payments).
  const installments = plans.map(p => ({ ...p, ...installmentState(p) }))
    .sort((a, b) => a.paidOff - b.paidOff || a.id - b.id)
  const installmentsTotal = installments.reduce((sum, p) => sum + p.remaining, 0)

  let investmentTotal = 0
  const holdingDetails = holdings.map(h => {
    const priceData = prices[h.ticker]
    const currentPrice = priceData?.price || h.cost_price
    const priceMissing = !priceData?.price // no live/cached quote: valued at cost
    const marketValue = h.quantity * currentPrice
    const costValue = h.quantity * h.cost_price
    const isFree = costValue === 0
    const pnl = marketValue - costValue
    const pnlPercent = isFree ? null : (pnl / costValue) * 100
    const marketValueSAR = h.currency === 'USD' ? marketValue * USD_TO_SAR : marketValue
    investmentTotal += marketValueSAR
    return { ...h, currentPrice, marketValue, costValue, isFree, pnl, pnlPercent, marketValueSAR, priceData, priceMissing }
  })

  return {
    total: cashTotal + savingsTotal + investmentTotal - installmentsTotal,
    cashTotal, savingsTotal, investmentTotal, installmentsTotal,
    holdings: holdingDetails, cash: cashDetails, installments, usdToSar: USD_TO_SAR
  }
}

app.get('/api/summary', async (req, res) => {
  res.json(await computeSummary())
})

// Daily net-worth snapshot (one row per Riyadh calendar day) so the dashboard can
// chart real net worth — cash + savings + live investments − installments owed — over time. ponytail: recorded
// hourly from start(), no cron — the last write of each Riyadh day wins, and days
// the process is down get no row. Skipped if any holding has no live price: a gap
// beats a snapshot valued at cost.
async function recordSnapshot() {
  const s = await computeSummary()
  const missing = [...new Set(s.holdings.filter(h => h.priceMissing).map(h => h.ticker))]
  if (missing.length) {
    console.warn('snapshot skipped — no live price for', missing.join(', '))
    return
  }
  const breakdown = JSON.stringify({
    cash: s.cashTotal, savings: s.savingsTotal, investments: s.investmentTotal, installments: s.installmentsTotal
  })
  run(`INSERT INTO snapshots (date, total, breakdown) VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET total=excluded.total, breakdown=excluded.breakdown`,
      [riyadhToday(), s.total, breakdown])
}

// ── Serve frontend in production ──

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  })
}

// Derive an account label from a seed CSV filename.
function accountFromFilename(f) {
  const n = f.toLowerCase()
  if (n.includes('cash') || n.includes('physical')) return 'Cash'
  if (n.includes('bank') || n.includes('snb')) return 'Bank'
  return f.replace(/\.csv$/i, '')
}

// On a brand-new database, import any CSVs bundled in seed/ as transaction history.
function seedTransactions() {
  const existing = get('SELECT COUNT(*) AS c FROM transactions')
  if (existing.c > 0) return
  const seedDir = path.join(__dirname, '..', 'seed')
  if (!fs.existsSync(seedDir)) return
  const files = fs.readdirSync(seedDir).filter(f => f.toLowerCase().endsWith('.csv'))
  let total = 0
  for (const f of files) {
    const account = accountFromFilename(f)
    const { txns, invalid } = csvToTransactions(parseCSV(fs.readFileSync(path.join(seedDir, f), 'utf-8')))
    if (invalid) console.warn(`${f}: skipped ${invalid} row(s) with a missing or unrecognised date`)
    for (const t of txns) {
      run('INSERT INTO transactions (date, category, description, amount, type, account) VALUES (?, ?, ?, ?, ?, ?)',
        [t.date, t.category, t.description, t.amount, t.type, account])
    }
    total += txns.length
  }
  if (total > 0) console.log(`Seeded ${total} transactions from ${files.length} CSV(s)`)
}

async function start() {
  await initDb()
  seedTransactions()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Net Worth Tracker running on http://localhost:${PORT}`)
  })
  const snap = () => recordSnapshot().catch(e => console.error('snapshot failed:', e))
  snap()
  setInterval(snap, 3_600_000)
}

start().catch(console.error)
