import { useState } from 'react'
import { Plus, Save, Trash2, X, AlertTriangle } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'

export default function CashAccounts({ summary, onUpdate }) {
  const [editing, setEditing] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', amount: '', type: 'bank', currency: 'SAR', pending: '' })

  const accounts = summary?.cash || []

  async function handleSave(account) {
    const val = editing[account.id]
    if (!val) return
    const amount = val.amount !== undefined ? parseFloat(val.amount) : account.amount
    const pending = val.pending !== undefined ? parseFloat(val.pending) || 0 : account.pending || 0
    await fetch(`/api/cash/${account.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...account, amount, pending })
    })
    setEditing(prev => { const n = { ...prev }; delete n[account.id]; return n })
    onUpdate()
  }

  async function handleAdd(e) {
    e.preventDefault()
    await fetch('/api/cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newAccount, amount: parseFloat(newAccount.amount) || 0, pending: parseFloat(newAccount.pending) || 0 })
    })
    setNewAccount({ name: '', amount: '', type: 'bank', currency: 'SAR', pending: '' })
    setShowAdd(false)
    onUpdate()
  }

  async function handleDelete(id) {
    await fetch(`/api/cash/${id}`, { method: 'DELETE' })
    onUpdate()
  }

  function getEditVal(account, field) {
    const e = editing[account.id]
    if (e && e[field] !== undefined) return e[field]
    return account[field]
  }

  function setEditVal(account, field, value) {
    setEditing(prev => ({
      ...prev,
      [account.id]: { ...(prev[account.id] || {}), [field]: value }
    }))
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Cash & Bank</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-light transition-colors"
        >
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          {showAdd ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4 p-4 bg-dark-700 rounded-lg animate-fade-in">
          <input
            type="text"
            value={newAccount.name}
            onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
            placeholder="Account name"
            required
            className="px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
          />
          <input
            type="number"
            step="any"
            value={newAccount.amount}
            onChange={e => setNewAccount({ ...newAccount, amount: e.target.value })}
            placeholder="Amount"
            className="px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
          />
          <input
            type="number"
            step="any"
            value={newAccount.pending}
            onChange={e => setNewAccount({ ...newAccount, pending: e.target.value })}
            placeholder="Pending (-)"
            className="px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
          />
          <select
            value={newAccount.type}
            onChange={e => setNewAccount({ ...newAccount, type: e.target.value })}
            className="px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
          >
            <option value="bank">Bank</option>
            <option value="physical">Physical Cash</option>
            <option value="other">Other</option>
          </select>
          <select
            value={newAccount.currency}
            onChange={e => setNewAccount({ ...newAccount, currency: e.target.value })}
            className="px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
          >
            <option value="SAR">SAR</option>
            <option value="USD">USD</option>
          </select>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(account => {
          const pending = getEditVal(account, 'pending') || 0
          const amount = getEditVal(account, 'amount') || 0
          const effective = parseFloat(amount) - Math.abs(parseFloat(pending) || 0)
          const hasPending = parseFloat(pending) > 0

          return (
            <div key={account.id} className="p-4 bg-dark-700 rounded-xl border border-dark-500 hover:border-dark-400 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">{account.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 px-2 py-0.5 bg-dark-600 rounded">{account.currency}</span>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="p-1 text-slate-600 hover:text-loss transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <RiyalSymbol size={18} className="text-slate-500" />
                <input
                  type="number"
                  step="any"
                  value={getEditVal(account, 'amount')}
                  onChange={e => setEditVal(account, 'amount', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave(account)}
                  className="flex-1 bg-transparent text-2xl font-semibold text-white focus:outline-none"
                />
                {editing[account.id] && (
                  <button
                    onClick={() => handleSave(account)}
                    className="p-1.5 text-accent hover:text-accent-light transition-colors"
                  >
                    <Save size={16} />
                  </button>
                )}
              </div>
              {/* Pending amount */}
              <div className="mt-2 flex items-center gap-2">
                <AlertTriangle size={12} className={hasPending ? 'text-amber-400' : 'text-slate-600'} />
                <input
                  type="number"
                  step="any"
                  value={getEditVal(account, 'pending')}
                  onChange={e => setEditVal(account, 'pending', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave(account)}
                  placeholder="Pending amount"
                  className="flex-1 bg-transparent text-sm text-amber-400/70 focus:outline-none placeholder:text-slate-600"
                />
              </div>
              {hasPending && (
                <div className="mt-1 text-xs text-slate-500">
                  Effective: <RiyalSymbol size={10} className="text-slate-500" /> {effective.toLocaleString('en-SA', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
