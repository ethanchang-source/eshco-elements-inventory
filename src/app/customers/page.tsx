'use client'

import { useEffect, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Users, Plus, Search, MapPin, Phone, Mail, Upload, Download, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/activityLog'
import UndoToast from '@/components/UndoToast'

interface Customer {
  id: string
  company_name: string
  warehouse_address: string
  city: string
  province: string
  postal_code: string
  ship_to_address: string
  ship_to_city: string
  ship_to_province: string
  ship_to_postal_code: string
  bill_to_same_as_ship_to: boolean
  contact_name: string
  contact_email: string
  contact_phone: string
  payment_terms: string
  currency: string
  notes: string
}

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  price_whs_cad: number
  unit_cost_cad: number
}

const emptyForm = {
  company_name: '', warehouse_address: '', city: '', province: '',
  postal_code: '', ship_to_address: '', ship_to_city: '', ship_to_province: '', ship_to_postal_code: '',
  contact_name: '', contact_email: '', contact_phone: '',
  payment_terms: 'Net 30', currency: 'CAD', notes: '',
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const importFileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [snapshot, setSnapshot] = useState<Customer[] | null>(null)
  const [undoRestoring, setUndoRestoring] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [modalTab, setModalTab] = useState<'info' | 'prices'>('info')
  const [priceList, setPriceList] = useState<{ product_id: string; sku: string; name: string; size: string; default_price: number | null; custom_price: string }[]>([])
  const [savingPrices, setSavingPrices] = useState(false)
  const [pricesSaveMsg, setPricesSaveMsg] = useState('')
  const [billToSameAsShipTo, setBillToSameAsShipTo] = useState(false)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)

  useEffect(() => { fetchCustomers(); fetchProducts() }, [])

  useEffect(() => {
    const channel = supabase
      .channel('customers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchCustomers())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) { setShowModal(false); setEditCustomer(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').is('deleted_at', null).order('company_name')
    setCustomers(data || [])
    setLoading(false)
  }

  async function fetchProducts() {
    const { data, error } = await supabase.from('products').select('id, sku, name, size_oz, price_whs_cad, unit_cost_cad').eq('is_active', true).order('sku')
    if (error) console.error('fetchProducts error:', error)
    setProducts(data || [])
  }

  function openAddModal() {
    setEditCustomer(null)
    setForm({ ...emptyForm })
    setBillToSameAsShipTo(false)
    setShowModal(true)
  }

  function normalizePaymentTerms(val: string): string {
    const map: Record<string, string> = {
      'Net15': 'Net 15', 'Net30': 'Net 30', 'Net45': 'Net 45', 'Net60': 'Net 60',
    }
    return map[val] || val || 'Net 30'
  }

  async function openEditModal(c: Customer) {
    setEditCustomer(c)
    setForm({
      company_name: c.company_name || '',
      warehouse_address: c.warehouse_address || '',
      city: c.city || '',
      province: c.province || '',
      postal_code: c.postal_code || '',
      ship_to_address: c.ship_to_address || '',
      ship_to_city: c.ship_to_city || '',
      ship_to_province: c.ship_to_province || '',
      ship_to_postal_code: c.ship_to_postal_code || '',
      contact_name: c.contact_name || '',
      contact_email: c.contact_email || '',
      contact_phone: c.contact_phone || '',
      payment_terms: normalizePaymentTerms(c.payment_terms),
      currency: c.currency || 'CAD',
      notes: c.notes || '',
    })
    setBillToSameAsShipTo(c.bill_to_same_as_ship_to || false)
    const [{ data: prices, error: pricesError }, { data: freshProducts, error: productsError }] = await Promise.all([
      supabase.from('customer_prices').select('*').eq('customer_id', c.id),
      supabase.from('products').select('id, sku, name, size_oz, price_whs_cad, unit_cost_cad').eq('is_active', true).order('sku'),
    ])
    if (pricesError) console.error('customer_prices fetch error:', pricesError)
    if (productsError) console.error('products fetch error (openEditModal):', productsError)
    const priceMap: Record<string, number> = {}
    if (prices) prices.forEach((p: any) => { priceMap[p.product_id] = p.custom_price })
    const productList = freshProducts || products
    setPriceList(productList.map(p => ({
      product_id: p.id, sku: p.sku, name: p.name, size: `${p.size_oz} FL. OZ.`,
      default_price: p.price_whs_cad ?? null,
      custom_price: priceMap[p.id] != null ? String(priceMap[p.id]) : '',
    })))
    setModalTab('info')
    setShowModal(true)
  }

  async function handleDelete() {
    if (!editCustomer) return
    if (!confirm(`Delete customer "${editCustomer.company_name}"?`)) return
    const old = { ...editCustomer }
    await logActivity(supabase, 'customers', old.id, 'DELETE', old)
    await supabase.from('customers').delete().eq('id', old.id)
    setShowModal(false)
    setEditCustomer(null)
    fetchCustomers()
    setUndoToast({
      message: `"${old.company_name}" deleted.`,
      onUndo: async () => {
        await supabase.from('customers').upsert([old])
        await logActivity(supabase, 'customers', old.id, 'UPDATE', null, old)
        setUndoToast(null)
        fetchCustomers()
      },
    })
  }

  async function handleSubmit() {
    if (!form.company_name.trim()) return
    const payload = {
      ...form,
      bill_to_same_as_ship_to: billToSameAsShipTo,
      ...(billToSameAsShipTo ? {
        warehouse_address: form.ship_to_address,
        city: form.ship_to_city,
        province: form.ship_to_province,
        postal_code: form.ship_to_postal_code,
      } : {}),
    }
    if (editCustomer) {
      const old = { ...editCustomer }
      await supabase.from('customers').update(payload).eq('id', editCustomer.id)
      await logActivity(supabase, 'customers', editCustomer.id, 'UPDATE', old, payload)
    } else {
      const { data: inserted } = await supabase.from('customers').insert([payload]).select().single()
      if (inserted) await logActivity(supabase, 'customers', inserted.id, 'INSERT', null, payload)
    }
    setShowModal(false)
    setEditCustomer(null)
    setForm({ ...emptyForm })
    fetchCustomers()
  }

  async function handleSavePrices() {
    if (!editCustomer) return
    setSavingPrices(true)
    setPricesSaveMsg('')

    const toUpsert = priceList
      .filter(p => p.custom_price.trim() !== '' && !isNaN(parseFloat(p.custom_price)))
      .map(p => ({ customer_id: editCustomer.id, product_id: p.product_id, custom_price: parseFloat(p.custom_price) }))

    const toClearIds = priceList
      .filter(p => p.custom_price.trim() === '' || isNaN(parseFloat(p.custom_price)))
      .map(p => p.product_id)

    if (toUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from('customer_prices')
        .upsert(toUpsert, { onConflict: 'customer_id,product_id' })
      if (upsertErr) {
        console.error('customer_prices upsert error:', upsertErr)
        setPricesSaveMsg(`❌ Save error: ${upsertErr.message}`)
        setSavingPrices(false)
        return
      }
    }

    if (toClearIds.length > 0) {
      const { error: delErr } = await supabase
        .from('customer_prices')
        .delete()
        .eq('customer_id', editCustomer.id)
        .in('product_id', toClearIds)
      if (delErr) {
        console.error('customer_prices delete error:', delErr)
        setPricesSaveMsg(`❌ Delete error: ${delErr.message}`)
        setSavingPrices(false)
        return
      }
    }

    const { data: refreshed, error: refetchError } = await supabase
      .from('customer_prices')
      .select('product_id, custom_price')
      .eq('customer_id', editCustomer.id)
    if (refetchError) {
      console.error('customer_prices refetch error:', refetchError)
      setPricesSaveMsg(`❌ Refetch error: ${refetchError.message}`)
      setSavingPrices(false)
      return
    }
    const refreshedMap: Record<string, number> = {}
    if (refreshed) refreshed.forEach(p => { refreshedMap[p.product_id] = p.custom_price })
    setPriceList(prev => prev.map(p => ({ ...p, custom_price: refreshedMap[p.product_id] != null ? String(refreshedMap[p.product_id]) : '' })))
    setPricesSaveMsg(`✅ Saved ${toUpsert.length} prices`)
    setSavingPrices(false)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setShowImportConfirm(true)
    e.target.value = ''
  }

  async function confirmImport() {
    setShowImportConfirm(false)
    if (!pendingFile) return
    setSnapshot([...customers])
    await runImport(pendingFile)
    setPendingFile(null)
  }

  async function runImport(file: File) {
    setImporting(true)
    setImportResult('')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
      const records: any[] = []
      let skipped = 0
      for (const row of rows) {
        const r: Record<string, any> = {}
        for (const key of Object.keys(row)) {
          r[key.toLowerCase().replace(/\s+/g, '_')] = row[key]
        }
        const name = String(r['company_name'] || '').trim()
        if (!name) { skipped++; continue }
        records.push({
          company_name: name,
          ship_to_address: String(r['ship_to_address'] || ''),
          ship_to_city: String(r['ship_to_city'] || ''),
          ship_to_province: String(r['ship_to_province'] || ''),
          ship_to_postal_code: String(r['ship_to_postal_code'] || ''),
          bill_to_same_as_ship_to: Boolean(r['bill_to_same_as_ship_to'] || false),
          warehouse_address: String(r['bill_to_address'] || r['warehouse_address'] || ''),
          city: String(r['bill_to_city'] || r['city'] || ''),
          province: String(r['bill_to_province'] || r['province'] || ''),
          postal_code: String(r['bill_to_postal_code'] || r['postal_code'] || ''),
          contact_name: String(r['contact_name'] || ''),
          contact_email: String(r['contact_email'] || ''),
          contact_phone: String(r['contact_phone'] || ''),
          payment_terms: String(r['payment_terms'] || 'Net30'),
          currency: String(r['currency'] || 'CAD'),
          notes: String(r['notes'] || ''),
        })
      }
      if (records.length === 0) {
        setImportResult('❌ No valid rows found. Make sure "Company Name" column is present.')
      } else {
        const { error } = await supabase
          .from('customers')
          .upsert(records, { onConflict: 'company_name', ignoreDuplicates: false })
        if (error) {
          console.error('customers upsert failed:', error)
          setImportResult(`❌ Import failed: ${error.message}`)
        } else {
          setImportResult(`✅ ${records.length} customers upserted.${skipped > 0 ? ` (${skipped} rows skipped — missing company name)` : ''}`)
          fetchCustomers()
        }
      }
    } catch (err) {
      console.error('customers import error:', err)
      setImportResult('❌ Error reading file. Please check the format.')
    }
    setImporting(false)
  }

  async function handleUndo() {
    if (!snapshot) return
    setUndoRestoring(true)
    await supabase.from('customers').upsert(snapshot, { onConflict: 'id' })
    setSnapshot(null)
    setImportResult('')
    fetchCustomers()
    setUndoRestoring(false)
  }

  function downloadTemplate() {
    const rows = [{
      'Company Name': 'Example Retailer Inc.',
      'Ship To Address': '123 Warehouse St',
      'Ship To City': 'Toronto',
      'Ship To Province': 'ON',
      'Ship To Postal Code': 'M1M 1M1',
      'Bill To Same As Ship To': true,
      'Bill To Address': '',
      'Bill To City': '',
      'Bill To Province': '',
      'Bill To Postal Code': '',
      'Contact Name': 'John Smith',
      'Contact Email': 'john@company.com',
      'Contact Phone': '416-555-0000',
      'Payment Terms': 'Net30',
      'Currency': 'CAD',
      'Notes': '',
    }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Template')
    XLSX.writeFile(wb, 'customers_template.xlsx')
  }

  const filtered = customers.filter(c =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.city?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .modal-grid-2, .modal-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search customers...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> Template
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            <Upload size={14} /> {importing ? 'Importing...' : 'Import Excel'}
            <input ref={importFileRef} type='file' accept='.xlsx,.xls' onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
          <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={14} /> Add Customer
          </button>
        </div>
      </div>

      {snapshot && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', color: '#92400e', fontWeight: '500' }}>Import applied. You can restore the previous data.</div>
          <button onClick={handleUndo} disabled={undoRestoring} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#92400e', border: '1px solid #fcd34d', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: '500', cursor: undoRestoring ? 'not-allowed' : 'pointer' }}>
            {undoRestoring ? 'Restoring...' : '↩ Undo Last Import'}
          </button>
        </div>
      )}

      {importResult && (
        <div style={{ background: importResult.includes('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${importResult.includes('✅') ? '#bbf7d0' : '#fecaca'}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: importResult.includes('✅') ? '#16a34a' : '#dc2626' }}>
          {importResult}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <Users size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No customers yet
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => openEditModal(c)}
              style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(37,99,235,0.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#93c5fd' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b' }}>{c.company_name}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>{c.payment_terms}</span>
                    <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>{c.currency}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(c.ship_to_address || c.ship_to_city) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <MapPin size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span><span style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginRight: '4px' }}>Ship To</span>{[c.ship_to_address, c.ship_to_city, c.ship_to_province, c.ship_to_postal_code].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {!c.bill_to_same_as_ship_to && (c.warehouse_address || c.city) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <MapPin size={14} style={{ marginTop: '2px', flexShrink: 0, opacity: 0 }} />
                    <span><span style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginRight: '4px' }}>Bill To</span>{[c.warehouse_address, c.city, c.province, c.postal_code].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {c.contact_name && <div style={{ fontSize: '13px', color: '#64748b' }}>👤 {c.contact_name}</div>}
                {c.contact_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <Mail size={14} /><span>{c.contact_email}</span>
                  </div>
                )}
                {c.contact_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <Phone size={14} /><span>{c.contact_phone}</span>
                  </div>
                )}
                {c.notes && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>{c.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showImportConfirm && (
        <div className="modal-overlay" onClick={() => { setShowImportConfirm(false); setPendingFile(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '440px', margin: '20px auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={20} color='#dc2626' />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Import Confirmation</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', marginBottom: '24px' }}>
              This will overwrite existing data with the contents of the uploaded file. This action cannot be undone without using Restore. Do you want to continue?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowImportConfirm(false); setPendingFile(null) }} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={confirmImport} style={{ padding: '9px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Yes, Import</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditCustomer(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: editCustomer ? '640px' : '520px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600' }}>
                {editCustomer ? 'Edit Customer' : 'Add New Customer'}
              </h2>
              {editCustomer && (
                <div style={{ display: 'flex', gap: '3px', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                  {(['info', 'prices'] as const).map(tab => (
                    <button key={tab} onClick={() => setModalTab(tab)} style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', background: modalTab === tab ? '#fff' : 'transparent', color: modalTab === tab ? '#1e293b' : '#64748b', boxShadow: modalTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
                      {tab === 'info' ? 'Info' : 'Price List'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {modalTab === 'info' && <>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Company Name *</label>
                <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} placeholder='ABC Beauty Inc.' style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Ship To</div>
              {[
                { label: 'Address', key: 'ship_to_address', placeholder: '123 Warehouse St' },
                { label: 'City', key: 'ship_to_city', placeholder: 'Toronto' },
                { label: 'Province', key: 'ship_to_province', placeholder: 'ON' },
                { label: 'Postal Code', key: 'ship_to_postal_code', placeholder: 'M1M 1M1' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>{field.label}</label>
                  <input value={form[field.key as keyof typeof form] as string} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', marginTop: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bill To</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
                  <input type='checkbox' checked={billToSameAsShipTo} onChange={e => setBillToSameAsShipTo(e.target.checked)} style={{ cursor: 'pointer' }} />
                  Same as Ship To
                </label>
              </div>
              {!billToSameAsShipTo && [
                { label: 'Address', key: 'warehouse_address', placeholder: '123 Warehouse St' },
                { label: 'City', key: 'city', placeholder: 'Toronto' },
                { label: 'Province', key: 'province', placeholder: 'ON' },
                { label: 'Postal Code', key: 'postal_code', placeholder: 'M1M 1M1' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>{field.label}</label>
                  <input value={form[field.key as keyof typeof form] as string} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                </div>
              ))}
              {[
                { label: 'Contact Name', key: 'contact_name', placeholder: 'John Smith' },
                { label: 'Contact Email', key: 'contact_email', placeholder: 'john@company.com' },
                { label: 'Contact Phone', key: 'contact_phone', placeholder: '416-555-0000' },
                { label: 'Notes', key: 'notes', placeholder: 'Any notes...' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>{field.label}</label>
                  <input value={form[field.key as keyof typeof form] as string} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                </div>
              ))}
              <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Payment Terms</label>
                  <select value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                    <option value='Net 15'>Net 15</option>
                    <option value='Net 30'>Net 30</option>
                    <option value='Net 45'>Net 45</option>
                    <option value='Net 60'>Net 60</option>
                    <option value='COD'>COD</option>
                    <option value='Prepaid'>Prepaid</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Currency</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                    <option value='CAD'>CAD</option>
                    <option value='USD'>USD</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '8px', alignItems: 'center' }}>
                <div>
                  {editCustomer && (
                    <button onClick={handleDelete} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                      Delete
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => { setShowModal(false); setEditCustomer(null) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                  <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                    {editCustomer ? 'Save Changes' : 'Add Customer'}
                  </button>
                </div>
              </div>
            </>}

            {modalTab === 'prices' && editCustomer && <>
              {priceList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', fontSize: '13px' }}>No active products found.</div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        {['SKU', 'Product', 'Size', 'Default Price', 'Custom Price'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {priceList.map((item, idx) => (
                        <tr key={item.product_id} style={{ borderBottom: '1px solid #f1f5f9', background: item.custom_price ? '#eff6ff' : '#fff' }}>
                          <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#2563eb' }}>{item.sku}</td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: '#1e293b' }}>{item.name}</td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{item.size}</td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: '#94a3b8' }}>{item.default_price != null ? `$${formatCurrency(item.default_price)}` : '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type='number'
                              value={item.custom_price}
                              onChange={e => setPriceList(prev => { const u = [...prev]; u[idx] = { ...u[idx], custom_price: e.target.value }; return u })}
                              placeholder={item.default_price != null ? item.default_price.toFixed(2) : ''}
                              style={{ width: '80px', padding: '4px 8px', border: item.custom_price ? '1px solid #2563eb' : '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                {pricesSaveMsg && (
                  <span style={{ fontSize: '13px', color: pricesSaveMsg.startsWith('❌') ? '#dc2626' : '#16a34a', fontWeight: '500' }}>{pricesSaveMsg}</span>
                )}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => { setShowModal(false); setEditCustomer(null) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                  <button onClick={handleSavePrices} disabled={savingPrices} style={{ padding: '8px 20px', background: savingPrices ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: savingPrices ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                    {savingPrices ? 'Saving...' : 'Save Prices'}
                  </button>
                </div>
              </div>
            </>}
          </div>
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
