'use client'

import { useEffect, useState, useRef } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { FileText, Plus, Search, Download, Trash2, Upload, TableIcon } from 'lucide-react'
import { generateInvoicePDF } from '@/lib/generateInvoicePDF'
import { generateCreditMemoPDF } from '@/lib/generateCreditMemoPDF'
import * as XLSX from 'xlsx'

interface Customer {
  id: string
  company_name: string
  warehouse_address: string
  city: string
  province: string
  postal_code: string
  payment_terms: string
  currency: string
}

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  price_whs_cad: number
  current_stock: number
}

interface InvoiceLineItem {
  product_id: string
  sku: string
  name: string
  size: string
  unit_price: number
  qty: number
  total: number
}

interface Invoice {
  id: string
  invoice_no: string
  customer_id: string
  issued_at: string
  status: string
  subtotal_cad: number
  tax_rate: number
  tax_amount_cad: number
  total_cad: number
  currency: string
  notes: string
  po_number: string
  customers?: {
    company_name: string
    warehouse_address: string
    city: string
    province: string
    postal_code: string
    payment_terms: string
  }
}

interface CreditMemo {
  id: string
  memo_no: string
  customer_id: string
  issued_at: string
  status: string
  applied_date?: string
  subtotal_cad: number
  tax_rate: number
  tax_amount_cad: number
  total_cad: number
  notes: string
  po_number: string
  customers?: {
    company_name: string
    warehouse_address: string
    city: string
    province: string
    postal_code: string
    payment_terms: string
  }
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentInfo, setPaymentInfo] = useState({ invoiceId: '', date: new Date().toISOString().split('T')[0] })
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryInfo, setDeliveryInfo] = useState({ invoiceId: '', date: new Date().toISOString().split('T')[0] })
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'invoices' | 'credit_memos'>('invoices')

  // ── Credit Memo state ──
  const [creditMemos, setCreditMemos] = useState<CreditMemo[]>([])
  const [cmSearch, setCmSearch] = useState('')
  const [showAppliedModal, setShowAppliedModal] = useState(false)
  const [appliedInfo, setAppliedInfo] = useState({ memoId: '', date: new Date().toISOString().split('T')[0] })
  const [showCmModal, setShowCmModal] = useState(false)
  const [editCm, setEditCm] = useState<CreditMemo | null>(null)
  const [cmSelectedCustomer, setCmSelectedCustomer] = useState<Customer | null>(null)
  const [cmLineItems, setCmLineItems] = useState<InvoiceLineItem[]>([])
  const [cmForm, setCmForm] = useState({ customer_id: '', issued_at: new Date().toISOString().split('T')[0], po_number: '', tax_rate: '13', notes: '' })

  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<any[]>([])
  const [importStatus, setImportStatus] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [form, setForm] = useState({
    customer_id: '',
    issued_at: new Date().toISOString().split('T')[0],
    po_number: '',
    shipping: '0',
    tax_rate: '13',
    notes: '',
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [inv, cust, prod, cm] = await Promise.all([
      supabase.from('invoices').select('*, customers(company_name, warehouse_address, city, province, postal_code, payment_terms)').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('company_name'),
      supabase.from('products').select('*').eq('is_active', true).order('sku'),
      supabase.from('credit_memos').select('*, customers(company_name, warehouse_address, city, province, postal_code, payment_terms)').order('created_at', { ascending: false }),
    ])
    setInvoices(inv.data || [])
    setCustomers(cust.data || [])
    setProducts(prod.data || [])
    setCreditMemos(cm.data || [])
    setLoading(false)
  }

  function handleCustomerChange(customerId: string) {
    const customer = customers.find(c => c.id === customerId) || null
    setSelectedCustomer(customer)
    setForm(prev => ({ ...prev, customer_id: customerId }))
    setLineItems(products.map(p => ({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      size: `${p.size_oz} FL. OZ.`,
      unit_price: p.price_whs_cad || 0,
      qty: 0,
      total: 0,
    })))
  }

  async function openEditModal(invoice: Invoice) {
    if (invoice.status !== 'draft') return
    setEditInvoice(invoice)
    const customer = customers.find(c => c.id === invoice.customer_id) || null
    setSelectedCustomer(customer)
    setForm({
      customer_id: invoice.customer_id,
      issued_at: invoice.issued_at,
      po_number: invoice.po_number || '',
      shipping: '0',
      tax_rate: String(Math.round(invoice.tax_rate * 100)),
      notes: invoice.notes || '',
    })
    const { data: items } = await supabase
      .from('invoice_items')
      .select('*, products(id, sku, name, size_oz, price_whs_cad)')
      .eq('invoice_id', invoice.id)

    const existingMap: { [key: string]: { qty: number; unit_price: number } } = {}
    if (items) {
      items.forEach(item => {
        if (item.products?.id) {
          existingMap[item.products.id] = { qty: item.qty, unit_price: item.unit_price_cad }
        }
      })
    }
    setLineItems(products.map(p => ({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      size: `${p.size_oz} FL. OZ.`,
      unit_price: existingMap[p.id]?.unit_price ?? p.price_whs_cad ?? 0,
      qty: existingMap[p.id]?.qty ?? 0,
      total: (existingMap[p.id]?.unit_price ?? p.price_whs_cad ?? 0) * (existingMap[p.id]?.qty ?? 0),
    })))
    setShowModal(true)
  }

  function updateQty(index: number, qty: number) {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], qty, total: updated[index].unit_price * qty }
      return updated
    })
  }

  function updateUnitPrice(index: number, price: number) {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], unit_price: price, total: price * updated[index].qty }
      return updated
    })
  }

  const activeItems = lineItems.filter(item => item.qty > 0)
  const subtotal = activeItems.reduce((sum, item) => sum + item.total, 0)
  const shipping = parseFloat(form.shipping) || 0
  const taxBase = subtotal + shipping
  const taxAmount = taxBase * (parseFloat(form.tax_rate) / 100)
  const total = taxBase + taxAmount
  const totalBoxes = Math.ceil(activeItems.reduce((sum, item) => sum + item.qty, 0) / 36)

  async function handleSubmit() {
    if (!form.customer_id || activeItems.length === 0) {
      alert('Please select a customer and add at least one item with quantity.')
      return
    }
    const notes = form.notes || ''

    if (editInvoice) {
      // 수정 모드
      await supabase.from('invoices').update({
        customer_id: form.customer_id,
        issued_at: form.issued_at,
        subtotal_cad: subtotal,
        tax_rate: parseFloat(form.tax_rate) / 100,
        tax_amount_cad: taxAmount,
        total_cad: total,
        notes,
        po_number: form.po_number || '',
      }).eq('id', editInvoice.id)

      await supabase.from('invoice_items').delete().eq('invoice_id', editInvoice.id)
      await supabase.from('invoice_items').insert(
        activeItems.map(item => ({
          invoice_id: editInvoice.id,
          product_id: item.product_id,
          qty: item.qty,
          unit_price_cad: item.unit_price,
          line_total_cad: item.total,
        }))
      )
    } else {
      // 신규 생성
      const { data: invoice } = await supabase.from('invoices').insert([{
        customer_id: form.customer_id,
        issued_at: form.issued_at,
        status: 'draft',
        subtotal_cad: subtotal,
        tax_rate: parseFloat(form.tax_rate) / 100,
        tax_amount_cad: taxAmount,
        total_cad: total,
        currency: 'CAD',
        notes,
        po_number: form.po_number || '',
        invoice_no: '',
      }]).select().single()

      if (invoice) {
        await supabase.from('invoice_items').insert(
          activeItems.map(item => ({
            invoice_id: invoice.id,
            product_id: item.product_id,
            qty: item.qty,
            unit_price_cad: item.unit_price,
            line_total_cad: item.total,
          }))
        )
      }
    }

    setShowModal(false)
    setEditInvoice(null)
    setLineItems([])
    setSelectedCustomer(null)
    setForm({ customer_id: '', issued_at: new Date().toISOString().split('T')[0], po_number: '', shipping: '0', tax_rate: '13', notes: '' })
    fetchAll()
  }

  async function handleDownloadPDF(invoice: Invoice) {
    const { data: items } = await supabase
      .from('invoice_items')
      .select('*, products(sku, name, size_oz)')
      .eq('invoice_id', invoice.id)

    if (!items || !invoice.customers) return

    generateInvoicePDF({
      invoice_no: invoice.invoice_no,
      issued_at: invoice.issued_at,
      po_number: invoice.po_number || '',
      payment_terms: invoice.customers.payment_terms || '',
      customer: {
        company_name: invoice.customers.company_name,
        warehouse_address: invoice.customers.warehouse_address,
        city: invoice.customers.city,
        province: invoice.customers.province,
        postal_code: invoice.customers.postal_code,
      },
      items: items.map(item => ({
        sku: item.products?.sku || '',
        name: item.products?.name || '',
        size: `${item.products?.size_oz} FL. OZ.`,
        unit_price: item.unit_price_cad,
        qty: item.qty,
        total: item.line_total_cad,
      })),
      subtotal: invoice.subtotal_cad,
      shipping: 0,
      tax_rate: invoice.tax_rate,
      tax_amount: invoice.tax_amount_cad,
      total: invoice.total_cad,
      notes: invoice.notes || '',
      po_number: invoice.po_number || '',
    })
  }

  async function handleDelete(invoiceId: string) {
    if (!confirm('Are you sure you want to delete this invoice? This cannot be undone.')) return
    await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
    await supabase.from('invoices').delete().eq('id', invoiceId)
    fetchAll()
  }

  async function handleExport() {
    const { data: items } = await supabase
      .from('invoice_items')
      .select('*, invoices(invoice_no), products(sku, name, size_oz)')
      .order('created_at')

    const summaryRows = invoices.map(inv => ({
      'Invoice #': inv.invoice_no,
      'Customer': inv.customers?.company_name || '',
      'Date': inv.issued_at,
      'PO #': inv.po_number || '',
      'Status': inv.status,
      'Subtotal (CAD)': inv.subtotal_cad,
      'HST (CAD)': inv.tax_amount_cad,
      'Total (CAD)': inv.total_cad,
      'Delivery Date': (inv as any).delivery_date || '',
      'Payment Date': (inv as any).payment_date || '',
      'Notes': inv.notes || '',
    }))

    const itemRows = (items || []).map(item => ({
      'Invoice #': item.invoices?.invoice_no || '',
      'SKU': item.products?.sku || '',
      'Product Name': item.products?.name || '',
      'Size': `${item.products?.size_oz} FL. OZ.`,
      'Qty': item.qty,
      'Unit Price (CAD)': item.unit_price_cad,
      'Line Total (CAD)': item.line_total_cad,
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Invoices')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Line Items')
    XLSX.writeFile(wb, `invoices_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function downloadTemplate() {
    const rows = [
      {
        'Invoice #': 'INV-2025-001',
        'Customer Name': 'Example Retailer Inc.',
        'Date': '2025-01-15',
        'PO #': 'PO12345',
        'Status': 'paid',
        'Delivery Date': '2025-01-20',
        'Payment Date': '2025-02-15',
        'Notes': '',
        'SKU': 'IPB-001',
        'Qty': 12,
        'Unit Price CAD': 25.00,
        'Tax Rate %': 13,
      },
      {
        'Invoice #': 'INV-2025-001',
        'Customer Name': 'Example Retailer Inc.',
        'Date': '2025-01-15',
        'PO #': 'PO12345',
        'Status': 'paid',
        'Delivery Date': '2025-01-20',
        'Payment Date': '2025-02-15',
        'Notes': '',
        'SKU': 'IPB-002',
        'Qty': 6,
        'Unit Price CAD': 30.00,
        'Tax Rate %': 13,
      },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Import Template')
    XLSX.writeFile(wb, 'invoice_import_template.xlsx')
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target?.result
      const wb = XLSX.read(data, { type: 'binary', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false })
      setImportRows(rows as any[])
      setImportStatus('')
    }
    reader.readAsBinaryString(file)
  }

  async function handleImport() {
    if (importRows.length === 0) return
    setImporting(true)
    setImportStatus('')

    const grouped: { [key: string]: any[] } = {}
    for (const row of importRows) {
      const no = String(row['Invoice #'] || '').trim()
      if (!no) continue
      if (!grouped[no]) grouped[no] = []
      grouped[no].push(row)
    }

    const { data: allCustomers } = await supabase.from('customers').select('id, company_name')
    const { data: allProducts } = await supabase.from('products').select('id, sku, price_whs_cad')
    const { data: existingInvoices } = await supabase.from('invoices').select('invoice_no')
    const existingNos = new Set((existingInvoices || []).map(i => i.invoice_no))

    const customerMap: { [name: string]: string } = {}
    for (const c of allCustomers || []) customerMap[c.company_name.toLowerCase()] = c.id

    const productMap: { [sku: string]: { id: string; price: number } } = {}
    for (const p of allProducts || []) productMap[p.sku.toUpperCase()] = { id: p.id, price: p.price_whs_cad }

    let imported = 0, skipped = 0
    const errors: string[] = []

    for (const [invoiceNo, rows] of Object.entries(grouped)) {
      if (existingNos.has(invoiceNo)) {
        skipped++
        errors.push(`${invoiceNo}: already exists, skipped`)
        continue
      }

      const first = rows[0]
      const customerName = String(first['Customer Name'] || '').trim()
      const customerId = customerMap[customerName.toLowerCase()]
      if (!customerId) {
        skipped++
        errors.push(`${invoiceNo}: customer "${customerName}" not found`)
        continue
      }

      const issuedAt = String(first['Date'] || '').trim()
      const taxRate = parseFloat(String(first['Tax Rate %'] || '13')) / 100
      const poNumber = String(first['PO #'] || '').trim()
      const status = String(first['Status'] || 'paid').trim()
      const deliveryDate = String(first['Delivery Date'] || '').trim() || null
      const paymentDate = String(first['Payment Date'] || '').trim() || null
      const notes = String(first['Notes'] || '').trim()

      const lineItems: { product_id: string; qty: number; unit_price_cad: number; line_total_cad: number }[] = []
      let hasError = false

      for (const row of rows) {
        const sku = String(row['SKU'] || '').trim().toUpperCase()
        const qty = parseInt(String(row['Qty'] || '0'))
        const unitPrice = parseFloat(String(row['Unit Price CAD'] || '0'))
        if (!sku || qty <= 0) continue
        const product = productMap[sku]
        if (!product) {
          errors.push(`${invoiceNo}: SKU "${sku}" not found`)
          hasError = true
          break
        }
        lineItems.push({ product_id: product.id, qty, unit_price_cad: unitPrice, line_total_cad: unitPrice * qty })
      }

      if (hasError || lineItems.length === 0) {
        skipped++
        continue
      }

      const subtotal = lineItems.reduce((s, i) => s + i.line_total_cad, 0)
      const taxAmount = subtotal * taxRate
      const total = subtotal + taxAmount

      const { data: inv, error } = await supabase.from('invoices').insert([{
        invoice_no: invoiceNo,
        customer_id: customerId,
        issued_at: issuedAt,
        status,
        subtotal_cad: subtotal,
        tax_rate: taxRate,
        tax_amount_cad: taxAmount,
        total_cad: total,
        currency: 'CAD',
        notes,
        po_number: poNumber,
        delivery_date: deliveryDate,
        payment_date: paymentDate,
      }]).select().single()

      if (error || !inv) {
        skipped++
        errors.push(`${invoiceNo}: DB error - ${error?.message}`)
        continue
      }

      await supabase.from('invoice_items').insert(lineItems.map(i => ({ ...i, invoice_id: inv.id })))
      imported++
    }

    setImportStatus(`Done: ${imported} imported, ${skipped} skipped.\n${errors.join('\n')}`)
    setImporting(false)
    if (imported > 0) fetchAll()
  }

  // ── Credit Memo helpers ──

  function cmHandleCustomerChange(customerId: string) {
    const customer = customers.find(c => c.id === customerId) || null
    setCmSelectedCustomer(customer)
    setCmForm(prev => ({ ...prev, customer_id: customerId }))
    setCmLineItems(products.map(p => ({
      product_id: p.id, sku: p.sku, name: p.name,
      size: `${p.size_oz} FL. OZ.`, unit_price: p.price_whs_cad || 0, qty: 0, total: 0,
    })))
  }

  async function openEditCm(cm: CreditMemo) {
    if (cm.status !== 'draft') return
    setEditCm(cm)
    setCmSelectedCustomer(customers.find(c => c.id === cm.customer_id) || null)
    setCmForm({ customer_id: cm.customer_id, issued_at: cm.issued_at, po_number: cm.po_number || '', tax_rate: String(Math.round(cm.tax_rate * 100)), notes: cm.notes || '' })
    const { data: items } = await supabase.from('credit_memo_items').select('*, products(id, sku, name, size_oz, price_whs_cad)').eq('memo_id', cm.id)
    const existingMap: { [key: string]: { qty: number; unit_price: number } } = {}
    if (items) items.forEach(item => { if (item.products?.id) existingMap[item.products.id] = { qty: item.qty, unit_price: item.unit_price_cad } })
    setCmLineItems(products.map(p => ({
      product_id: p.id, sku: p.sku, name: p.name, size: `${p.size_oz} FL. OZ.`,
      unit_price: existingMap[p.id]?.unit_price ?? p.price_whs_cad ?? 0,
      qty: existingMap[p.id]?.qty ?? 0,
      total: (existingMap[p.id]?.unit_price ?? p.price_whs_cad ?? 0) * (existingMap[p.id]?.qty ?? 0),
    })))
    setShowCmModal(true)
  }

  function cmUpdateQty(index: number, qty: number) {
    setCmLineItems(prev => { const u = [...prev]; u[index] = { ...u[index], qty, total: u[index].unit_price * qty }; return u })
  }
  function cmUpdateUnitPrice(index: number, price: number) {
    setCmLineItems(prev => { const u = [...prev]; u[index] = { ...u[index], unit_price: price, total: price * u[index].qty }; return u })
  }

  const cmActiveItems = cmLineItems.filter(i => i.qty > 0)
  const cmSubtotal = cmActiveItems.reduce((s, i) => s + i.total, 0)
  const cmTaxAmount = cmSubtotal * (parseFloat(cmForm.tax_rate) / 100)
  const cmTotal = cmSubtotal + cmTaxAmount

  async function generateMemoNo(): Promise<string> {
    const yr = new Date().getFullYear().toString().slice(2)
    const { count } = await supabase.from('credit_memos').select('*', { count: 'exact', head: true }).like('memo_no', `C${yr}-%`)
    return `C${yr}-${String((count || 0) + 1).padStart(5, '0')}`
  }

  const [cmSubmitting, setCmSubmitting] = useState(false)
  const [cmError, setCmError] = useState('')

  async function handleCmSubmit() {
    if (!cmForm.customer_id || cmActiveItems.length === 0) {
      alert('Please select a customer and add at least one item.')
      return
    }
    setCmSubmitting(true)
    setCmError('')
    try {
      if (editCm) {
        const { error: updErr } = await supabase.from('credit_memos').update({
          customer_id: cmForm.customer_id, issued_at: cmForm.issued_at,
          subtotal_cad: cmSubtotal, tax_rate: parseFloat(cmForm.tax_rate) / 100,
          tax_amount_cad: cmTaxAmount, total_cad: cmTotal,
          notes: cmForm.notes, po_number: cmForm.po_number || '',
        }).eq('id', editCm.id)
        if (updErr) throw updErr
        await supabase.from('credit_memo_items').delete().eq('memo_id', editCm.id)
        const { error: itemErr } = await supabase.from('credit_memo_items').insert(cmActiveItems.map(i => ({ memo_id: editCm.id, product_id: i.product_id, qty: i.qty, unit_price_cad: i.unit_price, line_total_cad: i.total })))
        if (itemErr) throw itemErr
      } else {
        const memo_no = await generateMemoNo()
        const { data: cm, error: insErr } = await supabase.from('credit_memos').insert([{
          memo_no, customer_id: cmForm.customer_id, issued_at: cmForm.issued_at, status: 'draft',
          subtotal_cad: cmSubtotal, tax_rate: parseFloat(cmForm.tax_rate) / 100,
          tax_amount_cad: cmTaxAmount, total_cad: cmTotal, currency: 'CAD',
          notes: cmForm.notes, po_number: cmForm.po_number || '',
        }]).select().single()
        if (insErr) throw insErr
        if (cm) {
          const { error: itemErr } = await supabase.from('credit_memo_items').insert(cmActiveItems.map(i => ({ memo_id: cm.id, product_id: i.product_id, qty: i.qty, unit_price_cad: i.unit_price, line_total_cad: i.total })))
          if (itemErr) throw itemErr
        }
      }
      setShowCmModal(false); setEditCm(null); setCmLineItems([]); setCmSelectedCustomer(null)
      setCmForm({ customer_id: '', issued_at: new Date().toISOString().split('T')[0], po_number: '', tax_rate: '13', notes: '' })
      fetchAll()
    } catch (err: any) {
      setCmError(err?.message || 'An error occurred. Please try again.')
    } finally {
      setCmSubmitting(false)
    }
  }

  async function handleCmDownloadPDF(cm: CreditMemo) {
    const { data: items } = await supabase.from('credit_memo_items').select('*, products(sku, name, size_oz)').eq('memo_id', cm.id)
    if (!items || !cm.customers) return
    generateCreditMemoPDF({
      memo_no: cm.memo_no, issued_at: cm.issued_at, po_number: cm.po_number || '',
      payment_terms: cm.customers.payment_terms || '',
      customer: { company_name: cm.customers.company_name, warehouse_address: cm.customers.warehouse_address, city: cm.customers.city, province: cm.customers.province, postal_code: cm.customers.postal_code },
      items: items.map(i => ({ sku: i.products?.sku || '', name: i.products?.name || '', size: `${i.products?.size_oz} FL. OZ.`, unit_price: i.unit_price_cad, qty: i.qty, total: i.line_total_cad })),
      subtotal: cm.subtotal_cad, tax_rate: cm.tax_rate, tax_amount: cm.tax_amount_cad, total: cm.total_cad, notes: cm.notes || '',
    })
  }

  async function handleCmDelete(id: string) {
    if (!confirm('Delete this credit memo? This cannot be undone.')) return
    await supabase.from('credit_memo_items').delete().eq('memo_id', id)
    await supabase.from('credit_memos').delete().eq('id', id)
    fetchAll()
  }

  async function updateCmStatus(id: string, status: string) {
    if (status === 'applied') {
      setAppliedInfo({ memoId: id, date: new Date().toISOString().split('T')[0] })
      setShowAppliedModal(true)
    } else {
      await supabase.from('credit_memos').update({ status, applied_date: null }).eq('id', id)
      fetchAll()
    }
  }

  async function confirmApplied() {
    await supabase.from('credit_memos').update({ status: 'applied', applied_date: appliedInfo.date }).eq('id', appliedInfo.memoId)
    setShowAppliedModal(false)
    fetchAll()
  }

  const filteredCm = creditMemos.filter(cm =>
    cm.memo_no?.toLowerCase().includes(cmSearch.toLowerCase()) ||
    cm.customers?.company_name?.toLowerCase().includes(cmSearch.toLowerCase())
  )

  const cmStatusColor: { [key: string]: { bg: string; color: string } } = {
    draft:   { bg: '#f8fafc', color: '#64748b' },
    sent:    { bg: '#eff6ff', color: '#2563eb' },
    applied: { bg: '#f5f3ff', color: '#7c3aed' },
  }

  async function updateStatus(invoiceId: string, status: string) {
    if (status === 'paid') {
      setPaymentInfo({ invoiceId, date: new Date().toISOString().split('T')[0] })
      setShowPaymentModal(true)
    } else {
      await supabase.from('invoices').update({ status, payment_date: null }).eq('id', invoiceId)
      fetchAll()
    }
  }

  async function confirmPayment() {
    await supabase.from('invoices').update({ status: 'paid', payment_date: paymentInfo.date }).eq('id', paymentInfo.invoiceId)
    setShowPaymentModal(false)
    fetchAll()
  }

  async function confirmDelivery() {
    await supabase.from('invoices').update({ delivery_date: deliveryInfo.date }).eq('id', deliveryInfo.invoiceId)
    setShowDeliveryModal(false)
    fetchAll()
  }

  const filtered = invoices.filter(inv =>
    inv.invoice_no?.toLowerCase().includes(search.toLowerCase()) ||
    inv.customers?.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor: { [key: string]: { bg: string; color: string } } = {
    draft: { bg: '#f8fafc', color: '#64748b' },
    sent: { bg: '#eff6ff', color: '#2563eb' },
    paid: { bg: '#f0fdf4', color: '#16a34a' },
  }

  return (
    <MainLayout>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f1f5f9', borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
        {(['invoices', 'credit_memos'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 20px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500', background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#1e293b' : '#64748b', boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
            {tab === 'invoices' ? 'Invoices' : 'Credit Memos'}
          </button>
        ))}
      </div>

      {/* ── INVOICES TAB ── */}
      {activeTab === 'invoices' && <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search invoices...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => { setShowImportModal(true); setImportRows([]); setImportStatus('') }} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={15} /> Import
          </button>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <TableIcon size={15} /> Export Excel
          </button>
          <button onClick={() => { setEditInvoice(null); setLineItems([]); setSelectedCustomer(null); setForm({ customer_id: '', issued_at: new Date().toISOString().split('T')[0], po_number: '', shipping: '0', tax_rate: '13', notes: '' }); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={16} /> New Invoice
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Invoice #', 'Customer', 'Date', 'Subtotal', 'HST', 'Total', 'Status', 'Delivery Date', 'Payment Date', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                <FileText size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                No invoices yet
              </td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600' }}>
                  {inv.status === 'draft' ? (
                    <span onClick={() => openEditModal(inv)} style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>{inv.invoice_no}</span>
                  ) : (
                    <span style={{ color: '#64748b' }}>{inv.invoice_no}</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{inv.customers?.company_name}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{new Date(inv.issued_at).toLocaleDateString('en-CA')}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${inv.subtotal_cad?.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>${inv.tax_amount_cad?.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>${inv.total_cad?.toFixed(2)} CAD</td>
                <td style={{ padding: '12px 16px' }}>
                  <select value={inv.status} onChange={e => updateStatus(inv.id, e.target.value)} style={{ background: statusColor[inv.status]?.bg, color: statusColor[inv.status]?.color, border: 'none', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', outline: 'none' }}>
                    <option value='draft'>Draft</option>
                    <option value='sent'>Sent</option>
                    <option value='paid'>Paid</option>
                  </select>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#2563eb' }}><span onClick={() => { setDeliveryInfo({ invoiceId: inv.id, date: inv.delivery_date || new Date().toISOString().split('T')[0] }); setShowDeliveryModal(true) }} style={{ cursor: 'pointer', textDecoration: inv.delivery_date ? 'underline' : 'none' }}>{inv.delivery_date ? inv.delivery_date : <button style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>+ Add</button>}</span></td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#16a34a' }}><span onClick={() => { setPaymentInfo({ invoiceId: inv.id, date: inv.payment_date || new Date().toISOString().split('T')[0] }); setShowPaymentModal(true) }} style={{ cursor: 'pointer', textDecoration: inv.payment_date ? 'underline' : 'none' }}>{inv.payment_date || '-'}</span></td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleDownloadPDF(inv)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
                      <Download size={12} /> PDF
                    </button>
                    <button onClick={() => handleDelete(inv.id)} style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </> /* end invoices tab */}

      {/* ── CREDIT MEMOS TAB ── */}
      {activeTab === 'credit_memos' && <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={cmSearch} onChange={e => setCmSearch(e.target.value)} placeholder='Search credit memos...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <button onClick={() => { setEditCm(null); setCmLineItems([]); setCmSelectedCustomer(null); setCmForm({ customer_id: '', issued_at: new Date().toISOString().split('T')[0], po_number: '', tax_rate: '13', notes: '' }); setShowCmModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={16} /> New Credit Memo
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['CREDIT MEMO #', 'Customer', 'Date', 'Subtotal', 'HST', 'Total', 'Status', 'Applied Date', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : filteredCm.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                <FileText size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                No credit memos yet
              </td></tr>
            ) : filteredCm.map(cm => (
              <tr key={cm.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600' }}>
                  {cm.status === 'draft'
                    ? <span onClick={() => openEditCm(cm)} style={{ color: '#7c3aed', cursor: 'pointer', textDecoration: 'underline' }}>{cm.memo_no}</span>
                    : <span style={{ color: '#64748b' }}>{cm.memo_no}</span>}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{cm.customers?.company_name}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{new Date(cm.issued_at).toLocaleDateString('en-CA')}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${cm.subtotal_cad?.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>${cm.tax_amount_cad?.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>${cm.total_cad?.toFixed(2)} CAD</td>
                <td style={{ padding: '12px 16px' }}>
                  <select value={cm.status} onChange={e => updateCmStatus(cm.id, e.target.value)} style={{ background: cmStatusColor[cm.status]?.bg, color: cmStatusColor[cm.status]?.color, border: 'none', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', outline: 'none' }}>
                    <option value='draft'>Draft</option>
                    <option value='sent'>Sent</option>
                    <option value='applied'>Applied</option>
                  </select>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#7c3aed' }}>
                  <span onClick={() => { setAppliedInfo({ memoId: cm.id, date: cm.applied_date || new Date().toISOString().split('T')[0] }); setShowAppliedModal(true) }} style={{ cursor: 'pointer', textDecoration: cm.applied_date ? 'underline' : 'none' }}>
                    {cm.applied_date ? cm.applied_date : <button style={{ background: '#f5f3ff', color: '#7c3aed', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>+ Add</button>}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleCmDownloadPDF(cm)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f5f3ff', color: '#7c3aed', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
                      <Download size={12} /> PDF
                    </button>
                    <button onClick={() => handleCmDelete(cm.id)} style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </> /* end credit memos tab */}

      {showImportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '540px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '6px' }}>Import Invoices from Excel</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Import historical invoice data. Existing invoice numbers will be skipped.</p>

            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>Required columns in your Excel file:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {['Invoice #', 'Customer Name', 'Date (YYYY-MM-DD)', 'SKU', 'Qty', 'Unit Price CAD'].map(col => (
                  <div key={col} style={{ fontSize: '12px', color: '#2563eb', fontFamily: 'monospace' }}>• {col}</div>
                ))}
              </div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151', marginTop: '10px', marginBottom: '4px' }}>Optional columns:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {['PO #', 'Status (draft/sent/paid)', 'Delivery Date', 'Payment Date', 'Notes', 'Tax Rate % (default 13)'].map(col => (
                  <div key={col} style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>• {col}</div>
                ))}
              </div>
              <button onClick={downloadTemplate} style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
                <Download size={13} /> Download Template
              </button>
            </div>

            <div
              onClick={() => importFileRef.current?.click()}
              style={{ border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: '16px', background: importRows.length > 0 ? '#f0fdf4' : '#fafafa' }}
            >
              <Upload size={24} color={importRows.length > 0 ? '#16a34a' : '#94a3b8'} style={{ display: 'block', margin: '0 auto 8px' }} />
              {importRows.length > 0 ? (
                <div style={{ fontSize: '14px', color: '#16a34a', fontWeight: '500' }}>{importRows.length} rows loaded — click to change file</div>
              ) : (
                <div style={{ fontSize: '14px', color: '#64748b' }}>Click to select .xlsx or .xls file</div>
              )}
              <input ref={importFileRef} type='file' accept='.xlsx,.xls' onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>

            {importRows.length > 0 && !importStatus && (
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#374151' }}>
                Preview: <strong>{importRows.length}</strong> rows, <strong>{new Set(importRows.map((r: any) => r['Invoice #'])).size}</strong> unique invoice numbers
              </div>
            )}

            {importStatus && (
              <div style={{ background: importStatus.includes('error') || importStatus.includes('skipped') && !importStatus.includes('0 skipped') ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', color: '#374151', whiteSpace: 'pre-wrap', fontFamily: 'monospace', maxHeight: '140px', overflowY: 'auto' }}>
                {importStatus}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowImportModal(false); setImportRows([]); setImportStatus('') }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Close</button>
              <button onClick={handleImport} disabled={importRows.length === 0 || importing} style={{ padding: '8px 20px', background: importing ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: importRows.length === 0 || importing ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {importing ? 'Importing...' : `Import ${importRows.length > 0 ? new Set(importRows.map((r: any) => r['Invoice #'])).size + ' invoices' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeliveryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '360px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Delivery Date</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Select the date this order was delivered</p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Delivery Date</label>
              <input type='date' value={deliveryInfo.date} onChange={e => setDeliveryInfo({ ...deliveryInfo, date: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeliveryModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={confirmDelivery} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Confirm Delivery</button>
            </div>
          </div>
        </div>
      )}

      {showAppliedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '360px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Applied Date</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Select the date this credit memo was applied</p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Applied Date</label>
              <input type='date' value={appliedInfo.date} onChange={e => setAppliedInfo({ ...appliedInfo, date: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAppliedModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={confirmApplied} style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '360px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Payment Received</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Select the date payment was received</p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Payment Date</label>
              <input type='date' value={paymentInfo.date} onChange={e => setPaymentInfo({ ...paymentInfo, date: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPaymentModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={confirmPayment} style={{ padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Confirm Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Memo 생성/수정 모달 */}
      {showCmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '780px', maxHeight: '92vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              {editCm ? `Edit Credit Memo ${editCm.memo_no}` : 'New Credit Memo'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Bill To / Ship To *</label>
                <select value={cmForm.customer_id} onChange={e => cmHandleCustomerChange(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                  <option value=''>Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Date</label>
                <input type='date' value={cmForm.issued_at} onChange={e => setCmForm({ ...cmForm, issued_at: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>REFERENCE #</label>
                <input value={cmForm.po_number} onChange={e => setCmForm({ ...cmForm, po_number: e.target.value })} placeholder='REF#' style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
            </div>

            {cmSelectedCustomer && cmLineItems.length > 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Item #', 'Description', 'Size', 'Unit Cost', 'Qty', 'Total'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cmLineItems.map((item, index) => (
                      <tr key={item.product_id} style={{ borderBottom: '1px solid #f1f5f9', background: item.qty > 0 ? '#faf5ff' : '#fff' }}>
                        <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#7c3aed' }}>{item.sku}</td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', color: '#1e293b' }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{item.size}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type='number' value={item.unit_price} onChange={e => cmUpdateUnitPrice(index, parseFloat(e.target.value) || 0)} style={{ width: '70px', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type='number' value={item.qty || ''} onChange={e => cmUpdateQty(index, parseInt(e.target.value) || 0)} placeholder='0' style={{ width: '60px', padding: '4px 8px', border: item.qty > 0 ? '1px solid #7c3aed' : '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px', outline: 'none', background: item.qty > 0 ? '#faf5ff' : '#fff' }} />
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: item.qty > 0 ? '#7c3aed' : '#94a3b8' }}>
                          {item.qty > 0 ? `$${item.total.toFixed(2)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!cmSelectedCustomer && (
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', marginBottom: '16px', border: '1px dashed #e2e8f0' }}>
                Select a customer to load all products
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Notes</label>
                <textarea value={cmForm.notes} onChange={e => setCmForm({ ...cmForm, notes: e.target.value })} placeholder='Additional notes...' rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                  <span>Subtotal</span><span>${cmSubtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                  <span>HST</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input value={cmForm.tax_rate} onChange={e => setCmForm({ ...cmForm, tax_rate: e.target.value })} style={{ width: '40px', padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
                    <span>% = ${cmTaxAmount.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '700', color: '#1e293b', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                  <span>TOTAL CREDIT</span><span>${cmTotal.toFixed(2)} CAD</span>
                </div>
              </div>
            </div>

            {cmError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#dc2626' }}>
                {cmError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCmModal(false); setEditCm(null); setCmLineItems([]); setCmSelectedCustomer(null); setCmError('') }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCmSubmit} disabled={cmSubmitting} style={{ padding: '8px 20px', background: cmSubmitting ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: cmSubmitting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {cmSubmitting ? 'Saving...' : editCm ? 'Update Credit Memo' : 'Create Credit Memo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '780px', maxHeight: '92vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              {editInvoice ? `Edit Invoice ${editInvoice.invoice_no}` : 'New Invoice'}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Bill To / Ship To *</label>
                <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                  <option value=''>Select customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Date</label>
                <input type='date' value={form.issued_at} onChange={e => setForm({ ...form, issued_at: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>PO #</label>
                <input value={form.po_number} onChange={e => setForm({ ...form, po_number: e.target.value })} placeholder='PUR0000004461' style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
            </div>

            {selectedCustomer && (
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#64748b' }}>
                Terms: <strong style={{ color: '#1e293b' }}>{selectedCustomer.payment_terms}</strong>
                {activeItems.length > 0 && <span style={{ marginLeft: '16px' }}>Total Boxes: <strong style={{ color: '#1e293b' }}>{totalBoxes}</strong> (÷36)</span>}
              </div>
            )}

            {selectedCustomer && lineItems.length > 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Item #', 'Description', 'Size', 'Unit Cost', 'Qty', 'Total'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => (
                      <tr key={item.product_id} style={{ borderBottom: '1px solid #f1f5f9', background: item.qty > 0 ? '#f0fdf4' : '#fff' }}>
                        <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#2563eb' }}>{item.sku}</td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', color: '#1e293b' }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{item.size}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type='number' value={item.unit_price} onChange={e => updateUnitPrice(index, parseFloat(e.target.value) || 0)} style={{ width: '70px', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type='number' value={item.qty || ''} onChange={e => updateQty(index, parseInt(e.target.value) || 0)} placeholder='0' style={{ width: '60px', padding: '4px 8px', border: item.qty > 0 ? '1px solid #16a34a' : '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px', outline: 'none', background: item.qty > 0 ? '#f0fdf4' : '#fff' }} />
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: item.qty > 0 ? '#16a34a' : '#94a3b8' }}>
                          {item.qty > 0 ? `$${item.total.toFixed(2)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!selectedCustomer && (
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', marginBottom: '16px', border: '1px dashed #e2e8f0' }}>
                Select a customer to load all products
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder='Additional notes...' rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                  <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                  <span>S & H</span>
                  <input value={form.shipping} onChange={e => setForm({ ...form, shipping: e.target.value })} style={{ width: '80px', padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                  <span>HST</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} style={{ width: '40px', padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
                    <span>% = ${taxAmount.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '700', color: '#1e293b', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                  <span>TOTAL</span><span>${total.toFixed(2)} CAD</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowModal(false); setEditInvoice(null); setLineItems([]); setSelectedCustomer(null) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {editInvoice ? 'Update Invoice' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
