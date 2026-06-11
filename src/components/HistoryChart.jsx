import { useState, useEffect, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import { fmtMoney } from '../lib/format'

const RANGES = [
  { key: '1D', days: 1 },
  { key: '1W', days: 7 },
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: '6M', days: 180 },
  { key: 'YTD', ytd: true },
  { key: '1Y', days: 365 },
  { key: '3Y', days: 365 * 3 },
  { key: '5Y', days: 365 * 5 },
  { key: 'Max', all: true },
]

function cutoffFor(range) {
  if (range.all) return null
  const d = new Date()
  if (range.ytd) return `${d.getFullYear()}-01-01`
  d.setDate(d.getDate() - range.days)
  return d.toISOString().split('T')[0]
}

export default function HistoryChart({ account = 'all', title = 'Balance History', height = 220, fill = false }) {
  const [data, setData] = useState([])
  const [range, setRange] = useState('Max')

  useEffect(() => {
    const q = account && account !== 'all' ? `?account=${encodeURIComponent(account)}` : ''
    fetch(`/api/history${q}`).then(r => r.json()).then(setData).catch(() => {})
  }, [account])

  // Slice to the selected range and compute the change over that window.
  const { series, change, pct, hasData } = useMemo(() => {
    if (data.length === 0) return { series: [], change: 0, pct: 0, hasData: false }
    const r = RANGES.find(x => x.key === range)
    const cutoff = cutoffFor(r)
    let startIdx = 0
    if (cutoff) {
      const i = data.findIndex(d => d.date >= cutoff)
      startIdx = i === -1 ? data.length - 1 : i
    }
    const series = data.slice(startIdx)
    // Baseline = balance just before the window (so the delta reflects the period).
    const baseline = startIdx > 0 ? data[startIdx - 1].balance : (series[0]?.balance ?? 0)
    const end = series.length ? series[series.length - 1].balance : baseline
    const change = end - baseline
    // % is only meaningful against a real prior balance — not the first-ever
    // transaction (Max), where the baseline is ~0 and the % explodes.
    const showPct = !r.all && Math.abs(baseline) >= 1000
    const pct = showPct ? (change / Math.abs(baseline)) * 100 : null
    return { series, change, pct, hasData: series.length >= 1 }
  }, [data, range])

  const isUp = change >= 0

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="glass rounded-lg px-3 py-2 text-sm">
        <p className="text-slate-400">{label}</p>
        <p className="text-white font-medium inline-flex items-center gap-1">
          <RiyalSymbol size={12} className="opacity-70" /> {fmtMoney(payload[0].value)}
        </p>
      </div>
    )
  }

  return (
    <div className={`glass rounded-2xl p-6 flex flex-col ${fill ? 'h-full' : ''}`}>
      {/* Header: title + change for the selected range */}
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</h3>
          {hasData && (
            <div className={`mt-1 flex items-center gap-1.5 text-sm ${isUp ? 'text-gain' : 'text-loss'}`}>
              {isUp ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              <span className="inline-flex items-center gap-1 font-medium">
                {isUp ? '+' : '−'}<RiyalSymbol size={12} className="opacity-70" /> {fmtMoney(Math.abs(change))}
              </span>
              <span className="text-slate-500">
                ({pct != null ? `${isUp ? '+' : ''}${pct.toFixed(1)}% · ` : ''}{range})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap gap-1 mb-4">
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

      {/* Chart */}
      {!hasData || series.length < 2 ? (
        <div className={`flex items-center justify-center text-slate-500 text-sm ${fill ? 'flex-1' : ''}`} style={fill ? { minHeight: height } : { height }}>
          <p>Not enough data in this range</p>
        </div>
      ) : (
        <div className={fill ? 'flex-1 min-h-0' : ''} style={fill ? { minHeight: height } : { height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                minTickGap={40}
                tickFormatter={d => {
                  const dt = new Date(d)
                  return dt.toLocaleDateString('en-SA', { month: 'short', year: '2-digit' })
                }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} fill="url(#nwGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
