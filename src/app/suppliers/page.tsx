'use client'

import { useEffect, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Truck, Plus, Search, Globe, Phone, Mail, Upload, Download, TableIcon } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Supplier {
  id: string
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  country: string
  notes: string
}

const emptyForm = {
  name: '', contact_name: '', contact_email: '',
  contact_phone: '', country: 'Canada', notes: '',
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const importFileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ ...emptyForm })

  useEffect(() => { fetchSuppliers() }, [])

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setSuppliers(data || [])
    setLoading(false)
  }

  function openAddModal() {
    setEditSupplier(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  function openEditModal(s: Supplier) {
    setEditSupplier(s)
    setForm({
      name: s.name || '',
      contact_name: s.contact_name || '',
      contact_email: s.contact_email || '',
      contact_phone: s.contact_phone || '',
      country: s.country || 'Canada',
      notes: s.notes || '',
    })
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!form.name.trim()) return
    if (editSupplier) {
      await supabase.from('suppliers').update(form).eq('id', editSupplier.id)
    } else {
      await supabase.from('suppliers').insert([form])
    }
    setShowModal(false)
    setEditSupplier(null)
    setForm({ ...emptyForm })
    fetchSuppliers()
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
        const name = String(row['Company Name'] || row['name'] || '').trim()
        if (!name) { failed++; continue }
        const { error } = await supabase.from('suppliers').insert([{
          name,
          contact_name: String(row['Contact Name'] || row['contact_name'] || ''),
          contact_email: String(row['Contact Email'] || row['contact_email'] || ''),
          contact_phone: String(row['Contact Phone'] || row['contact_phone'] || ''),
          country: String(row['Country'] || row['country'] || 'Canada'),
          notes: String(row['Notes'] || row['notes'] || ''),
        }])
        if (error) failed++; else success++
      }
      setImportResult(`✅ ${success} suppliers imported.${failed > 0 ? ` ❌ ${failed} failed.` : ''}`)
      fetchSuppliers()
    } catch {
      setImportResult('❌ Error reading file. Please check the format.')
    }
    setImporting(false)
    e.target.value = ''
  }

  function handleExport() {
    const rows = suppliers.map(s => ({
      'Company Name': s.name,
      'Contact Name': s.contact_name || '',
      'Contact Email': s.contact_email || '',
      'Contact Phone': s.contact_phone || '',
      'Country': s.country || '',
      'Notes': s.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Suppliers')
    XLSX.writeFile(wb, `suppliers_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function downloadTemplate() {
    const rows = [{
      'Company Name': 'Jedwards International',
      'Contact Name': 'Jane Doe',
      'Contact Email': 'jane@supplier.com',
      'Contact Phone': '+1-800-000-0000',
      'Country': 'USA',
      'Notes': 'Main oil supplier',
    }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Template')
    XLSX.writeFile(wb, 'suppliers_template.xlsx')
  }

  const filtered = suppliers.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.country?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <MainLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search suppliers...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
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
          <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={16} /> Add Supplier
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
          <Truck size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No suppliers yet
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filtered.map(s => (
            <div
              key={s.id}
              onClick={() => openEditModal(s)}
              style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(37,99,235,0.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#93c5fd' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0' }}
            >
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b' }}>{s.name}</div>
                {s.country && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Globe size={12} color='#94a3b8' />
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{s.country}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {s.contact_name && <div style={{ fontSize: '13px', color: '#64748b' }}>👤 {s.contact_name}</div>}
                {s.contact_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <Mail size={14} /><span>{s.contact_email}</span>
                  </div>
                )}
                {s.contact_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <Phone size={14} /><span>{s.contact_phone}</span>
                  </div>
                )}
                {s.notes && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>{s.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              {editSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </h2>
            {[
              { label: 'Company Name *', key: 'name', placeholder: 'Jedwards International' },
              { label: 'Contact Name', key: 'contact_name', placeholder: 'Jane Doe' },
              { label: 'Contact Email', key: 'contact_email', placeholder: 'jane@supplier.com' },
              { label: 'Contact Phone', key: 'contact_phone', placeholder: '+1-800-000-0000' },
              { label: 'Country', key: 'country', placeholder: 'USA' },
              { label: 'Notes', key: 'notes', placeholder: 'e.g. Main oil supplier' },
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
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => { setShowModal(false); setEditSupplier(null) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {editSupplier ? 'Save Changes' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
