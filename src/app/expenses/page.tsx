'use client'

import { useEffect, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, Download, Upload, X, Paperclip, AlertTriangle, Eye } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Expense {
  id: string
  expense_date: string
  category: string
  type: string
  payee: string
  category2: string
  description: string
  amount_before_tax: number
  sales_tax: number
  freight_tip: number
  total_amount: number
  reference: string
  payment_method: string
  amount_usd: number | null
  exchange_rate: number | null
  currency: string
  receipt_url: string | null
  created_at: string
}

const CATEGORIES = [
  'RENT', 'UTILITIES', 'BANK FEES', 'AMEX & VISA FEE', 'VEHICLE LEASE',
  'VEHICLE INSURANCE', 'COMMERCIAL INSURANCE', 'GAS', 'INTERNET', 'CELLPHONE',
  'PAYROLL', 'CPP', 'HOME OFFICE', 'MEDICAL REIMBURSEMENT', 'ADVERTISING',
  'OFFICE SUPPLIES', 'SHIPPING', 'PROFESSIONAL FEES', 'OTHER',
]

const PAYMENT_METHODS = ['Direct Deposit', 'Cheque', 'Credit Card (AMEX)', 'Credit Card (VISA)', 'Cash', 'E-Transfer', 'Wire Transfer', 'Other']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const COMPANY = {
  name: 'ESHC Inc.',
  bn: '752458133',
  industry: 'Wholesale and Distribution',
  email: 'info@iampurebeauty.com',
  website: 'www.iampurebeauty.com',
}

const COL_HEADERS = [
  'Date', 'Category', 'Type', 'Payee', 'Category2', 'Description',
  'Total before sales tax', 'Sales tax', 'Freight/Tip', 'Total',
  'Reference', 'Methods of payment', 'USD', 'Exchange Rate',
]

const emptyForm = {
  expense_date: '',
  category: '',
  type: '',
  payee: '',
  category2: '',
  description: '',
  amount_before_tax: '',
  sales_tax: '',
  freight_tip: '',
  reference: '',
  payment_method: '',
  amount_usd: '',
  exchange_rate: '',
  currency: 'CAD',
}

function excelSerialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569)
  const d = new Date(utcDays * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default function Expenses() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthIdx = now.getMonth()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [activeYear, setActiveYear] = useState(currentYear)
  const [activeMonth, setActiveMonth] = useState(currentMonthIdx)
  const [showModal, setShowModal] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [saveError, setSaveError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const inlineUploadRef = useRef<HTMLInputElement>(null)
  const [inlineUploadTarget, setInlineUploadTarget] = useState<Expense | null>(null)
  const [inlineUploadingId, setInlineUploadingId] = useState<string | null>(null)

  useEffect(() => { fetchExpenses(activeYear) }, [activeYear])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showImportConfirm) { setShowImportConfirm(false); setPendingImport(null); return }
      if (showModal) { setShowModal(false); setEditExpense(null); setSaveError('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal, showImportConfirm])

  async function fetchExpenses(year: number) {
    setLoading(true)
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .gte('expense_date', `${year}-01-01`)
      .lte('expense_date', `${year}-12-31`)
      .order('expense_date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  const monthExpenses = expenses.filter(e => {
    const m = parseInt((e.expense_date || '').slice(5, 7)) - 1
    return m === activeMonth
  })

  // KPI
  const kpiMonthStr = `${activeYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`
  const thisMonth = expenses.filter(e => e.expense_date?.startsWith(kpiMonthStr))
  const kpiCAD = thisMonth.reduce((s, e) => s + (e.total_amount || 0), 0)
  const kpiUSD = thisMonth.reduce((s, e) => s + (e.amount_usd || 0), 0)
  const ytdCAD = expenses.reduce((s, e) => s + (e.total_amount || 0), 0)

  const monthTotal = monthExpenses.reduce((s, e) => s + (e.total_amount || 0), 0)
  const monthBeforeTax = monthExpenses.reduce((s, e) => s + (e.amount_before_tax || 0), 0)
  const monthSalesTax = monthExpenses.reduce((s, e) => s + (e.sales_tax || 0), 0)
  const monthFreight = monthExpenses.reduce((s, e) => s + (e.freight_tip || 0), 0)

  const computedTotal =
    (parseFloat(form.amount_before_tax) || 0) +
    (parseFloat(form.sales_tax) || 0) +
    (parseFloat(form.freight_tip) || 0)

  function withAutoRate(patch: Partial<typeof form>): typeof form {
    const next = { ...form, ...patch }
    const usd = parseFloat(next.amount_usd)
    const cad = (parseFloat(next.amount_before_tax) || 0) + (parseFloat(next.sales_tax) || 0) + (parseFloat(next.freight_tip) || 0)
    if (usd > 0 && cad > 0) next.exchange_rate = (cad / usd).toFixed(4)
    return next
  }

  function openAdd() {
    setEditExpense(null)
    setReceiptFile(null)
    setSaveError('')
    const d = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}-01`
    setForm({ ...emptyForm, expense_date: d })
    setShowModal(true)
  }

  function openEdit(e: Expense) {
    setEditExpense(e)
    setReceiptFile(null)
    setSaveError('')
    setForm({
      expense_date: e.expense_date || '',
      category: e.category || '',
      type: e.type || '',
      payee: e.payee || '',
      category2: e.category2 || '',
      description: e.description || '',
      amount_before_tax: e.amount_before_tax != null ? String(e.amount_before_tax) : '',
      sales_tax: e.sales_tax != null ? String(e.sales_tax) : '',
      freight_tip: e.freight_tip != null ? String(e.freight_tip) : '',
      reference: e.reference || '',
      payment_method: e.payment_method || '',
      amount_usd: e.amount_usd != null ? String(e.amount_usd) : '',
      exchange_rate: e.exchange_rate != null ? String(e.exchange_rate) : '',
      currency: e.currency || 'CAD',
    })
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!form.expense_date) return
    setSaving(true)
    setSaveError('')

    const total = (parseFloat(form.amount_before_tax) || 0) + (parseFloat(form.sales_tax) || 0) + (parseFloat(form.freight_tip) || 0)

    const basePayload = {
      expense_date: form.expense_date,
      category: form.category || null,
      type: form.type || null,
      payee: form.payee || null,
      category2: form.category2 || null,
      description: form.description || null,
      amount_before_tax: parseFloat(form.amount_before_tax) || 0,
      sales_tax: parseFloat(form.sales_tax) || 0,
      freight_tip: parseFloat(form.freight_tip) || 0,
      total_amount: total,
      reference: form.reference || null,
      payment_method: form.payment_method || null,
      amount_usd: form.amount_usd ? parseFloat(form.amount_usd) : null,
      exchange_rate: form.exchange_rate ? parseFloat(form.exchange_rate) : null,
      currency: form.currency || 'CAD',
    }

    let expenseId: string | null = null
    let dbError: any = null

    if (editExpense) {
      const { error } = await supabase.from('expenses').update({ ...basePayload, receipt_url: editExpense.receipt_url }).eq('id', editExpense.id)
      dbError = error
      expenseId = editExpense.id
    } else {
      const { data: inserted, error } = await supabase.from('expenses').insert([{ ...basePayload, receipt_url: null }]).select('id').single()
      dbError = error
      expenseId = inserted?.id ?? null
    }

    if (dbError) {
      console.error('Expense save error:', dbError)
      setSaveError(dbError.message || 'Failed to save expense. Please try again.')
      setSaving(false)
      return
    }

    if (receiptFile && expenseId) {
      setUploadingReceipt(true)
      const ext = receiptFile.name.split('.').pop() || 'bin'
      const path = `${expenseId}/${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from('receipts').upload(path, receiptFile)
      if (upErr) {
        console.error('Receipt upload error:', upErr)
      } else if (up) {
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(up.path)
        await supabase.from('expenses').update({ receipt_url: urlData.publicUrl }).eq('id', expenseId)
      }
      setUploadingReceipt(false)
    }

    setSaving(false)
    setShowModal(false)
    setEditExpense(null)
    fetchExpenses(activeYear)
  }

  function triggerInlineUpload(ev: React.MouseEvent, expense: Expense) {
    ev.stopPropagation()
    setInlineUploadTarget(expense)
    inlineUploadRef.current?.click()
  }

  async function handleInlineReceiptChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file || !inlineUploadTarget) return
    const expense = inlineUploadTarget
    setInlineUploadTarget(null)
    setInlineUploadingId(expense.id)
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${expense.id}/${Date.now()}.${ext}`
    const { data: up, error: upErr } = await supabase.storage.from('receipts').upload(path, file)
    if (!upErr && up) {
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(up.path)
      const receipt_url = urlData.publicUrl
      await supabase.from('expenses').update({ receipt_url }).eq('id', expense.id)
      setExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, receipt_url } : ex))
    }
    setInlineUploadingId(null)
  }

  async function handleDelete() {
    if (!editExpense) return
    if (!confirm('Delete this expense? This cannot be undone.')) return
    if (editExpense.receipt_url) {
      const parts = editExpense.receipt_url.split('/receipts/')
      if (parts[1]) await supabase.storage.from('receipts').remove([parts[1]])
    }
    await supabase.from('expenses').delete().eq('id', editExpense.id)
    setShowModal(false)
    setEditExpense(null)
    fetchExpenses(activeYear)
  }

  function openReceiptViewer(url: string) {
    const lower = url.toLowerCase()
    if (lower.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/)) {
      setViewerUrl(url)
    } else {
      window.open(url, '_blank')
    }
  }

  function handleExport() {
    const dataRows = monthExpenses.map(e => [
      e.expense_date,
      e.category || '',
      e.type || '',
      e.payee || '',
      e.category2 || '',
      e.description || '',
      e.amount_before_tax || 0,
      e.sales_tax || 0,
      e.freight_tip || 0,
      e.total_amount || 0,
      e.reference || '',
      e.payment_method || '',
      e.amount_usd ?? '',
      e.exchange_rate ?? '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([
      [`Corporation Name: ${COMPANY.name}`],
      [`Business Number(BN): ${COMPANY.bn}`],
      [`Industry: ${COMPANY.industry}`],
      [`Company Email: ${COMPANY.email}`],
      [`Website: ${COMPANY.website}`],
      COL_HEADERS,
      ...dataRows,
    ])
    // Column widths
    ws['!cols'] = [10, 22, 12, 24, 16, 28, 14, 10, 10, 10, 14, 16, 10, 12].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, MONTHS[activeMonth])
    XLSX.writeFile(wb, `expenses_${activeYear}_${MONTHS[activeMonth]}.xlsx`)
  }

  function handleImportSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingImport(file)
    setShowImportConfirm(true)
    e.target.value = ''
  }

  async function confirmImport() {
    setShowImportConfirm(false)
    if (!pendingImport) return
    setImporting(true)
    setImportResult('')
    try {
      const buffer = await pendingImport.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      let inserted = 0, failed = 0

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
        // Data starts at row 6 (index 5); skip header/empty rows
        const dataRows = rows.slice(5)
        for (const row of dataRows) {
          const rawDate = row[0]
          if (!rawDate) continue
          const firstStr = String(rawDate).trim().toLowerCase()
          if (firstStr === 'date' || firstStr === '') continue

          let expense_date: string
          if (rawDate instanceof Date) {
            expense_date = `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`
          } else if (typeof rawDate === 'number') {
            expense_date = excelSerialToDate(rawDate)
          } else {
            const parsed = new Date(String(rawDate))
            expense_date = isNaN(parsed.getTime()) ? String(rawDate).slice(0, 10) : parsed.toISOString().slice(0, 10)
          }
          if (!expense_date || expense_date.length < 10) continue

          const num = (v: any) => { const n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n }
          const str = (v: any) => String(v ?? '').trim()

          const beforeTax = num(row[6])
          const salesTax = num(row[7])
          const freight = num(row[8])
          const total = num(row[9]) || (beforeTax + salesTax + freight)
          const usd = num(row[12])
          const rate = num(row[13])

          const payload = {
            expense_date,
            category: str(row[1]) || null,
            type: str(row[2]) || null,
            payee: str(row[3]) || null,
            category2: str(row[4]) || null,
            description: str(row[5]) || null,
            amount_before_tax: beforeTax,
            sales_tax: salesTax,
            freight_tip: freight,
            total_amount: total,
            reference: str(row[10]) || null,
            payment_method: str(row[11]) || null,
            amount_usd: usd || null,
            exchange_rate: rate || null,
            currency: 'CAD',
          }
          const { error } = await supabase.from('expenses').insert([payload])
          if (error) failed++; else inserted++
        }
      }
      setImportResult(`✅ ${inserted} rows imported.${failed > 0 ? ` ❌ ${failed} failed.` : ''}`)
      fetchExpenses(activeYear)
    } catch {
      setImportResult('❌ Error reading file. Please check the format.')
    }
    setImporting(false)
    setPendingImport(null)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '5px' }
  const numInp: React.CSSProperties = { ...inp, textAlign: 'right' as const }

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .modal-grid-2, .modal-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: `${MONTHS[currentMonthIdx]} ${activeYear} (CAD)`, value: `$${formatCurrency(kpiCAD)}`, color: '#dc2626' },
          { label: `${MONTHS[currentMonthIdx]} ${activeYear} (USD)`, value: kpiUSD > 0 ? `$${formatCurrency(kpiUSD)}` : '—', color: '#7c3aed' },
          { label: `${activeYear} YTD (CAD)`, value: `$${formatCurrency(ytdCAD)}`, color: '#2563eb' },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Year Dropdown */}
      <div style={{ marginBottom: '12px' }}>
        <select value={activeYear} onChange={e => setActiveYear(Number(e.target.value))} style={{ height: '36px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', fontSize: '14px', fontWeight: '500', color: '#1e293b', cursor: 'pointer', outline: 'none' }}>
          {Array.from({ length: 21 }, (_, i) => 2020 + i).map(yr => (
            <option key={yr} value={yr}>{yr}</option>
          ))}
        </select>
      </div>

      {/* Month Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '3px', gap: '1px' }}>
          {MONTHS.map((m, i) => {
            const hasData = expenses.some(e => parseInt((e.expense_date || '').slice(5, 7)) - 1 === i)
            return (
              <button
                key={m}
                onClick={() => setActiveMonth(i)}
                style={{ padding: '6px 11px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: activeMonth === i ? '600' : '400', background: activeMonth === i ? '#fff' : 'transparent', color: activeMonth === i ? '#1e293b' : hasData ? '#475569' : '#94a3b8', boxShadow: activeMonth === i ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s', position: 'relative' as const }}
              >
                {m}
                {hasData && activeMonth !== i && <span style={{ position: 'absolute', top: '4px', right: '4px', width: '4px', height: '4px', background: '#2563eb', borderRadius: '50%' }} />}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            <Upload size={14} /> {importing ? 'Importing...' : 'Import Excel'}
            <input ref={importRef} type='file' accept='.xlsx,.xls' onChange={handleImportSelect} style={{ display: 'none' }} />
          </label>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> Export {MONTHS[activeMonth]} {activeYear}
          </button>
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={15} /> Add Expense
          </button>
        </div>
      </div>

      {importResult && (
        <div style={{ background: importResult.includes('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${importResult.includes('✅') ? '#bbf7d0' : '#fecaca'}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', fontSize: '13px', color: importResult.includes('✅') ? '#16a34a' : '#dc2626' }}>
          {importResult}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1200px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Date', 'Category', 'Type', 'Payee', 'Category2', 'Description', 'Before Tax', 'Sales Tax', 'Freight/Tip', 'Total', 'Reference', 'Payment', 'Rate', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: ['Before Tax', 'Sales Tax', 'Freight/Tip', 'Total', 'Rate'].includes(h) ? 'right' : 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthExpenses.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    No expenses for {MONTHS[activeMonth]} {activeYear}
                  </td>
                </tr>
              ) : monthExpenses.map((e, i) => (
                <tr
                  key={e.id}
                  onClick={() => openEdit(e)}
                  style={{ borderBottom: i < monthExpenses.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                  onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                  onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{e.expense_date}</td>
                  <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: '500', whiteSpace: 'nowrap' }}>{e.category || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{e.type || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#374151', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.payee || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{e.category2 || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{e.amount_before_tax ? `$${formatCurrency(e.amount_before_tax)}` : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{e.sales_tax ? `$${formatCurrency(e.sales_tax)}` : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{e.freight_tip ? `$${formatCurrency(e.freight_tip)}` : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap' }}>${formatCurrency(e.total_amount || 0)}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '12px' }}>{e.reference || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{e.payment_method || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>{e.exchange_rate ?? '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {inlineUploadingId === e.id ? (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>...</span>
                    ) : e.receipt_url ? (
                      <button
                        onClick={ev => { ev.stopPropagation(); openReceiptViewer(e.receipt_url!) }}
                        title='View receipt'
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '2px', display: 'inline-flex' }}
                      >
                        <Paperclip size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={ev => triggerInlineUpload(ev, e)}
                        title='Upload receipt'
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px', display: 'inline-flex' }}
                      >
                        <Paperclip size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {monthExpenses.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={6} style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                    {monthExpenses.length} record{monthExpenses.length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>${formatCurrency(monthBeforeTax)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>${formatCurrency(monthSalesTax)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>${formatCurrency(monthFreight)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap' }}>${formatCurrency(monthTotal)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditExpense(null); setSaveError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '32px 16px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '660px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>{editExpense ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={() => { setShowModal(false); setEditExpense(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            <div className="modal-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              {/* Row 1 */}
              <div>
                <label style={lbl}>Date *</label>
                <input type='date' value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inp}>
                  <option value=''>Select...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Type</label>
                <input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder='e.g. Monthly' style={inp} />
              </div>

              {/* Payee full-width */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Payee</label>
                <input value={form.payee} onChange={e => setForm({ ...form, payee: e.target.value })} placeholder='Vendor or payee name' style={inp} />
              </div>

              <div>
                <label style={lbl}>Category2</label>
                <input value={form.category2} onChange={e => setForm({ ...form, category2: e.target.value })} style={inp} />
              </div>
              <div style={{ gridColumn: '2 / -1' }}>
                <label style={lbl}>Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder='Details...' style={inp} />
              </div>

              {/* Amounts */}
              <div>
                <label style={lbl}>Before Tax ($)</label>
                <input type='number' step='0.01' min='0' value={form.amount_before_tax} onChange={e => setForm(withAutoRate({ amount_before_tax: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Sales Tax ($)</label>
                <input type='number' step='0.01' min='0' value={form.sales_tax} onChange={e => setForm(withAutoRate({ sales_tax: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Freight / Tip ($)</label>
                <input type='number' step='0.01' min='0' value={form.freight_tip} onChange={e => setForm(withAutoRate({ freight_tip: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>

              {/* Auto-calculated total */}
              <div style={{ gridColumn: '1 / -1', background: '#f8fafc', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Total Amount (auto)</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>${formatCurrency(computedTotal)}</span>
              </div>

              {/* Payment */}
              <div>
                <label style={lbl}>Reference</label>
                <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder='INV-001' style={inp} />
              </div>
              <div>
                <label style={lbl}>Exchange Rate <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(auto)</span></label>
                <input type='number' step='0.0001' min='0' value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} placeholder='1.3500' style={{ ...numInp, background: '#f0fdf4', borderColor: '#86efac' }} />
              </div>
              <div>
                <label style={lbl}>Amount (USD)</label>
                <input type='number' step='0.01' min='0' value={form.amount_usd} onChange={e => setForm(withAutoRate({ amount_usd: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} style={inp}>
                  <option value=''>Select...</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Currency</label>
                <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '8px', padding: '3px' }}>
                  {(['CAD', 'USD'] as const).map(c => (
                    <button key={c} onClick={() => setForm({ ...form, currency: c })} style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', background: form.currency === c ? '#fff' : 'transparent', color: form.currency === c ? '#1e293b' : '#64748b', boxShadow: form.currency === c ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>{c}</button>
                  ))}
                </div>
              </div>

              {/* Receipt Upload */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Receipt</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#64748b', flex: 1 }}>
                    <Paperclip size={14} />
                    {receiptFile ? receiptFile.name : editExpense?.receipt_url ? 'Replace receipt...' : 'Upload receipt (jpg / png / pdf)'}
                    <input type='file' accept='.jpg,.jpeg,.png,.pdf' onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                  </label>
                  {editExpense?.receipt_url && !receiptFile && (
                    <button onClick={() => openReceiptViewer(editExpense.receipt_url!)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer' }}>
                      <Eye size={14} /> View
                    </button>
                  )}
                </div>
              </div>
            </div>

            {saveError && (
              <div style={{ marginTop: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid #f1f5f9' }}>
              <div>
                {editExpense && (
                  <button onClick={handleDelete} style={{ padding: '8px 18px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowModal(false); setEditExpense(null); setSaveError('') }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleSubmit} disabled={saving || uploadingReceipt} style={{ padding: '8px 20px', background: saving || uploadingReceipt ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                  {uploadingReceipt ? 'Uploading...' : saving ? 'Saving...' : editExpense ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {showImportConfirm && (
        <div className="modal-overlay" onClick={() => { setShowImportConfirm(false); setPendingImport(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '460px', margin: '20px auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={20} color='#dc2626' />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Import Confirmation</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', marginBottom: '8px' }}>
              Each month sheet will be read starting from row 6. Data will be inserted as new records — existing records will not be deleted or overwritten.
            </p>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>
              File: <strong>{pendingImport?.name}</strong>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowImportConfirm(false); setPendingImport(null) }} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={confirmImport} style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Yes, Import</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden inline receipt upload input */}
      <input ref={inlineUploadRef} type='file' accept='image/*,application/pdf' style={{ display: 'none' }} onChange={handleInlineReceiptChange} />

      {/* Receipt Image Viewer */}
      {viewerUrl && (
        <div
          onClick={() => setViewerUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, cursor: 'zoom-out' }}
        >
          <img
            src={viewerUrl}
            alt='Receipt'
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', cursor: 'default' }}
          />
          <button
            onClick={() => setViewerUrl(null)}
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </MainLayout>
  )
}
