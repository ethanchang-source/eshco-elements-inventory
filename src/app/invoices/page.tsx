'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { FileText, Plus, Search, Download, Trash2 } from 'lucide-react'
import { generateInvoicePDF } from '@/lib/generateInvoicePDF'

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

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
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
    const [inv, cust, prod] = await Promise.all([
      supabase.from('invoices').select('*, customers(company_name, warehouse_address, city, province, postal_code, payment_terms)').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('company_name'),
      supabase.from('products').select('*').eq('is_active', true).order('sku'),
    ])
    setInvoices(inv.data || [])
    setCustomers(cust.data || [])
    setProducts(prod.data || [])
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

  async function updateStatus(invoiceId: string, status: string) {
    await supabase.from('invoices').update({ status }).eq('id', invoiceId)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search invoices...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <button onClick={() => { setEditInvoice(null); setLineItems([]); setSelectedCustomer(null); setForm({ customer_id: '', issued_at: new Date().toISOString().split('T')[0], po_number: '', shipping: '0', tax_rate: '13', notes: '' }); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Invoice #', 'Customer', 'Date', 'Subtotal', 'HST', 'Total', 'Status', 'Payment Date', ''].map(h => (
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
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#16a34a' }}>{inv.payment_date ? new Date(inv.payment_date).toLocaleDateString('en-CA') : '-'}</td>
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
