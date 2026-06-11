import { TrendingUp, TrendingDown, Wallet, Building2, BarChart3 } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'

function formatSAR(amount) {
  return new Intl.NumberFormat('en-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0)
}

function SARValue({ amount, size = 'text-2xl', symbolSize = 20 }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <RiyalSymbol size={symbolSize} className="text-slate-400" />
      <span>{formatSAR(amount)}</span>
    </span>
  )
}

export default function NetWorthHeader({ summary }) {
  if (!summary) return null

  const cards = [
    {
      label: 'Cash Holdings',
      value: summary.cashTotal,
      icon: Wallet,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10'
    },
    {
      label: 'Investments',
      value: summary.investmentTotal,
      icon: BarChart3,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10'
    },
    {
      label: 'Holdings Count',
      value: summary.holdings?.length || 0,
      icon: Building2,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      isCurrency: false
    }
  ]

  const totalPnL = (summary.holdings || []).reduce((sum, h) => {
    const pnlSAR = h.currency === 'USD' ? h.pnl * (summary.usdToSar || 3.75) : h.pnl
    return sum + pnlSAR
  }, 0)
  const isPositive = totalPnL >= 0

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-sm text-slate-400 uppercase tracking-widest mb-2">Total Net Worth</p>
        <div className="flex items-center justify-center gap-4 animate-count">
          <RiyalSymbol size={36} className="text-slate-500" />
          <span className="text-5xl sm:text-6xl font-bold tracking-tight text-white">
            {formatSAR(summary.total)}
          </span>
        </div>
        <div className={`flex items-center justify-center gap-1 mt-3 text-sm ${isPositive ? 'text-gain' : 'text-loss'}`}>
          {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span className="inline-flex items-center gap-1">
            {isPositive ? '+' : ''}{formatSAR(totalPnL)}
            <span className="text-slate-500 ml-1">unrealized P&L</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(card => (
          <div key={card.label} className="glass glass-hover rounded-xl p-5 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon size={18} className={card.color} />
              </div>
              <span className="text-sm text-slate-400">{card.label}</span>
            </div>
            <p className="text-2xl font-semibold text-white">
              {card.isCurrency === false
                ? card.value
                : <SARValue amount={card.value} />
              }
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
