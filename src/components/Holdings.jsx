import { useState } from 'react'
import { Plus, Trash2, TrendingUp, TrendingDown, Pencil, X, Check, Sparkles } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import { fmtMoney, fmtQty } from '../lib/format'

function formatNum(n, decimals = 2) {
  return new Intl.NumberFormat('en-SA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(n || 0)
}

// Money cell: SAR shows the Riyal glyph, USD shows $.
function Money({ value, currency, decimals = 2 }) {
  if (currency === 'SAR') {
    return (
      <span className="inline-flex items-center gap-1">
        <RiyalSymbol size={13} className="opacity-70" />
        {formatNum(value, decimals)}
      </span>
    )
  }
  return <span>${formatNum(value, decimals)}</span>
}

const EMPTY = { ticker: '', name: '', quantity: '', cost_price: '', purchase_date: '', account: '', currency: 'USD' }

export default function Holdings({ summary, onUpdate, onSelect }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const holdings = summary?.holdings || []

  const grouped = holdings.reduce((acc, h) => {
    const key = h.account || 'Default'
    if (!acc[key]) acc[key] = []
    acc[key].push(h)
    return acc
  }, {})

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const url = editId ? `/api/holdings/${editId}` : '/api/holdings'
    const method = editId ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        quantity: parseFloat(form.quantity),
        cost_price: parseFloat(form.cost_price)
      })
    })
    setForm({ ...EMPTY })
    setShowForm(false)
    setEditId(null)
    setSaving(false)
    onUpdate()
  }

  async function handleDelete(id) {
    await fetch(`/api/holdings/${id}`, { method: 'DELETE' })
    onUpdate()
  }

  function startEdit(h) {
    setForm({
      ticker: h.ticker,
      name: h.name,
      quantity: h.quantity.toString(),
      cost_price: h.cost_price.toString(),
      purchase_date: h.purchase_date || '',
      account: h.account,
      currency: h.currency
    })
    setEditId(h.id)
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Holdings</h2>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ ...EMPTY }) }}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'Add Holding'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ticker</label>
              <input
                type="text"
                value={form.ticker}
                onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                placeholder="e.g. HLAL"
                required
                className="w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Display name"
                className="w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                required
                className="w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cost Price</label>
              <input
                type="number"
                step="any"
                value={form.cost_price}
                onChange={e => setForm({ ...form, cost_price: e.target.value })}
                required
                className="w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                className="w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Account</label>
              <input
                type="text"
                value={form.account}
                onChange={e => setForm({ ...form, account: e.target.value })}
                placeholder="e.g. Wahed, Alpaca"
                className="w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
              >
                <option value="USD">USD</option>
                <option value="SAR">SAR</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Check size={16} />
                {editId ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </form>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-slate-500">No holdings yet. Add your first one above.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([account, items]) => (
          <div key={account} className="glass rounded-xl overflow-hidden">
            <div className="px-6 py-3 border-b border-dark-500 flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-slate-300">{account}</h3>
              <span className="text-sm font-semibold text-white inline-flex items-center gap-1">
                <RiyalSymbol size={12} className="opacity-70" />
                {formatNum(items.reduce((s, h) => s + (h.marketValueSAR || 0), 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Ticker</th>
                    <th className="px-6 py-3">Qty</th>
                    <th className="px-6 py-3">Cost</th>
                    <th className="px-6 py-3">Current</th>
                    <th className="px-6 py-3">Market Value</th>
                    <th className="px-6 py-3">P&L</th>
                    <th className="px-6 py-3">P&L %</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(h => {
                    const isUp = h.pnl >= 0
                    return (
                      <tr
                        key={h.id}
                        onClick={() => onSelect?.(h)}
                        className="border-t border-dark-600 hover:bg-dark-700/50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <span className="font-medium text-white inline-flex items-center gap-1.5">
                              {h.name || h.ticker}
                              {h.isFree && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                                  <Sparkles size={9} /> FREE
                                </span>
                              )}
                            </span>
                            <span className="block text-xs text-slate-500">{h.ticker}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-300">{fmtQty(h.quantity)}</td>
                        <td className="px-6 py-4 text-slate-400"><Money value={h.cost_price} currency={h.currency} /></td>
                        <td className="px-6 py-4 text-white font-medium"><Money value={h.currentPrice} currency={h.currency} /></td>
                        <td className="px-6 py-4 text-slate-300"><Money value={h.marketValue} currency={h.currency} /></td>
                        <td className={`px-6 py-4 font-medium ${isUp ? 'text-gain' : 'text-loss'}`}>
                          <span className="flex items-center gap-1">
                            {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {isUp ? '+' : ''}<Money value={h.pnl} currency={h.currency} />
                          </span>
                        </td>
                        <td className={`px-6 py-4 font-medium ${h.isFree ? 'text-amber-400' : isUp ? 'text-gain' : 'text-loss'}`}>
                          {h.isFree ? '∞%' : `${isUp ? '+' : ''}${formatNum(h.pnlPercent)}%`}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(h) }}
                              className="p-1.5 text-slate-500 hover:text-accent transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(h.id) }}
                              className="p-1.5 text-slate-500 hover:text-loss transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
