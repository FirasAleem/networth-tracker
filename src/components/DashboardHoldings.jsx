import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import { fmtMoney, fmtQty } from '../lib/format'

export default function DashboardHoldings({ summary, onSelect }) {
  const holdings = [...(summary?.holdings || [])].sort((a, b) => b.marketValueSAR - a.marketValueSAR)

  if (holdings.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Holdings</h3>
        <p className="text-slate-500 text-sm">No holdings yet — add them on the Holdings tab.</p>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Holdings</h3>
      <div className="space-y-1">
        {holdings.map(h => {
          const isUp = h.pnl >= 0
          const sym = h.currency === 'SAR'
          return (
            <button
              key={h.id}
              onClick={() => onSelect?.(h)}
              className="w-full text-left flex items-center justify-between gap-2 py-2.5 px-2 rounded-lg hover:bg-dark-700/50 transition-colors"
            >
              {/* Left: name + qty @ price · account */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{h.name || h.ticker}</span>
                  {h.isFree && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">
                      <Sparkles size={9} /> FREE
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {fmtQty(h.quantity)} @ {sym ? '' : '$'}{fmtMoney(h.currentPrice)}{sym ? ' SAR' : ''} · {h.account}
                </div>
              </div>

              {/* Middle: value in SAR */}
              <div className="text-right px-2 shrink-0">
                <div className="text-sm text-white inline-flex items-center gap-1 justify-end">
                  <RiyalSymbol size={12} className="opacity-70" /> {fmtMoney(h.marketValueSAR)}
                </div>
                <div className="text-xs text-slate-500">
                  {sym ? '' : '$'}{fmtMoney(h.marketValue)}{sym ? ' SAR' : ''}
                </div>
              </div>

              {/* Right: P&L % */}
              <div className={`text-right text-sm font-medium w-16 inline-flex items-center justify-end gap-1 shrink-0 ${h.isFree ? 'text-amber-400' : isUp ? 'text-gain' : 'text-loss'}`}>
                {!h.isFree && (isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
                {h.isFree ? '∞%' : `${isUp ? '+' : ''}${h.pnlPercent?.toFixed(1)}%`}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
