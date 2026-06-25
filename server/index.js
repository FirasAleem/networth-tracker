import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { initDb, all, get, run, save } from './db.js'
import { parseCSV, csvToTransactions } from './csv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 2307
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
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
  res.json(get('SELECT * FROM holdings WHERE id = ?', [req.params.id]))
})

app.delete('/api/holdings/:id', (req, res) => {
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
  run('DELETE FROM lots WHERE id = ?', [req.params.id])
  recomputeHolding(lot.holding_id)
  res.json(all('SELECT * FROM lots WHERE holding_id = ? ORDER BY purchase_date, id', [lot.holding_id]))
})

// ── Cash Accounts ──

app.get('/api/cash', (req, res) => {
  res.json(all('SELECT * FROM cash_accounts ORDER BY id'))
})

app.post('/api/cash', (req, res) => {
  const { name, amount, pending, type, currency } = req.body
  const result = run(
    'INSERT INTO cash_accounts (name, amount, pending, type, currency) VALUES (?, ?, ?, ?, ?)',
    [name, amount || 0, pending || 0, type || 'bank', currency || 'SAR']
  )
  res.json(get('SELECT * FROM cash_accounts WHERE id = ?', [result.lastInsertRowid]))
})

app.put('/api/cash/:id', (req, res) => {
  const { name, amount, pending, type, currency } = req.body
  run(
    `UPDATE cash_accounts SET name=?, amount=?, pending=?, type=?, currency=?, updated_at=datetime('now') WHERE id=?`,
    [name, amount, pending || 0, type, currency, req.params.id]
  )
  res.json(get('SELECT * FROM cash_accounts WHERE id = ?', [req.params.id]))
})

app.delete('/api/cash/:id', (req, res) => {
  run('DELETE FROM cash_accounts WHERE id = ?', [req.params.id])
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
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${req.params.ticker}?period1=${p1}&period2=${p2}&interval=1d`
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

app.post('/api/snapshots', (req, res) => {
  const { date, total, breakdown } = req.body
  const existing = get('SELECT id FROM snapshots WHERE date = ?', [date])
  if (existing) {
    run('UPDATE snapshots SET total=?, breakdown=? WHERE date=?', [total, JSON.stringify(breakdown || {}), date])
  } else {
    run('INSERT INTO snapshots (date, total, breakdown) VALUES (?, ?, ?)', [date, total, JSON.stringify(breakdown || {})])
  }
  res.json({ ok: true })
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
  const txns = csvToTransactions(rows)
  if (txns.length === 0) {
    return res.status(400).json({ error: 'CSV must have a date and a value/amount column' })
  }
  for (const t of txns) {
    run(
      'INSERT INTO transactions (date, category, description, amount, type, account) VALUES (?, ?, ?, ?, ?, ?)',
      [t.date, t.category, t.description, t.amount, t.type, account]
    )
  }
  res.json({ imported: txns.length })
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

app.get('/api/summary', async (req, res) => {
  const holdings = all('SELECT * FROM holdings')
  const cash = all('SELECT * FROM cash_accounts')

  const tickers = [...new Set(holdings.map(h => h.ticker))]
  const prices = tickers.length > 0 ? await fetchPrices(tickers) : {}

  let totalSAR = 0
  // Effective cash = balance minus any pending amounts (e.g. money owed to a friend).
  const cashDetails = cash.map(c => {
    const effective = c.amount - Math.abs(c.pending || 0)
    const effectiveSAR = c.currency === 'USD' ? effective * USD_TO_SAR : effective
    return { ...c, effective, effectiveSAR }
  })
  const cashTotal = cashDetails.reduce((sum, c) => sum + c.effectiveSAR, 0)
  totalSAR += cashTotal

  let investmentTotal = 0
  const holdingDetails = holdings.map(h => {
    const priceData = prices[h.ticker]
    const currentPrice = priceData?.price || h.cost_price
    const marketValue = h.quantity * currentPrice
    const costValue = h.quantity * h.cost_price
    const isFree = costValue === 0
    const pnl = marketValue - costValue
    const pnlPercent = isFree ? null : (pnl / costValue) * 100
    const marketValueSAR = h.currency === 'USD' ? marketValue * USD_TO_SAR : marketValue
    investmentTotal += marketValueSAR
    return { ...h, currentPrice, marketValue, costValue, isFree, pnl, pnlPercent, marketValueSAR, priceData }
  })
  totalSAR += investmentTotal

  // Daily net-worth snapshot (one row/day) so the dashboard can chart real net
  // worth — cash + live investments — over time. ponytail: upsert on read, no
  // cron; rewrites the DB file each call (~60s), fine at this scale.
  const today = new Date().toISOString().split('T')[0]
  const breakdown = JSON.stringify({ cash: cashTotal, investments: investmentTotal })
  run(`INSERT INTO snapshots (date, total, breakdown) VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET total=excluded.total, breakdown=excluded.breakdown`,
      [today, totalSAR, breakdown])

  res.json({ total: totalSAR, cashTotal, investmentTotal, holdings: holdingDetails, cash: cashDetails, usdToSar: USD_TO_SAR })
})

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
    const txns = csvToTransactions(parseCSV(fs.readFileSync(path.join(seedDir, f), 'utf-8')))
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
}

start().catch(console.error)
