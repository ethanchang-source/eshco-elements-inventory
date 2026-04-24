'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Truck, Plus, Search, Globe, Phone, Mail } from 'lucide-react'

interface Supplier {
  id: string
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  country: string
  notes: string
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: '', contact_name: '', contact_email: '',
    contact_phone: '', country: 'Canada', notes: ''
  })

  useEffect(() => { fetchSuppliers() }, [])

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setSuppliers(data || [])
    setLoading(false)
  }

  async function handleSubmit() {
    await supabase.from('suppliers').insert([form])
    setShowModal(false)
    setForm({ name: '', contact_name: '', contact_email: '', contact_phone: '', country: 'Canada', notes: '' })
    fetchSuppliers()
  }

  const filtered = suppliers.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.country?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <MainLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search suppliers...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={16} /> Add Supplier
        </button>
      </div>

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
            <div key={s.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
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
                {s.contact_name && (
                  <div style={{ fontSize: '13px', color: '#64748b' }}>👤 {s.contact_name}</div>
                )}
                {s.contact_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <Mail size={14} />
                    <span>{s.contact_email}</span>
                  </div>
                )}
                {s.contact_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <Phone size={14} />
                    <span>{s.contact_phone}</span>
                  </div>
                )}
                {s.notes && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>{s.notes}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add New Supplier</h2>
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
                <input value={form[field.key as keyof typeof form]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Supplier</button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
