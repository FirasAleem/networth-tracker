import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Download, Plus, X, Check, Trash2 } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import HistoryChart from './HistoryChart'
import { fmtMoney } from '../lib/format'

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], category: '', description: '', amount: '', type: 'expense', account: '' })
  const [importAccount, setImportAccount] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  const loadTransactions = useCallback(() => {
    const q = filter !== 'all' ? `?account=${encodeURIComponent(filter)}` : ''
    fetch(`/api/transactions${q}`).then(r => r.json()).then(setTransactions).catch(() => {})
  }, [filter])

  useEffect(() => { loadTransactions() }, [loadTransactions])
  useEffect(() => {
    fetch('/api/transactions/accounts').then(r => r.json()).then(setAccounts).catch(() => {})
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) })
    })
    setForm({ date: new Date().toISOString().split('T')[0], category: '', description: '', amount: '', type: 'expense', account: form.account })
    setShowForm(false)
    loadTransactions()
  }

  async function handleDelete(id) {
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    setTransactions(transactions.filter(t => t.id !== id))
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('account', importAccount)
    const res = await fetch('/api/transactions/import', { method: 'POST', body: formData })
    const data = await res.json()
    if (data.imported) {
      loadTransactions()
      fetch('/api/transactions/accounts').then(r => r.json()).then(setAccounts).catch(() => {})
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const tabs = ['all', ...accounts]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white">Transactions</h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            value={importAccount}
            onChange={e => setImportAccount(e.target.value)}
            title="Account to tag imported rows with"
            className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-accent"
          >
            <option value="">Import as…</option>
            <option value="Bank">Bank</option>
            <option value="Cash">Cash</option>
            {accounts.filter(a => a !== 'Bank' && a !== 'Cash').map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="flex items-center gap-2 px-4 py-2 glass glass-hover rounded-lg text-sm text-slate-300 whitespace-nowrap cursor-pointer transition-all">
            <Upload size={14} />
            {importing ? 'Importing...' : 'Import CSV'}
            <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
          </label>
          <button
            onClick={() => window.open('/api/transactions/export', '_blank')}
            className="flex items-center gap-2 px-4 py-2 glass glass-hover rounded-lg text-sm text-slate-300 whitespace-nowrap transition-all"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? 'Cancel' : 'Add'}
          </button>
        </div>
      </div>

      {/* Account filter toggle */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-1 p-1 glass rounded-xl w-fit">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                filter === t ? 'bg-accent text-white' : 'text-slate-400 hover:text-white hover:bg-dark-600'
              }`}
            >
              {t === 'all' ? 'Combined' : t}
            </button>
          ))}
        </div>
      )}

      {/* History chart for the selected account */}
      <HistoryChart
        account={filter}
        title={filter === 'all' ? 'Balance History — Combined' : `Balance History — ${filter}`}
        height={200}
      />

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Total Income</p>
          <p className="text-xl font-semibold text-gain inline-flex items-center gap-1.5"><RiyalSymbol size={16} /> {fmtMoney(totalIncome)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Total Expenses</p>
          <p className="text-xl font-semibold text-loss inline-flex items-center gap-1.5"><RiyalSymbol size={16} /> {fmtMoney(totalExpense)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Net</p>
          <p className={`text-xl font-semibold inline-flex items-center gap-1.5 ${totalIncome - totalExpense >= 0 ? 'text-gain' : 'text-loss'}`}>
            <RiyalSymbol size={16} /> {fmtMoney(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="glass rounded-xl p-6 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required
              className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <select value={form.account} onChange={e => setForm({ ...form, account: e.target.value })}
              className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent">
              <option value="">No account</option>
              <option value="Bank">Bank</option>
              <option value="Cash">Cash</option>
              {accounts.filter(a => a !== 'Bank' && a !== 'Cash').map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Category"
              className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            <input type="number" step="any" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required
              className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            <button type="submit"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors">
              <Check size={14} /> Add
            </button>
          </div>
          <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)"
            className="mt-4 w-full px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
        </form>
      )}

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No transactions{filter !== 'all' ? ` for ${filter}` : ''}. Add manually or import a CSV.
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto overflow-x-auto sm:overflow-x-hidden scrollbar-thin" style={{ scrollbarGutter: 'stable' }}>
            <table className="w-full min-w-[640px] sm:min-w-0 table-fixed text-sm">
              <thead className="sticky top-0 bg-dark-800/95 backdrop-blur z-10">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-28">Date</th>
                  <th className="px-4 py-3 w-20">Account</th>
                  <th className="px-4 py-3 w-24">Type</th>
                  <th className="px-4 py-3 w-32">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 w-32 text-right">Amount</th>
                  <th className="px-4 py-3 w-16 text-right"><span className="sr-copy">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-t border-dark-600 hover:bg-dark-700/50 transition-colors">
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-3 text-slate-400 truncate" title={t.account}>{t.account || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        t.type === 'income' ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'
                      }`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 truncate" title={t.category}>{t.category}</td>
                    <td className="px-4 py-3 text-slate-300 truncate" title={t.description}>{t.description}</td>
                    <td className={`px-4 py-3 font-medium whitespace-nowrap text-right ${t.type === 'income' ? 'text-gain' : 'text-loss'}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {t.type === 'income' ? '+' : '-'}<RiyalSymbol size={12} className="opacity-70" /> {fmtMoney(t.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 text-slate-500 hover:text-loss transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
