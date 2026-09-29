import { useState, useRef, useEffect } from 'react'
import { Plus, Save, Trash2, X, Check, Pencil } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import { fmtMoney } from '../lib/format'
import { today, toLocalDate, fmtDate } from '../lib/dates'
import { send } from '../lib/api'

const INPUT = 'w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent'
const EMPTY = {
  id: null, type: 'savings', name: '', amount: '', pending: 0, currency: 'SAR',
  profit_rate: '', payout: 'monthly', start_date: '', maturity_date: '', expected_profit: ''
}

const blank = v => v ?? ''
const num = v => (v === '' ? null : Number(v))

function toForm(row) {
  return {
    id: row.id, type: row.type, name: row.name, amount: row.amount, pending: row.pending || 0, currency: row.currency,
    profit_rate: blank(row.profit_rate), payout: row.payout || 'monthly',
    start_date: blank(row.start_date), maturity_date: blank(row.maturity_date), expected_profit: blank(row.expected_profit)
  }
}

// Form → API body: blank optional fields become null, and fields that don't
// apply to the chosen type (payout / dates) are cleared. Payout only qualifies
// a rate, so it is dropped when there is no rate.
function toPayload(f) {
  const savings = f.type === 'savings'
  return {
    name: f.name.trim(),
    amount: Number(f.amount),
    pending: f.pending,
    type: f.type,
    currency: f.currency,
    profit_rate: num(f.profit_rate),
    payout: savings && f.profit_rate !== '' ? f.payout : null,
    start_date: savings ? null : f.start_date || null,
    maturity_date: savings ? null : f.maturity_date || null,
    expected_profit: num(f.expected_profit)
  }
}

// Share of the deposit term elapsed (0–100); null unless both dates are set.
function termProgress(row) {
  if (!row.start_date || !row.maturity_date) return null
  if (row.matured) return 100
  const start = toLocalDate(row.start_date)
  const span = toLocalDate(row.maturity_date) - start
  if (span <= 0) return null
  return Math.min(100, Math.max(0, ((toLocalDate(today()) - start) / span) * 100))
}

function Field({ label, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

// Big currency prefix in front of a balance: `$` for USD, the Riyal glyph for SAR.
function Cur({ usd }) {
  return usd
    ? <span className="text-2xl font-semibold text-slate-500">$</span>
    : <RiyalSymbol size={18} className="text-slate-500" />
}

// Inline amount in the account's own currency.
function Amt({ value, usd }) {
  return usd
    ? <>${fmtMoney(value)}</>
    : <><RiyalSymbol size={10} />{' '}{fmtMoney(value)}</>
}

// Muted "a · b · c" line; falsy parts are skipped.
function Detail({ parts }) {
  const shown = parts.filter(Boolean)
  if (shown.length === 0) return null
  return (
    <div className="mt-2 text-xs text-slate-500">
      {shown.map((p, i) => <span key={i}>{i > 0 && ' · '}{p}</span>)}
    </div>
  )
}

function SavingsBody({ row, usd, value, dirty, onChange, onSave }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Cur usd={usd} />
        <input
          type="number"
          step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSave()}
          aria-label={`${row.name} balance`}
          className="flex-1 min-w-0 bg-transparent text-2xl font-semibold text-white focus:outline-none"
        />
        {dirty && (
          <button
            onClick={onSave}
            aria-label="Save balance"
            className="p-1.5 text-accent hover:text-accent-light transition-colors"
          >
            <Save size={16} />
          </button>
        )}
      </div>
      <Detail parts={[
        row.profit_rate != null && `${row.profit_rate}% p.a.`,
        row.payout && `paid ${row.payout}`,
        row.monthlyProfit != null && <>≈ <Amt value={row.monthlyProfit} usd={usd} />/mo{row.profit_rate == null && ' expected'}</>
      ]} />
    </>
  )
}

function DepositBody({ row, usd }) {
  const pct = termProgress(row)
  const term = row.start_date && row.maturity_date
    ? `${fmtDate(row.start_date)} → ${fmtDate(row.maturity_date)}`
    : row.maturity_date && `matures ${fmtDate(row.maturity_date)}`

  return (
    <>
      <div className="flex items-center gap-2">
        <Cur usd={usd} />
        <span className="text-2xl font-semibold text-white">{fmtMoney(row.amount)}</span>
      </div>
      <Detail parts={[row.profit_rate != null && `${row.profit_rate}% p.a.`, term]} />
      {pct != null && (
        <div
          role="progressbar"
          aria-label="Term elapsed"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="mt-3 h-1 rounded-full bg-dark-600 overflow-hidden"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      )}
      {row.matured ? (
        <div className="mt-2">
          <span className="inline-block text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
            Matured — move it to cash
          </span>
        </div>
      ) : row.daysLeft != null && (
        <div className="mt-2 text-xs text-slate-400">
          {row.daysLeft} {row.daysLeft === 1 ? 'day' : 'days'} left
        </div>
      )}
      {row.expectedProfit != null && (
        <div className="mt-1 text-xs text-slate-500">
          Expected profit <span className="text-gain">+<Amt value={row.expectedProfit} usd={usd} /></span>{' '}
          {row.matured ? 'included' : 'at maturity'}
        </div>
      )}
    </>
  )
}

