import { TrendingUp, TrendingDown, Wallet, PiggyBank, BarChart3, CreditCard } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import { fmtMoney } from '../lib/format'

// `sign` (e.g. "−") sits right before the glyph. The value wraps instead of
// overflowing in the narrow two-column mobile cards.
function SARValue({ amount, sign = '', symbolClass = 'text-slate-400' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className="inline-flex items-center gap-0.5">
        {sign}
        <RiyalSymbol size={20} className={`${symbolClass} h-3.5 w-auto sm:h-5`} />
      </span>
      <span>{fmtMoney(amount)}</span>
    </span>
  )
}

export default function NetWorthHeader({ summary }) {
  if (!summary) return null

  const holdingCount = summary.holdings?.length || 0
  const owed = summary.installmentsTotal > 0

  const cards = [
    {
      label: 'Cash',
      value: summary.cashTotal,
      icon: Wallet,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10'
    },
    {
      label: 'Savings & Deposits',
      value: summary.savingsTotal,
      icon: PiggyBank,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10'
    },
    {
      label: 'Investments',
      value: summary.investmentTotal,
      icon: BarChart3,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      note: `${holdingCount} ${holdingCount === 1 ? 'holding' : 'holdings'}`
    },
    {
      label: 'Installments owed',
      value: summary.installmentsTotal,
      icon: CreditCard,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      owed
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
            {fmtMoney(summary.total)}
          </span>
        </div>
        <div className={`flex items-center justify-center gap-1 mt-3 text-sm ${isPositive ? 'text-gain' : 'text-loss'}`}>
          {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span className="inline-flex items-center gap-1">
            {isPositive ? '+' : ''}{fmtMoney(totalPnL)}
            <span className="text-slate-500 ml-1">unrealized P&L</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map(card => (
          <div key={card.label} className="glass glass-hover rounded-xl p-3 sm:p-5 transition-all">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${card.bg}`}>
                <card.icon size={18} className={card.color} />
              </div>
              <span className="text-xs sm:text-sm leading-tight text-slate-400">{card.label}</span>
            </div>
            <p className={`text-base sm:text-2xl font-semibold ${card.owed ? 'text-loss' : 'text-white'}`}>
              <SARValue
                amount={card.value}
                sign={card.owed ? '−' : ''}
                symbolClass={card.owed ? 'opacity-70' : 'text-slate-400'}
              />
            </p>
            {card.note && <p className="mt-1 text-xs text-slate-500">{card.note}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
