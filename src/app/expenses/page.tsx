'use client'

import { useEffect, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, Upload, X, Paperclip, AlertTriangle, Eye } from 'lucide-react'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/activityLog'
import UndoToast from '@/components/UndoToast'

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
  receipt_urls: string[] | null
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

function getReceiptUrls(e: Expense): string[] {
  const urls = e.receipt_urls ?? []
  if (e.receipt_url && !urls.includes(e.receipt_url)) return [e.receipt_url, ...urls]
  return urls
}

function getReceiptFilename(url: string): string {
  try {
    const parts = decodeURIComponent(new URL(url).pathname).split('/')
    const last = parts[parts.length - 1]
    // Strip timestamp prefix like "1234567890_filename.pdf"
    return last.replace(/^\d+_/, '')
  } catch {
    return url
  }
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
  const [receiptFiles, setReceiptFiles] = useState<File[]>([])
  const [removedReceiptUrls, setRemovedReceiptUrls] = useState<string[]>([])
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [receiptViewUrls, setReceiptViewUrls] = useState<string[] | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [saveError, setSaveError] = useState('')
  const [inlineUploadError, setInlineUploadError] = useState<string | null>(null)
  const activeMonthRef = useRef(currentMonthIdx)
  useEffect(() => { activeMonthRef.current = activeMonth }, [activeMonth])
  const importRef = useRef<HTMLInputElement>(null)
  const inlineUploadRef = useRef<HTMLInputElement>(null)
  const modalReceiptRef = useRef<HTMLInputElement>(null)
  const [inlineUploadTarget, setInlineUploadTarget] = useState<Expense | null>(null)
  const [inlineUploadingId, setInlineUploadingId] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => { fetchExpenses(activeYear) }, [activeYear])

  useEffect(() => {
    const channel = supabase
      .channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchExpenses(activeYear))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeYear])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (receiptViewUrls) { setReceiptViewUrls(null); return }
      if (viewerUrl) { setViewerUrl(null); return }
      if (showImportConfirm) { setShowImportConfirm(false); setPendingImport(null); return }
      if (showModal) { setShowModal(false); setEditExpense(null); setSaveError('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal, showImportConfirm, receiptViewUrls, viewerUrl])

  async function fetchExpenses(year: number) {
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('expense_date', `${year}-01-01`)
      .lte('expense_date', `${year}-12-31`)
      .order('expense_date', { ascending: false })
    const rows = data || []
    setExpenses(rows)
    // If current month has no data, jump to the most recent month that does
    if (rows.length > 0) {
      const hasCurrentMonth = rows.some(e => parseInt((e.expense_date || '').slice(5, 7)) - 1 === activeMonthRef.current)
      if (!hasCurrentMonth) {
        const months = rows.map(e => parseInt((e.expense_date || '').slice(5, 7)) - 1)
        const latest = Math.max(...months)
        setActiveMonth(latest)
      }
    }
    setLoading(false)
  }

  async function handleExportExcel() {
    setExporting(true)
    const { data } = await supabase
      .from('expenses')
      .select('expense_date, type, payee, category, description, amount_before_tax, sales_tax, freight_tip, total_amount, reference, payment_method')
      .gte('expense_date', `${activeYear}-01-01`)
      .lte('expense_date', `${activeYear}-12-31`)
      .is('deleted_at', null)
      .order('expense_date', { ascending: true })
    const rows = data || []
    const wb = XLSX.utils.book_new()
    const monthlyData: any[][] = Array.from({ length: 12 }, () => [])
    rows.forEach(e => {
      const mo = parseInt((e.expense_date || '').slice(5, 7)) - 1
      if (mo >= 0 && mo < 12) monthlyData[mo].push(e)
    })
    const summaryRows: any[][] = [['Month', 'Total']]
    MONTHS.forEach((m, i) => {
      summaryRows.push([m, monthlyData[i].reduce((s: number, e: any) => s + (e.total_amount || 0), 0)])
    })
    summaryRows.push(['Grand Total', rows.reduce((s, e) => s + (e.total_amount || 0), 0)])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary')
    const exportCols = ['Date', 'Type', 'Payee', 'Category', 'Description', 'Amount Before Tax', 'Sales Tax', 'Freight/Tip', 'Total', 'Reference', 'Payment Method']
    MONTHS.forEach((m, i) => {
      const mRows = monthlyData[i]
      const sheetData: any[][] = [exportCols]
      mRows.forEach((e: any) => {
        sheetData.push([e.expense_date || '', e.type || '', e.payee || '', e.category || '', e.description || '', e.amount_before_tax || 0, e.sales_tax || 0, e.freight_tip || 0, e.total_amount || 0, e.reference || '', e.payment_method || ''])
      })
      sheetData.push(['', '', '', '', 'Total', mRows.reduce((s: number, e: any) => s + (e.amount_before_tax || 0), 0), mRows.reduce((s: number, e: any) => s + (e.sales_tax || 0), 0), mRows.reduce((s: number, e: any) => s + (e.freight_tip || 0), 0), mRows.reduce((s: number, e: any) => s + (e.total_amount || 0), 0), '', ''])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), m)
    })
    XLSX.writeFile(wb, `${activeYear}_Expenses-ESHCO_Elements.xlsx`)
    setExporting(false)
  }

  const monthExpenses = expenses.filter(e => {
    const m = parseInt((e.expense_date || '').slice(5, 7)) - 1
    return m === activeMonth
  })

  const monthCategories = Array.from(new Set(monthExpenses.map(e => e.category).filter((c): c is string => Boolean(c)))).sort()
  const filteredExpenses = categoryFilter ? monthExpenses.filter(e => e.category === categoryFilter) : monthExpenses

  const summaryMap = new Map<string, { subtotal: number; tax: number; total: number }>()
  filteredExpenses.forEach(e => {
    const cat = e.category || '(No Category)'
    if (!summaryMap.has(cat)) summaryMap.set(cat, { subtotal: 0, tax: 0, total: 0 })
    const row = summaryMap.get(cat)!
    row.subtotal += e.amount_before_tax || 0
    row.tax += e.sales_tax || 0
    row.total += e.total_amount || 0
  })
  const summaryRows = Array.from(summaryMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  // KPI
  const kpiMonthStr = `${activeYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`
  const thisMonth = expenses.filter(e => e.expense_date?.startsWith(kpiMonthStr))
  const kpiCAD = thisMonth.reduce((s, e) => s + (e.total_amount || 0), 0)
  const kpiUSD = thisMonth.reduce((s, e) => s + (e.amount_usd || 0), 0)
  const ytdCAD = expenses.reduce((s, e) => s + (e.total_amount || 0), 0)

  const monthTotal = filteredExpenses.reduce((s, e) => s + (e.total_amount || 0), 0)
  const monthBeforeTax = filteredExpenses.reduce((s, e) => s + (e.amount_before_tax || 0), 0)
  const monthSalesTax = filteredExpenses.reduce((s, e) => s + (e.sales_tax || 0), 0)
  const monthFreight = filteredExpenses.reduce((s, e) => s + (e.freight_tip || 0), 0)

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
    setReceiptFiles([])
    setRemovedReceiptUrls([])
    setSaveError('')
    const d = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}-01`
    setForm({ ...emptyForm, expense_date: d })
    setShowModal(true)
  }

  function openEdit(e: Expense) {
    setEditExpense(e)
    setReceiptFiles([])
    setRemovedReceiptUrls([])
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

    // Handle receipt_urls (multi-receipt)
    // Use getReceiptUrls so receipt_url (singular) is also tracked for removal
    const allExistingUrls = editExpense ? getReceiptUrls(editExpense) : []
    const filteredUrls = allExistingUrls.filter(u => !removedReceiptUrls.includes(u))
    const newUrls: string[] = []

    if (receiptFiles.length > 0 && expenseId) {
      setUploadingReceipt(true)
      for (const file of receiptFiles) {
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const storagePath = `${expenseId}/${Date.now()}_${safeFilename}`
        const { data: up, error: upErr } = await supabase.storage.from('receipts').upload(storagePath, file)
        if (upErr) {
          console.error('[receipt:modal] Storage upload error:', upErr)
          setSaveError(`Receipt upload failed: ${upErr.message}`)
          continue
        }
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(up.path)
        newUrls.push(urlData.publicUrl)
      }
      setUploadingReceipt(false)
    }

    if (expenseId && (receiptFiles.length > 0 || removedReceiptUrls.length > 0)) {
      const finalUrls = [...filteredUrls, ...newUrls]
      const { error: urlErr } = await supabase.from('expenses').update({
        receipt_urls: finalUrls,
        receipt_url: finalUrls[0] ?? null,
      }).eq('id', expenseId)
      if (urlErr) console.error('[receipt:modal] receipt_urls update error:', urlErr)
    }

    setSaving(false)
    setShowModal(false)
    setEditExpense(null)
    fetchExpenses(activeYear)
  }

  function triggerInlineUpload(ev: React.MouseEvent, expense: Expense) {
    ev.stopPropagation()
    setInlineUploadError(null)
    setInlineUploadTarget(expense)
    inlineUploadRef.current?.click()
  }

  async function handleInlineReceiptChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files ?? [])
    ev.target.value = ''
    if (!files.length || !inlineUploadTarget) return
    const expense = inlineUploadTarget
    setInlineUploadTarget(null)
    setInlineUploadError(null)
    setInlineUploadingId(expense.id)

    const newUrls: string[] = []
    for (const file of files) {
      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${expense.id}/${Date.now()}_${safeFilename}`
      const { data: up, error: upErr } = await supabase.storage.from('receipts').upload(path, file)
      if (upErr) {
        console.error('[receipt:inline] Storage upload error:', upErr)
        setInlineUploadError(`Upload failed: ${upErr.message}`)
        continue
      }
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(up.path)
      newUrls.push(urlData.publicUrl)
    }

    if (newUrls.length > 0) {
      const existing = expense.receipt_urls ?? []
      const updated = [...existing, ...newUrls]
      const { error: dbErr } = await supabase.from('expenses').update({ receipt_urls: updated }).eq('id', expense.id)
      if (dbErr) {
        console.error('[receipt:inline] DB receipt_urls update error:', dbErr)
        setInlineUploadError(`DB update failed: ${dbErr.message}`)
      } else {
        setExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, receipt_urls: updated } : ex))
      }
    }
    setInlineUploadingId(null)
  }

  async function handleDelete() {
    if (!editExpense) return
    if (!confirm('Delete this expense?')) return
    const old = { ...editExpense }
    await logActivity(supabase, 'expenses', old.id, 'DELETE', old)
    await supabase.from('expenses').delete().eq('id', old.id)
    setShowModal(false)
    setEditExpense(null)
    fetchExpenses(activeYear)
    setUndoToast({
      message: `Expense "${old.payee || old.category || old.id.slice(0, 8)}" deleted.`,
      onUndo: async () => {
        await supabase.from('expenses').upsert([old])
        await logActivity(supabase, 'expenses', old.id, 'UPDATE', null, old)
        setUndoToast(null)
        fetchExpenses(activeYear)
      },
    })
  }

  function openReceiptViewer(url: string) {
    const lower = url.toLowerCase()
    if (lower.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/)) {
      setViewerUrl(url)
    } else {
      window.open(url, '_blank')
    }
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

  // The existing receipts visible in the modal (after applying pending removals)
  const modalExistingUrls = editExpense
    ? getReceiptUrls(editExpense).filter(u => !removedReceiptUrls.includes(u))
    : []

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
          .kpi-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* KPI Cards */}
      <div className="kpi-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
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

      {/* Year + Category Filter Row */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <select value={activeYear} onChange={e => setActiveYear(Number(e.target.value))} style={{ height: '36px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', fontSize: '14px', fontWeight: '500', color: '#1e293b', cursor: 'pointer', outline: 'none' }}>
          {Array.from({ length: 21 }, (_, i) => 2020 + i).map(yr => (
            <option key={yr} value={yr}>{yr}</option>
          ))}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ height: '36px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', fontSize: '14px', color: '#1e293b', cursor: 'pointer', outline: 'none' }}>
          <option value=''>All Categories</option>
          {monthCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={handleExportExcel} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 14px', height: '36px', fontSize: '13px', fontWeight: '500', cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1 }}>
          {exporting ? 'Exporting...' : 'Export Excel'}
        </button>
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            <Upload size={14} /> {importing ? 'Importing...' : 'Import Excel'}
            <input ref={importRef} type='file' accept='.xlsx,.xls' onChange={handleImportSelect} style={{ display: 'none' }} />
          </label>
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
      {inlineUploadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', fontSize: '13px', color: '#dc2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Receipt upload failed: {inlineUploadError}</span>
          <button onClick={() => setInlineUploadError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '16px', padding: '0 4px' }}>×</button>
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
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    No expenses for {MONTHS[activeMonth]} {activeYear}{categoryFilter ? ` · ${categoryFilter}` : ''}
                  </td>
                </tr>
              ) : filteredExpenses.map((e, i) => {
                const urls = getReceiptUrls(e)
                return (
                  <tr
                    key={e.id}
                    onClick={() => openEdit(e)}
                    style={{ borderBottom: i < filteredExpenses.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
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
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                          {urls.length > 0 && (
                            <button
                              onClick={ev => { ev.stopPropagation(); setReceiptViewUrls(urls) }}
                              title='View receipts'
                              style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '3px 7px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              <Eye size={11} /> View{urls.length > 1 ? ` (${urls.length})` : ''}
                            </button>
                          )}
                          <button
                            onClick={ev => triggerInlineUpload(ev, e)}
                            title='Add receipt'
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: urls.length > 0 ? '#94a3b8' : '#cbd5e1', padding: '2px', display: 'inline-flex' }}
                          >
                            <Paperclip size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filteredExpenses.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={6} style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                    {filteredExpenses.length} record{filteredExpenses.length !== 1 ? 's' : ''}
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

      {/* Monthly Summary by Category */}
      {filteredExpenses.length > 0 && (
        <div style={{ marginTop: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Monthly Summary by Category</h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#1e293b' }}>
                {['Category', 'Subtotal', 'Tax', 'Total'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: '12px', fontWeight: '600', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map(([cat, vals], i) => (
                <tr key={cat} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '10px 16px', fontWeight: '500', color: '#1e293b' }}>{cat}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#374151' }}>${formatCurrency(vals.subtotal)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#374151' }}>${formatCurrency(vals.tax)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>${formatCurrency(vals.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                <td style={{ padding: '10px 16px', fontWeight: '700', color: '#1e293b', fontSize: '13px' }}>GRAND TOTAL</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${formatCurrency(monthBeforeTax)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${formatCurrency(monthSalesTax)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${formatCurrency(monthTotal)}</td>
              </tr>
            </tfoot>
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

              {/* Receipts */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Receipts</label>
                {/* Existing receipts list */}
                {modalExistingUrls.length > 0 && (
                  <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {modalExistingUrls.map(url => (
                      <div key={url} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '7px 10px' }}>
                        <Paperclip size={13} color='#2563eb' style={{ flexShrink: 0 }} />
                        <span
                          onClick={() => openReceiptViewer(url)}
                          style={{ flex: 1, fontSize: '13px', color: '#2563eb', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}
                          title={url}
                        >
                          {getReceiptFilename(url)}
                        </span>
                        <button
                          onClick={() => setRemovedReceiptUrls(prev => [...prev, url])}
                          title='Remove'
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0', display: 'flex', flexShrink: 0 }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Pending new files */}
                {receiptFiles.length > 0 && (
                  <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {receiptFiles.map((f, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px 10px' }}>
                        <Paperclip size={13} color='#16a34a' style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '13px', color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <button
                          onClick={() => setReceiptFiles(prev => prev.filter((_, i) => i !== idx))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: '0', display: 'flex', flexShrink: 0 }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Add files button */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#64748b', width: 'fit-content' }}>
                  <Plus size={14} /> Add files (jpg / png / pdf)
                  <input
                    ref={modalReceiptRef}
                    type='file'
                    accept='.jpg,.jpeg,.png,.pdf'
                    multiple
                    onChange={e => {
                      const files = Array.from(e.target.files ?? [])
                      if (files.length) setReceiptFiles(prev => [...prev, ...files])
                      e.target.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
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

      {/* Hidden inline receipt upload input (multiple) */}
      <input ref={inlineUploadRef} type='file' accept='image/*,application/pdf' multiple style={{ display: 'none' }} onChange={handleInlineReceiptChange} />

      {/* Receipt List View Modal */}
      {receiptViewUrls && (
        <div
          onClick={() => setReceiptViewUrls(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '16px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                Attachments ({receiptViewUrls.length})
              </h3>
              <button onClick={() => setReceiptViewUrls(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {receiptViewUrls.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => { openReceiptViewer(url) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <Paperclip size={15} color='#2563eb' style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getReceiptFilename(url)}
                  </span>
                  <Eye size={14} color='#94a3b8' style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Receipt Image Viewer */}
      {viewerUrl && (
        <div
          onClick={() => setViewerUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, cursor: 'zoom-out' }}
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
      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={undoToast.onUndo}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </MainLayout>
  )
}
