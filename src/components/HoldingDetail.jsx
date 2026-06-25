import { useState, useEffect, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { X, TrendingUp, TrendingDown, Sparkles, Calendar, Plus, Trash2, Layers, Receipt } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import { fmtMoney, fmtQty } from '../lib/format'

const RANGES = [
  { key: '1M', days: 30 }, { key: '3M', days: 90 }, { key: '6M', days: 180 },
  { key: 'YTD', ytd: true }, { key: '1Y', days: 365 }, { key: '3Y', days: 365 * 3 },
  { key: '5Y', days: 365 * 5 }, { key: 'Max', all: true },
]

function cutoffFor(range) {
  if (range.all) return null
  const d = new Date()
  if (range.ytd) return `${d.getFullYear()}-01-01`
  d.setDate(d.getDate() - range.days)
  return d.toISOString().split('T')[0]
}

export default function HoldingDetail({ holding, usdToSar = 3.75, onClose, onUpdate }) {
  const [raw, setRaw] = useState([])
  const [mode, setMode] = useState('price') // 'value' | 'price'
  const [range, setRange] = useState('Max')
  const [scope, setScope] = useState('owned') // 'owned' (since bought) | 'all'
  const [loading, setLoading] = useState(true)
  const [lots, setLots] = useState([])
  const [lotForm, setLotForm] = useState({ quantity: '', cost_price: '', purchase_date: '' })
  const [txns, setTxns] = useState([])

  const hasPurchase = !!holding.purchase_date

  const rate = holding.currency === 'USD' ? usdToSar : 1
  const sar = holding.currency === 'SAR'

  useEffect(() => {
    setLoading(true)
    fetch(`/api/price-history/${encodeURIComponent(holding.ticker)}?from=2019-01-01`)
      .then(r => r.json())
      .then(d => setRaw(Array.isArray(d) ? d : []))
      .catch(() => setRaw([]))
      .finally(() => setLoading(false))
  }, [holding.ticker])

  useEffect(() => {
    fetch(`/api/holdings/${holding.id}/lots`).then(r => r.json())
      .then(d => setLots(Array.isArray(d) ? d : [])).catch(() => setLots([]))
  }, [holding.id])

  useEffect(() => {
    fetch('/api/transactions').then(r => r.json())
      .then(d => setTxns(Array.isArray(d) ? d : [])).catch(() => setTxns([]))
  }, [])

  // Trade history surfaced from existing transactions by keyword match on the
  // ticker + the distinctive last word of the name (e.g. "Aramco", not "Saudi").
  // ponytail: heuristic match, ≥4 chars to avoid junk substrings; misses trades
  // logged under a generic label (e.g. "Abyan — free shares").
  const lastWord = (holding.name || '').trim().split(/\s+/).pop()?.toLowerCase() || ''
  const tradeKw = [holding.ticker.replace(/\..*/, '').toLowerCase(), lastWord]
    .filter(k => k.length >= 4)
    .filter((k, i, a) => a.indexOf(k) === i)
  const trades = txns.filter(t => {
    const s = `${t.description || ''} ${t.category || ''}`.toLowerCase()
    return tradeKw.some(k => s.includes(k))
  })

  async function addLot(e) {
    e.preventDefault()
    const body = { quantity: parseFloat(lotForm.quantity), cost_price: parseFloat(lotForm.cost_price) || 0, purchase_date: lotForm.purchase_date || null }
    if (!(body.quantity > 0)) return
    const r = await fetch(`/api/holdings/${holding.id}/lots`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { setLots(await r.json()); setLotForm({ quantity: '', cost_price: '', purchase_date: '' }); onUpdate?.() }
  }

  async function deleteLot(id) {
    const r = await fetch(`/api/lots/${id}`, { method: 'DELETE' })
    if (r.ok) { setLots(await r.json()); onUpdate?.() }
  }

  // Derive from lots so the totals update live (the holding prop is a stale snapshot).
  const lotQty = lots.reduce((s, l) => s + l.quantity, 0)
  const lotAvg = lotQty ? lots.reduce((s, l) => s + l.quantity * l.cost_price, 0) / lotQty : 0

  const { series, change, pct } = useMemo(() => {
    if (raw.length === 0) return { series: [], change: 0, pct: 0 }
    // "Since bought" clamps to the purchase date; "all" shows full history.
    const floor = (scope === 'owned' && holding.purchase_date) ? holding.purchase_date : null
    const owned = floor ? raw.filter(d => d.date >= floor) : raw
    if (owned.length === 0) return { series: [], change: 0, pct: 0 }
    const r = RANGES.find(x => x.key === range)
    const cutoff = cutoffFor(r)
    let start = 0
    if (cutoff) {
      const i = owned.findIndex(d => d.date >= cutoff)
      start = i === -1 ? owned.length - 1 : i
    }
    const slice = owned.slice(start)
    const series = slice.map(d => ({
      date: d.date,
      price: d.close,
      value: d.close * holding.quantity * rate, // value always in SAR
    }))
    const key = mode === 'value' ? 'value' : 'price'
    const first = series[0]?.[key] ?? 0
    const last = series[series.length - 1]?.[key] ?? 0
    const change = last - first
    const pct = first ? (change / Math.abs(first)) * 100 : 0
    return { series, change, pct }
  }, [raw, range, mode, scope, holding.quantity, holding.purchase_date, rate])

  const isUp = change >= 0
  // Cost reference: price mode → cost per share (native); value mode → cost value (SAR)
  const costRef = mode === 'price'
    ? (holding.cost_price || null)
    : (holding.isFree ? null : holding.cost_price * holding.quantity * rate)

  const Money = ({ v, native }) => native && !sar
    ? <span>${fmtMoney(v)}</span>
    : <span className="inline-flex items-center gap-1"><RiyalSymbol size={13} className="opacity-70" />{fmtMoney(v)}</span>

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const v = payload[0].value
    return (
      <div className="glass rounded-lg px-3 py-2 text-sm">
        <p className="text-slate-400">{label}</p>
        <p className="text-white font-medium">
          {mode === 'price' ? <Money v={v} native /> : <Money v={v} />}
        </p>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-dark-800 border border-dark-600 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto scrollbar-thin"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-white">{holding.name || holding.ticker}</h2>
              {holding.isFree && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                  <Sparkles size={9} /> FREE
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{holding.ticker} · {holding.account}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 -mt-2 text-slate-400 hover:text-white rounded-lg hover:bg-dark-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-dark-600/50 mx-6 rounded-xl overflow-hidden">
          {[
            { label: 'Price', node: <Money v={holding.currentPrice} native /> },
            { label: 'Quantity', node: fmtQty(holding.quantity) },
            { label: 'Market Value', node: <Money v={holding.marketValue} native /> },
            {
              label: 'P&L',
              node: holding.isFree
                ? <span className="text-amber-400">∞</span>
                : <span className={holding.pnl >= 0 ? 'text-gain' : 'text-loss'}>{holding.pnl >= 0 ? '+' : ''}{holding.pnlPercent?.toFixed(1)}%</span>
            },
          ].map(s => (
            <div key={s.label} className="bg-dark-800 p-3">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className="text-sm font-medium text-white">{s.node}</p>
            </div>
          ))}
        </div>

        {/* Purchase info */}
        <div className="px-6 pt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-400">
          {!holding.isFree && (
            <span>Cost basis: <Money v={holding.cost_price} native /> / share</span>
          )}
          {holding.purchase_date && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={13} /> Bought {new Date(holding.purchase_date).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {/* Purchase lots */}
        <div className="px-6 pt-5">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={14} className="text-slate-400" />
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Purchase lots</h4>
          </div>
          {lots.length > 0 && (
            <div className="space-y-1 mb-3">
              {lots.map(l => (
                <div key={l.id} className="flex items-center justify-between text-sm bg-dark-700/50 rounded-lg px-3 py-2">
                  <span className="text-slate-300">
                    {fmtQty(l.quantity)} @ {sar ? '' : '$'}{fmtMoney(l.cost_price)}{sar ? ' SAR' : ''}
                  </span>
                  <span className="inline-flex items-center gap-3">
                    <span className="text-slate-500 text-xs">{l.purchase_date || '—'}</span>
                    <button onClick={() => deleteLot(l.id)} className="text-slate-500 hover:text-loss"><Trash2 size={13} /></button>
                  </span>
                </div>
              ))}
              <p className="text-xs text-slate-500 pt-1">
                {fmtQty(lotQty)} total · avg <Money v={lotAvg} native /> / share
              </p>
            </div>
          )}
          <form onSubmit={addLot} className="flex flex-wrap items-end gap-2">
            <input type="number" step="any" required value={lotForm.quantity} onChange={e => setLotForm({ ...lotForm, quantity: e.target.value })} placeholder="Qty" className="w-20 px-2 py-1.5 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            <input type="number" step="any" value={lotForm.cost_price} onChange={e => setLotForm({ ...lotForm, cost_price: e.target.value })} placeholder={sar ? 'Price' : '$ Price'} className="w-24 px-2 py-1.5 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            <input type="date" value={lotForm.purchase_date} onChange={e => setLotForm({ ...lotForm, purchase_date: e.target.value })} className="px-2 py-1.5 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium"><Plus size={14} /> Add lot</button>
          </form>
          {lots.length === 0 && (
            <p className="text-xs text-slate-500 mt-2">Adding the first lot captures the current quantity as lot 1, then blends in the new buy.</p>
          )}
        </div>

        {/* Trade history (from transactions) */}
        {trades.length > 0 && (
          <div className="px-6 pt-5">
            <div className="flex items-center gap-2 mb-2">
              <Receipt size={14} className="text-slate-400" />
              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Trade history <span className="text-slate-600 normal-case">· from transactions</span>
              </h4>
            </div>
            <div className="space-y-1">
              {trades.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 text-sm bg-dark-700/50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-slate-300">{t.category || '—'}</span>
                    {t.description && <span className="block text-xs text-slate-500 truncate">{t.description}</span>}
                  </div>
                  <span className="inline-flex items-center gap-3 shrink-0">
                    <span className="text-slate-500 text-xs">{t.date}</span>
                    <span className={`inline-flex items-center gap-1 ${t.type === 'income' ? 'text-gain' : 'text-loss'}`}>
                      {t.type === 'income' ? '+' : '−'}<RiyalSymbol size={11} className="opacity-70" />{fmtMoney(Math.abs(t.amount))}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mode toggle + change */}
        <div className="px-6 pt-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 p-1 glass rounded-xl">
            {['value', 'price'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  mode === m ? 'bg-accent text-white' : 'text-slate-400 hover:text-white hover:bg-dark-600'
                }`}
              >
                {m === 'value' ? 'Total Value' : 'Share Price'}
              </button>
            ))}
          </div>
          {series.length >= 2 && (
            <div className={`flex items-center gap-1.5 text-sm ${isUp ? 'text-gain' : 'text-loss'}`}>
              {isUp ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              <span className="font-medium">
                {isUp ? '+' : '−'}{mode === 'price' && !sar ? `$${fmtMoney(Math.abs(change))}` : <span className="inline-flex items-center gap-1"><RiyalSymbol size={11} className="opacity-70" />{fmtMoney(Math.abs(change))}</span>}
              </span>
              <span className="text-slate-500">({isUp ? '+' : ''}{pct.toFixed(1)}% · {range})</span>
            </div>
          )}
        </div>

        {/* Range + scope */}
        <div className="px-6 pt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap gap-1">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  range === r.key ? 'bg-accent text-white' : 'text-slate-400 hover:text-white hover:bg-dark-600'
                }`}
              >
                {r.key}
              </button>
            ))}
          </div>
          {hasPurchase && (
            <div className="flex items-center gap-1 p-1 glass rounded-lg">
              {[['owned', 'Since bought'], ['all', 'All history']].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setScope(v)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    scope === v ? 'bg-accent text-white' : 'text-slate-400 hover:text-white hover:bg-dark-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="p-6 pt-4">
          {loading ? (
            <div className="h-[260px] flex items-center justify-center text-slate-500 text-sm">Loading…</div>
          ) : series.length < 2 ? (
            <div className="h-[260px] flex items-center justify-center text-slate-500 text-sm">No price history available</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="hdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date" axisLine={false} tickLine={false} minTickGap={40}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={d => new Date(d).toLocaleDateString('en-SA', { month: 'short', year: '2-digit' })}
                />
                <YAxis
                  axisLine={false} tickLine={false} width={48}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  domain={['auto', 'auto']}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
                />
                <Tooltip content={<CustomTooltip />} />
                {costRef != null && (
                  <ReferenceLine y={costRef} stroke="#64748b" strokeDasharray="4 4" strokeOpacity={0.6} />
                )}
                <Area
                  type="monotone"
                  dataKey={mode === 'value' ? 'value' : 'price'}
                  stroke={isUp ? '#22c55e' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#hdGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {costRef != null && series.length >= 2 && (
            <p className="text-xs text-slate-500 mt-2">Dashed line = your cost basis</p>
          )}
        </div>
      </div>
    </div>
  )
}
