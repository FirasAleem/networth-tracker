import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'networth.db')

const dataDir = path.dirname(dbPath)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

let db

export async function initDb() {
  const SQL = await initSqlJs()

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL,
      cost_price REAL NOT NULL,
      purchase_date TEXT,
      account TEXT NOT NULL DEFAULT 'Default',
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  // Purchase lots: multiple dated buys per holding. The holding row stays the
  // aggregate (summed qty + weighted-avg cost), recomputed from its lots.
  db.run(`
    CREATE TABLE IF NOT EXISTS lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holding_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      cost_price REAL NOT NULL,
      purchase_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS cash_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      pending REAL NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'bank',
      currency TEXT NOT NULL DEFAULT 'SAR',
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  // Migration: add `pending` to older databases that predate the column.
  const cashCols = db.exec('PRAGMA table_info(cash_accounts)')[0]?.values.map(r => r[1]) || []
  if (!cashCols.includes('pending')) {
    db.run('ALTER TABLE cash_accounts ADD COLUMN pending REAL NOT NULL DEFAULT 0')
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      total REAL NOT NULL,
      breakdown TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      category TEXT,
      description TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      account TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  // Migration: add `account` to older transaction tables.
  const txnCols = db.exec('PRAGMA table_info(transactions)')[0]?.values.map(r => r[1]) || []
  if (!txnCols.includes('account')) {
    db.run("ALTER TABLE transactions ADD COLUMN account TEXT NOT NULL DEFAULT ''")
  }

  const [{ values: [[count]] }] = db.exec('SELECT COUNT(*) FROM cash_accounts')
  if (count === 0) {
    await seedPortfolio()
    save()
  }

  return db
}

// Load seed data from the gitignored seed-data.js (real portfolio) if present,
// otherwise fall back to the committed seed-data.example.js sample.
async function loadSeedData() {
  try {
    return await import('./seed-data.js')
  } catch {
    return await import('./seed-data.example.js')
  }
}

async function seedPortfolio() {
  const { cashAccounts = [], holdings = [] } = await loadSeedData()

  const cash = db.prepare('INSERT INTO cash_accounts (name, amount, pending, type, currency) VALUES (?, ?, ?, ?, ?)')
  for (const c of cashAccounts) {
    cash.run([c.name, c.amount || 0, c.pending || 0, c.type || 'bank', c.currency || 'SAR'])
  }
  cash.free()

  const h = db.prepare('INSERT INTO holdings (ticker, name, quantity, cost_price, purchase_date, account, currency) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const x of holdings) {
    h.run([x.ticker, x.name || '', x.quantity, x.cost_price, x.purchase_date || null, x.account || 'Default', x.currency || 'USD'])
  }
  h.free()
}

export function save() {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

export function getDb() {
  return db
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

export function get(sql, params = []) {
  const rows = all(sql, params)
  return rows[0] || null
}

export function run(sql, params = []) {
  db.run(sql, params)
  const result = db.exec('SELECT last_insert_rowid() as id')
  const id = result[0]?.values[0][0]
  save()
  return { lastInsertRowid: id }
}
