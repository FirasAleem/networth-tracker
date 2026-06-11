import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import RiyalSymbol from './RiyalSymbol'

const COLORS = ['#22c55e', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316']

function formatNum(n) {
  return new Intl.NumberFormat('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

export default function PieBreakdown({ summary }) {
  if (!summary) return null

  const cashByAccount = (summary.cash || []).map(c => ({
    name: c.name,
    value: c.effectiveSAR != null
      ? c.effectiveSAR
      : (c.currency === 'USD' ? c.amount * summary.usdToSar : c.amount)
  })).filter(c => c.value > 0)

  const holdingsByAccount = {}
  ;(summary.holdings || []).forEach(h => {
    const key = h.account || 'Default'
    if (!holdingsByAccount[key]) holdingsByAccount[key] = 0
    holdingsByAccount[key] += h.marketValueSAR || 0
  })

  const investmentSlices = Object.entries(holdingsByAccount).map(([name, value]) => ({
    name,
    value
  }))

  const data = [...cashByAccount, ...investmentSlices].filter(d => d.value > 0)

  if (data.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 h-full flex items-center justify-center">
        <p className="text-slate-500 text-sm">Add holdings or cash to see breakdown</p>
      </div>
    )
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    const pct = ((d.value / summary.total) * 100).toFixed(1)
    return (
      <div className="glass rounded-lg px-3 py-2 text-sm">
        <p className="text-white font-medium">{d.name}</p>
        <p className="text-slate-300 inline-flex items-center gap-1">
          <RiyalSymbol size={12} className="opacity-70" /> {formatNum(d.value)}
        </p>
        <p className="text-slate-400">{pct}%</p>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6 h-full">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Allocation</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2 mt-4">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-slate-300">{d.name}</span>
            </div>
            <span className="text-slate-400">{((d.value / summary.total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
