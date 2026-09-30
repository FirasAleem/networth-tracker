import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, X, Check, Pencil } from 'lucide-react'
import RiyalSymbol from './RiyalSymbol'
import { fmtMoney } from '../lib/format'
import { today, fmtDate } from '../lib/dates'
import { send } from '../lib/api'

const INPUT = 'w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-accent'
// New plans default to the owner's usual SNB Smart Payment Plan: 5% a month for 12 months.
const EMPTY = { id: null, kind: 'balloon', name: '', total: '', monthly_pct: '5', count: '12', paid: 0, first_due: '' }
const KINDS = [['balloon', 'Balloon (SNB Smart)'], ['equal', 'Equal installments']]

// A due date, with the year only when it isn't the current one.
const dueDate = d => fmtDate(d, d.slice(0, 4) !== today().slice(0, 4))

function Field({ label, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

// Inline SAR amount for the small muted lines (never breaks between glyph and number).
function Sar({ value }) {
  return <span className="whitespace-nowrap"><RiyalSymbol size={10} />{' '}{fmtMoney(value)}</span>
}

export default function Installments({ summary, onUpdate }) {
  const [form, setForm] = useState(null) // null = closed; else the add/edit form (id set when editing)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef(null)

  const plans = summary?.installments || []
  const owed = summary?.installmentsTotal || 0

  // Live preview while the form is being filled in; stays null until the inputs are valid.
  // A balloon plan needs monthly % × months < 100 so there is something left for the balloon.
  const balloon = form?.kind === 'balloon'
  const total = Number(form?.total)
  const count = Number(form?.count)
  const pct = Number(form?.monthly_pct)
  const valid = total > 0 && Number.isInteger(count) && count >= 1 && (!balloon || (pct > 0 && pct * count < 100))
  const per = valid ? (balloon ? total * pct / 100 : total / count) : null

  // A pencil on a plan far below the form should still bring the form into view.
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
    const body = { name: form.name.trim(), total, count, monthly_pct: balloon ? pct : null, first_due: form.first_due || null }
    const err = form.id
      ? await send('PUT', `/api/installments/${form.id}`, { ...body, paid: form.paid })
      : await send('POST', '/api/installments', body)
    setSaving(false)
    if (err) return setError(err)
    setForm(null)
    onUpdate()
  }

  // Clicking pip i ticks up to it, or (if it's already paid) undoes back to it.
  // Every PUT carries monthly_pct so a tick can't turn a balloon plan into an equal one.
  async function setPaid(plan, i) {
    const err = await send('PUT', `/api/installments/${plan.id}`, {
      name: plan.name,
      total: plan.total,
      count: plan.count,
      paid: i < plan.paid ? i : i + 1,
      monthly_pct: plan.monthly_pct ?? null,
      first_due: plan.first_due
    })
    if (err) return alert(err)
    onUpdate()
  }

  async function handleDelete(plan) {
    if (!confirm(`Delete "${plan.name}"? This can't be undone.`)) return
    const err = await send('DELETE', `/api/installments/${plan.id}`)
    if (err) return alert(err)
    if (form?.id === plan.id) setForm(null)
    onUpdate()
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Installments</h3>
          {owed > 0 && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm font-medium text-loss">
              <RiyalSymbol size={12} />{fmtMoney(owed)} owed
            </span>
          )}
        </div>
        <button
          onClick={() => (form ? setForm(null) : openForm({ ...EMPTY }))}
          className="shrink-0 flex items-center gap-1 text-xs text-accent hover:text-accent-light transition-colors"
        >
          {form ? <X size={14} /> : <Plus size={14} />}
          {form ? 'Cancel' : 'Add'}
        </button>
      </div>

      {form && (
        <form ref={formRef} onSubmit={handleSubmit} className="mb-4 p-4 bg-dark-700 rounded-lg space-y-3 scroll-mt-4 animate-fade-in">
          <div role="group" aria-label="Plan type" className="flex flex-col sm:flex-row gap-1 p-1 bg-dark-600 rounded-lg sm:w-fit">
            {KINDS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => set({ kind, monthly_pct: form.monthly_pct || '5' })}
                aria-pressed={form.kind === kind}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  form.kind === kind ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`grid grid-cols-2 gap-3 ${balloon ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <Field label="Name" className="col-span-2 sm:col-span-1">
              <input
                type="text"
                value={form.name}
                onChange={e => set({ name: e.target.value })}
                placeholder="iPhone — card"
                required
                className={INPUT}
              />
            </Field>
            <Field label="Total amount" className="col-span-2 sm:col-span-1">
              <input
                type="number"
                step="any"
                value={form.total}
                onChange={e => set({ total: e.target.value })}
                required
                className={INPUT}
              />
            </Field>
            {balloon ? (
              <>
                <Field label="Monthly %">
                  <input
                    type="number"
                    step="any"
                    value={form.monthly_pct}
                    onChange={e => set({ monthly_pct: e.target.value })}
                    required
                    className={INPUT}
                  />
                </Field>
                <Field label="Months">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={form.count}
                    onChange={e => set({ count: e.target.value })}
                    required
                    className={INPUT}
                  />
                </Field>
              </>
            ) : (
              <Field label="Number of installments" className="col-span-2 sm:col-span-1">
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={form.count}
                  onChange={e => set({ count: e.target.value })}
                  required
                  className={INPUT}
                />
              </Field>
            )}
            <Field label="First due date (optional)" className="col-span-2 sm:col-span-1">
              <input
                type="date"
                value={form.first_due}
                onChange={e => set({ first_due: e.target.value })}
                className={`${INPUT} [color-scheme:dark]`}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Check size={14} />
              {form.id ? 'Save' : 'Add'}
            </button>
            {per != null && (
              <span className="text-xs text-slate-400">
                {!balloon && 'Per installment '}<Sar value={per} /> × {count}
                {balloon && <>, then <Sar value={total - per * count} /> balloon</>}
              </span>
            )}
            {error && <p role="alert" className="text-xs text-loss">{error}</p>}
          </div>
        </form>
      )}

      {plans.length === 0 ? (
        <p className="text-slate-500 text-sm">No installment plans yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => {
            const isBalloon = plan.balloon != null
            const balloonNext = isBalloon && plan.paid === plan.count // only the balloon payment is left
            return (
              <div
                key={plan.id}
                className={`p-4 bg-dark-700 rounded-xl border border-dark-500 hover:border-dark-400 transition-colors ${plan.paidOff ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-sm text-slate-300 truncate">{plan.name}</span>
                    {plan.paidOff && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gain/10 text-gain font-medium">
                        Paid off
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openForm({
                        id: plan.id,
                        kind: plan.monthly_pct != null ? 'balloon' : 'equal',
                        name: plan.name,
                        total: plan.total,
                        monthly_pct: plan.monthly_pct ?? '',
                        count: plan.count,
                        paid: plan.paid,
                        first_due: plan.first_due || ''
                      })}
                      aria-label={`Edit ${plan.name}`}
                      className="p-1.5 text-slate-500 hover:text-accent transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(plan)}
                      aria-label={`Delete ${plan.name}`}
                      className="p-1.5 text-slate-500 hover:text-loss transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  <Sar value={plan.perInstallment} /> × {plan.count}
                  {isBalloon && <> + <Sar value={plan.balloon} /> balloon</>}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <RiyalSymbol size={18} className="text-slate-500" />
                  <span className="text-2xl font-semibold text-white">{fmtMoney(plan.remaining)}</span>
                  <span className="text-xs text-slate-500">remaining</span>
                </div>
                {plan.nextDue && (
                  <div className="mt-1 text-xs text-slate-400">
                    {balloonNext ? 'balloon due' : 'next due'} {dueDate(plan.nextDue)}
                    {plan.nextAmount != null && <> · <Sar value={plan.nextAmount} /></>}
                  </div>
                )}

                <div role="group" aria-label={`${plan.name} installments`} className="mt-3 flex flex-wrap gap-1.5">
                  {Array.from({ length: plan.payments ?? plan.count }, (_, i) => {
                    const paid = i < plan.paid
                    const last = isBalloon && i === plan.count // the balloon is the final payment
                    return (
                      <button
                        key={i}
                        onClick={() => setPaid(plan, i)}
                        aria-label={last ? `Mark balloon payment ${paid ? 'unpaid' : 'paid'}` : `Mark installment ${i + 1} ${paid ? 'unpaid' : 'paid'}`}
                        className={`h-5 rounded-full border transition-colors ${last ? 'w-9' : 'w-5'} ${
                          paid ? 'bg-accent border-accent' : 'border-slate-600 hover:border-accent'
                        }`}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
