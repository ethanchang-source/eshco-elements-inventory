'use client'

import { useEffect, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Users, Plus, Search, MapPin, Phone, Mail, Upload, Download, TableIcon } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Customer {
  id: string
  company_name: string
  warehouse_address: string
  city: string
  province: string
  postal_code: string
  contact_name: string
  contact_email: string
  contact_phone: string
  payment_terms: string
  currency: string
  notes: string
}

const emptyForm = {
  company_name: '', warehouse_address: '', city: '', province: '',
  postal_code: '', contact_name: '', contact_email: '', contact_phone: '',
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

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('company_name')
    setCustomers(data || [])
    setLoading(false)
  }

  function openAddModal() {
    setEditCustomer(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  function normalizePaymentTerms(val: string): string {
    const map: Record<string, string> = {
      'Net15': 'Net 15', 'Net30': 'Net 30', 'Net45': 'Net 45', 'Net60': 'Net 60',
    }
    return map[val] || val || 'Net 30'
  }

  function openEditModal(c: Customer) {
    setEditCustomer(c)
    setForm({
      company_name: c.company_name || '',
      warehouse_address: c.warehouse_address || '',
      city: c.city || '',
      province: c.province || '',
      postal_code: c.postal_code || '',
      contact_name: c.contact_name || '',
      contact_email: c.contact_email || '',
      contact_phone: c.contact_phone || '',
      payment_terms: normalizePaymentTerms(c.payment_terms),
      currency: c.currency || 'CAD',
      notes: c.notes || '',
    })
    setShowModal(true)
  }

  async function handleDelete() {
    if (!editCustomer) return
    if (!confirm(`"${editCustomer.company_name}" 고객을 삭제하시겠습니까?`)) return
    await supabase.from('customers').delete().eq('id', editCustomer.id)
    setShowModal(false)
    setEditCustomer(null)
    fetchCustomers()
  }

  async function handleSubmit() {
    if (!form.company_name.trim()) return
    if (editCustomer) {
      await supabase.from('customers').update(form).eq('id', editCustomer.id)
    } else {
      await supabase.from('customers').insert([form])
    }
    setShowModal(false)
    setEditCustomer(null)
    setForm({ ...emptyForm })
    fetchCustomers()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult('')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
      let success = 0, failed = 0
      for (const row of rows) {
        const name = String(row['Company Name'] || row['company_name'] || '').trim()
        if (!name) { failed++; continue }
        const payload = {
          company_name: name,
          warehouse_address: String(row['Warehouse Address'] || row['warehouse_address'] || ''),
          city: String(row['City'] || row['city'] || ''),
          province: String(row['Province'] || row['province'] || ''),
          postal_code: String(row['Postal Code'] || row['postal_code'] || ''),
          contact_name: String(row['Contact Name'] || row['contact_name'] || ''),
          contact_email: String(row['Contact Email'] || row['contact_email'] || ''),
          contact_phone: String(row['Contact Phone'] || row['contact_phone'] || ''),
          payment_terms: String(row['Payment Terms'] || row['payment_terms'] || 'Net30'),
          currency: String(row['Currency'] || row['currency'] || 'CAD'),
          notes: String(row['Notes'] || row['notes'] || ''),
        }
        const { data: existing } = await supabase.from('customers').select('id').eq('company_name', name).maybeSingle()
        let error
        if (existing) {
          ;({ error } = await supabase.from('customers').update(payload).eq('id', existing.id))
        } else {
          ;({ error } = await supabase.from('customers').insert([payload]))
        }
        if (error) failed++; else success++
      }
      setImportResult(`✅ ${success} customers imported.${failed > 0 ? ` ❌ ${failed} failed.` : ''}`)
      fetchCustomers()
    } catch {
      setImportResult('❌ Error reading file. Please check the format.')
    }
    setImporting(false)
    e.target.value = ''
  }

  function handleExport() {
    const rows = customers.map(c => ({
      'Company Name': c.company_name,
      'Warehouse Address': c.warehouse_address || '',
      'City': c.city || '',
      'Province': c.province || '',
      'Postal Code': c.postal_code || '',
      'Contact Name': c.contact_name || '',
      'Contact Email': c.contact_email || '',
      'Contact Phone': c.contact_phone || '',
      'Payment Terms': c.payment_terms || '',
      'Currency': c.currency || '',
      'Notes': c.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Customers')
    XLSX.writeFile(wb, `customers_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function downloadTemplate() {
    const rows = [{
      'Company Name': 'Example Retailer Inc.',
      'Warehouse Address': '123 Warehouse St',
      'City': 'Toronto',
      'Province': 'ON',
      'Postal Code': 'M1M 1M1',
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
            <input ref={importFileRef} type='file' accept='.xlsx,.xls' onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <TableIcon size={14} /> Export Excel
          </button>
          <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={14} /> Add Customer
          </button>
        </div>
      </div>

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
                {(c.warehouse_address || c.city) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <MapPin size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>{[c.warehouse_address, c.city, c.province, c.postal_code].filter(Boolean).join(', ')}</span>
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

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              {editCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            {[
              { label: 'Company Name *', key: 'company_name', placeholder: 'ABC Beauty Inc.' },
              { label: 'Warehouse Address', key: 'warehouse_address', placeholder: '123 Warehouse St' },
              { label: 'City', key: 'city', placeholder: 'Toronto' },
              { label: 'Province', key: 'province', placeholder: 'ON' },
              { label: 'Postal Code', key: 'postal_code', placeholder: 'M1M 1M1' },
              { label: 'Contact Name', key: 'contact_name', placeholder: 'John Smith' },
              { label: 'Contact Email', key: 'contact_email', placeholder: 'john@company.com' },
              { label: 'Contact Phone', key: 'contact_phone', placeholder: '416-555-0000' },
              { label: 'Notes', key: 'notes', placeholder: 'Any notes...' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>{field.label}</label>
                <input
                  value={form[field.key as keyof typeof form]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
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
          </div>
        </div>
      )}
    </MainLayout>
  )
}
