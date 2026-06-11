// SAMPLE seed data (committed). Copy this to seed-data.js and fill in your real
// portfolio. seed-data.js is gitignored so your real balances never hit git.
//
//   cp server/seed-data.example.js server/seed-data.js
//
// On a fresh database the app seeds from seed-data.js if present, otherwise from
// this example. Free shares use cost_price = 0 (shown as ∞% return).

export const cashAccounts = [
  { name: 'Physical Cash', amount: 0, pending: 0, type: 'physical', currency: 'SAR' },
  { name: 'Bank Account', amount: 0, pending: 0, type: 'bank', currency: 'SAR' },
]

export const holdings = [
  // Example SAR holding (Tadawul ticker format: <code>.SR)
  { ticker: '2222.SR', name: 'Saudi Aramco', quantity: 10, cost_price: 30, purchase_date: '2024-01-01', account: 'SNB Capital', currency: 'SAR' },
  // Example USD holding
  { ticker: 'SPUS', name: 'SP Funds S&P 500 Sharia', quantity: 5, cost_price: 50, purchase_date: '2024-01-01', account: 'Brokerage', currency: 'USD' },
  // Example free share (cost 0 → infinite upside)
  { ticker: 'AAPL', name: 'Apple (free)', quantity: 0.01, cost_price: 0, purchase_date: null, account: 'Brokerage', currency: 'USD' },
]
