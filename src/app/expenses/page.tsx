'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Receipt, Plus, Search, Download, X, TrendingDown } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Expense {
  id: string
  expense_date: string
  category: string
  description: string
  amount: number
  currency: 'CAD' | 'USD'
  vendor: string
  receipt_ref: string
  notes: string
  created_at: string
}

const CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Shipping', 'Marketing',
  'Office Supplies', 'Equipment', 'Insurance', 'Professional Fees', 'Other',
]

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  Rent:              { bg: '#eff6ff', color: '#2563eb' },
  Utilities:         { bg: '#f0fdf4', color: '#16a34a' },
  Salaries:          { bg: '#faf5ff', color: '#7c3aed' },
  Shipping:          { bg: '#fff7ed', color: '#ea580c' },
  Marketing:         { bg: '#fdf2f8', color: '#db2777' },
  'Office Supplies': { bg: '#f0fdfa', color: '#0d9488' },
  Equipment:         { bg: '#fefce8', color: '#ca8a04' },
  Insurance:         { bg: '#f1f5f9', color: '#475569' },
  'Professional Fees': { bg: '#fef2f2', color: '#dc2626' },
  Other:             { bg: '#f8fafc', color: '#64748b' },
}

const emptyForm = {
  expense_date: new Date().toISOString().slice(0, 10),
  category: 'Other',
  vendor: '',
  description: '',
  amount: '',
  currency: 'CAD' as 'CAD' | 'USD',
  receipt_ref: '',
  notes: '',
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchExpenses() }, [])

  async function fetchExpenses() {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditExpense(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  function openEdit(e: Expense) {
    setEditExpense(e)
    setForm({
      expense_date: e.expense_date || '',
      category: e.category || 'Other',
      vendor: e.vendor || '',
      description: e.description || '',
      amount: e.amount != null ? String(e.amount) : '',
      currency: (e.currency as 'CAD' | 'USD') || 'CAD',
      receipt_ref: e.receipt_ref || '',
      notes: e.notes || '',
    })
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!form.expense_date || !form.amount) return
    setSaving(true)
    const payload = {
      expense_date: form.expense_date,
      category: form.category,
      vendor: form.vendor.trim(),
      description: form.description.trim(),
      amount: parseFloat(form.amount) || 0,
      currency: form.currency,
      receipt_ref: form.receipt_ref.trim(),
      notes: form.notes.trim(),
    }
    if (editExpense) {
      await supabase.from('expenses').update(payload).eq('id', editExpense.id)
    } else {
      await supabase.from('expenses').insert([payload])
    }
    setSaving(false)
    setShowModal(false)
    setEditExpense(null)
    fetchExpenses()
  }

  async function handleDelete() {
    if (!editExpense) return
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', editExpense.id)
    setShowModal(false)
    setEditExpense(null)
    fetchExpenses()
  }

  function handleExport() {
    const rows = filtered.map(e => ({
      Date: e.expense_date,
      Category: e.category,
      Vendor: e.vendor || '',
      Description: e.description || '',
      Amount: e.amount,
      Currency: e.currency,
      'Receipt Ref': e.receipt_ref || '',
      Notes: e.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Expenses')
    XLSX.writeFile(wb, `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // KPI calculations
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisYear = String(now.getFullYear())

  const monthExpenses = expenses.filter(e => e.expense_date?.startsWith(thisMonth))
  const monthCAD = monthExpenses.filter(e => e.currency === 'CAD').reduce((s, e) => s + (e.amount || 0), 0)
  const monthUSD = monthExpenses.filter(e => e.currency === 'USD').reduce((s, e) => s + (e.amount || 0), 0)
  const yearTotal = expenses
    .filter(e => e.expense_date?.startsWith(thisYear) && e.currency === 'CAD')
    .reduce((s, e) => s + (e.amount || 0), 0)

  // Available months for filter
  const months = Array.from(new Set(expenses.map(e => e.expense_date?.slice(0, 7)).filter(Boolean))).sort().reverse()

  const filtered = expenses.filter(e => {
    const matchSearch = !search ||
      e.vendor?.toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase()) ||
      e.category?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCategory || e.category === filterCategory
    const matchMonth = !filterMonth || e.expense_date?.startsWith(filterMonth)
    return matchSearch && matchCat && matchMonth
  })

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }

  return (
    <MainLayout>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: `${now.toLocaleString('default', { month: 'long' })} Total (CAD)`, value: `$${monthCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#2563eb', bg: '#eff6ff' },
          { label: `${now.toLocaleString('default', { month: 'long' })} Total (USD)`, value: `$${monthUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#7c3aed', bg: '#faf5ff' },
          { label: `${thisYear} YTD (CAD)`, value: `$${yearTotal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#16a34a', bg: '#f0fdf4' },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', background: card.bg, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={16} color={card.color} />
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{card.label}</div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px' }}>
            <Search size={15} color='#94a3b8' />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search vendor, description...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '200px' }} />
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#fff', outline: 'none', color: filterCategory ? '#1e293b' : '#94a3b8' }}>
            <option value=''>All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#fff', outline: 'none', color: filterMonth ? '#1e293b' : '#94a3b8' }}>
            <option value=''>All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {(filterCategory || filterMonth || search) && (
            <button onClick={() => { setFilterCategory(''); setFilterMonth(''); setSearch('') }} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> Export
          </button>
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <Receipt size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No expenses found
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Date', 'Category', 'Vendor', 'Description', 'Amount', 'Ref'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const catStyle = CATEGORY_COLORS[e.category] || CATEGORY_COLORS['Other']
                return (
                  <tr
                    key={e.id}
                    onClick={() => openEdit(e)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '13px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>{e.expense_date}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ display: 'inline-block', background: catStyle.bg, color: catStyle.color, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap' }}>
                        {e.category}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#374151', fontWeight: '500' }}>{e.vendor || '—'}</td>
                    <td style={{ padding: '13px 16px', color: '#64748b', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '—'}</td>
                    <td style={{ padding: '13px 16px', color: '#1e293b', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      <span style={{ color: e.currency === 'USD' ? '#7c3aed' : '#1e293b' }}>
                        {e.currency} ${(e.amount || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>{e.receipt_ref || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={4} style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                  {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {['CAD', 'USD'].map(cur => {
                    const total = filtered.filter(e => e.currency === cur).reduce((s, e) => s + (e.amount || 0), 0)
                    if (total === 0) return null
                    return (
                      <div key={cur} style={{ fontSize: '13px', fontWeight: '700', color: cur === 'USD' ? '#7c3aed' : '#1e293b', whiteSpace: 'nowrap' }}>
                        {cur} ${total.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )
                  })}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '40px 16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '520px', maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>{editExpense ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={() => { setShowModal(false); setEditExpense(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={lbl}>Date *</label>
                <input type='date' value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inp}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Amount *</label>
                <input type='number' min='0' step='0.01' value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder='0.00' style={inp} />
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '8px', padding: '3px' }}>
                  {(['CAD', 'USD'] as const).map(cur => (
                    <button key={cur} onClick={() => setForm({ ...form, currency: cur })} style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', background: form.currency === cur ? '#fff' : 'transparent', color: form.currency === cur ? '#1e293b' : '#64748b', boxShadow: form.currency === cur ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                      {cur}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Vendor</label>
                <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder='Company or individual name' style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder='Brief description of the expense' style={inp} />
              </div>
              <div>
                <label style={lbl}>Receipt Ref</label>
                <input value={form.receipt_ref} onChange={e => setForm({ ...form, receipt_ref: e.target.value })} placeholder='INV-001 or file name' style={inp} />
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder='Optional notes' style={inp} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
              <div>
                {editExpense && (
                  <button onClick={handleDelete} style={{ padding: '8px 18px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowModal(false); setEditExpense(null) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                  {saving ? 'Saving...' : editExpense ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
