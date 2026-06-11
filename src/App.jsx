import { useState, useEffect, useCallback } from 'react'
import NetWorthHeader from './components/NetWorthHeader'
import PieBreakdown from './components/PieBreakdown'
import Holdings from './components/Holdings'
import DashboardHoldings from './components/DashboardHoldings'
import HoldingDetail from './components/HoldingDetail'
import CopyToNotes from './components/CopyToNotes'
import CashAccounts from './components/CashAccounts'
import HistoryChart from './components/HistoryChart'
import Transactions from './components/Transactions'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'transactions', label: 'Transactions' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [summary, setSummary] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/summary')
      const data = await res.json()
      setSummary(data)
    } catch (e) {
      console.error('Failed to fetch summary:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
    const interval = setInterval(fetchSummary, 60_000)
    return () => clearInterval(interval)
  }, [fetchSummary])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Nav */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <nav className="flex items-center gap-1 p-1 glass rounded-xl w-fit">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  tab === t.id
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'text-slate-400 hover:text-white hover:bg-dark-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto">
            <CopyToNotes summary={summary} />
          </div>
        </div>

        {tab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
            <NetWorthHeader summary={summary} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <PieBreakdown summary={summary} />
              </div>
              <div className="lg:col-span-2">
                <HistoryChart account="all" title="Balance History" fill />
              </div>
            </div>
            <DashboardHoldings summary={summary} onSelect={setSelected} />
            <CashAccounts summary={summary} onUpdate={fetchSummary} />
          </div>
        )}

        {tab === 'holdings' && (
          <div className="animate-fade-in">
            <Holdings summary={summary} onUpdate={fetchSummary} onSelect={setSelected} />
          </div>
        )}

        {tab === 'transactions' && (
          <div className="animate-fade-in">
            <Transactions />
          </div>
        )}
      </div>

      {selected && (
        <HoldingDetail
          holding={selected}
          usdToSar={summary?.usdToSar}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
