'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Users, Plus, Search, MapPin, Phone, Mail, Upload, Download } from 'lucide-react'
import { parseCSV, downloadCSVTemplate } from '@/lib/csvImport'

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

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [form, setForm] = useState({
    company_name: '', warehouse_address: '', city: '', province: '',
    postal_code: '', contact_name: '', contact_email: '', contact_phone: '',
    payment_terms: 'Net30', currency: 'CAD', notes: ''
  })

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('company_name')
    setCustomers(data || [])
    setLoading(false)
  }

  async function handleSubmit() {
    await supabase.from('customers').insert([form])
    setShowModal(false)
    setForm({ company_name: '', warehouse_address: '', city: '', province: '', postal_code: '', contact_name: '', contact_email: '', contact_phone: '', payment_terms: 'Net30', currency: 'CAD', notes: '' })
    fetchCustomers()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult('')
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      let success = 0, failed = 0
      for (const row of rows) {
        if (!row.company_name) { failed++; continue }
        const { error } = await supabase.from('customers').insert([{
          company_name: row.company_name,
          warehouse_address: row.warehouse_address || '',
          city: row.city || '',
          province: row.province || '',
          postal_code: row.postal_code || '',
          contact_name: row.contact_name || '',
          contact_email: row.contact_email || '',
          contact_phone: row.contact_phone || '',
          payment_terms: row.payment_terms || 'Net30',
          currency: row.currency || 'CAD',
          notes: row.notes || '',
        }])
        if (error) failed++; else success++
      }
      setImportResult(`✅ ${success} customers imported. ${failed > 0 ? `❌ ${failed} failed.` : ''}`)
      fetchCustomers()
    } catch {
      setImportResult('❌ Error reading file.')
    }
    setImporting(false)
    e.target.value = ''
  }

  function handleDownloadTemplate() {
    downloadCSVTemplate(
      ['company_name', 'warehouse_address', 'city', 'province', 'postal_code', 'contact_name', 'contact_email', 'contact_phone', 'payment_terms', 'currency', 'notes'],
      'customers_template.csv'
    )
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleDownloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> Template
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            <Upload size={14} /> {importing ? 'Importing...' : 'Import CSV'}
            <input type='file' accept='.csv' onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
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
            <div key={c.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
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
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add New Customer</h2>
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
                <input value={form[field.key as keyof typeof form]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Payment Terms</label>
                <select value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                  <option value='Net15'>Net 15</option>
                  <option value='Net30'>Net 30</option>
                  <option value='Net45'>Net 45</option>
                  <option value='Net60'>Net 60</option>
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
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Customer</button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