export default function SavingsDeposits({ summary, onUpdate }) {
  const [form, setForm] = useState(null) // null = closed; else the add/edit form (id set when editing)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({}) // unsaved inline balance edits, by row id
  const formRef = useRef(null)

  const cash = summary?.cash || []
  const rows = [...cash.filter(a => a.type === 'savings'), ...cash.filter(a => a.type === 'deposit')]
  const savings = form?.type === 'savings'

  // A pencil on a card far below the form should still bring the form into view.
  useEffect(() => {
    if (form?.id) formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [form?.id])

  const set = patch => setForm(f => ({ ...f, ...patch }))

  function openForm(next) {
    setError('')
    setForm(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const err = form.id
      ? await send('PUT', `/api/cash/${form.id}`, toPayload(form))
      : await send('POST', '/api/cash', toPayload(form))
    setSaving(false)
    if (err) return setError(err)
    setForm(null)
    onUpdate()
  }

  async function saveBalance(row) {
    const amount = parseFloat(draft[row.id])
    if (Number.isNaN(amount)) return alert('Enter a valid balance.')
    const err = await send('PUT', `/api/cash/${row.id}`, { ...row, amount })
    if (err) return alert(err)
    setDraft(prev => { const n = { ...prev }; delete n[row.id]; return n })
    onUpdate()
  }

  async function handleDelete(row) {
    if (!confirm(`Delete "${row.name}"? This can't be undone.`)) return
    const err = await send('DELETE', `/api/cash/${row.id}`)
    if (err) return alert(err)
    if (form?.id === row.id) setForm(null)
    onUpdate()
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Savings & Deposits</h3>
        <button
          onClick={() => (form ? setForm(null) : openForm({ ...EMPTY }))}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-light transition-colors"
        >
          {form ? <X size={14} /> : <Plus size={14} />}
          {form ? 'Cancel' : 'Add'}
        </button>
      </div>

      {form && (
        <form ref={formRef} onSubmit={handleSubmit} className="mb-4 p-4 bg-dark-700 rounded-lg space-y-3 scroll-mt-4 animate-fade-in">
          <div role="group" aria-label="Account type" className="flex items-center gap-1 p-1 bg-dark-600 rounded-lg w-fit">
            {[['savings', 'Savings'], ['deposit', 'Fixed deposit']].map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => set({ type })}
                aria-pressed={form.type === type}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  form.type === type ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Name" className="sm:col-span-2">
              <input
                type="text"
                value={form.name}
                onChange={e => set({ name: e.target.value })}
                placeholder={savings ? 'e.g. Emergency fund' : 'e.g. 12-month deposit'}
                required
                className={INPUT}
              />
            </Field>
            <Field label={savings ? 'Balance' : 'Principal'}>
              <input
                type="number"
                step="any"
                value={form.amount}
                onChange={e => set({ amount: e.target.value })}
                required
                className={INPUT}
              />
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={e => set({ currency: e.target.value })} className={INPUT}>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Profit rate % p.a.">
              <input
                type="number"
                step="any"
                value={form.profit_rate}
                onChange={e => set({ profit_rate: e.target.value })}
                placeholder="e.g. 4.5"
                className={INPUT}
              />
            </Field>
            {savings ? (
              <>
                <Field label="Payout">
                  <select value={form.payout} onChange={e => set({ payout: e.target.value })} className={INPUT}>
                    <option value="monthly">Monthly</option>
                    <option value="daily">Daily</option>
                  </select>
                </Field>
                <Field label="Or expected profit / month" className="sm:col-span-2">
                  <input
                    type="number"
                    step="any"
                    value={form.expected_profit}
                    onChange={e => set({ expected_profit: e.target.value })}
                    placeholder="Replaces the rate"
                    className={INPUT}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Start date">
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => set({ start_date: e.target.value })}
                    className={`${INPUT} [color-scheme:dark]`}
                  />
                </Field>
                <Field label="Maturity date">
                  <input
                    type="date"
                    value={form.maturity_date}
                    onChange={e => set({ maturity_date: e.target.value })}
                    required
                    className={`${INPUT} [color-scheme:dark]`}
                  />
                </Field>
                <Field label="Or expected profit at maturity">
                  <input
                    type="number"
                    step="any"
                    value={form.expected_profit}
                    onChange={e => set({ expected_profit: e.target.value })}
                    placeholder="If the bank quoted one"
                    className={INPUT}
                  />
                </Field>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Check size={14} />
              {form.id ? 'Save' : 'Add'}
            </button>
            {error && <p role="alert" className="text-xs text-loss">{error}</p>}
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm">No savings or deposits yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(row => {
            const usd = row.currency === 'USD'
            return (
              <div key={row.id} className="p-4 bg-dark-700 rounded-xl border border-dark-500 hover:border-dark-400 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm text-slate-300 truncate">{row.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-slate-500 px-2 py-0.5 bg-dark-600 rounded">{row.currency}</span>
                    <button
                      onClick={() => openForm(toForm(row))}
                      aria-label={`Edit ${row.name}`}
                      className="p-1.5 text-slate-500 hover:text-accent transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      aria-label={`Delete ${row.name}`}
                      className="p-1.5 text-slate-500 hover:text-loss transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {row.type === 'deposit' ? (
                  <DepositBody row={row} usd={usd} />
                ) : (
                  <SavingsBody
                    row={row}
                    usd={usd}
                    value={draft[row.id] ?? row.amount}
                    dirty={row.id in draft}
                    onChange={v => setDraft(prev => ({ ...prev, [row.id]: v }))}
                    onSave={() => saveBalance(row)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
