'use client'

import { useEffect, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Truck, Plus, Search, Globe, Phone, Mail, Upload, Download, AlertTriangle, MapPin } from 'lucide-react'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/activityLog'
import UndoToast from '@/components/UndoToast'

interface Supplier {
  id: string
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  country: string
  notes: string
  ship_to_address: string
  ship_to_city: string
  ship_to_province: string
  ship_to_postal_code: string
}

const emptyForm = {
  name: '', contact_name: '', contact_email: '',
  contact_phone: '', country: 'Canada', notes: '',
  ship_to_address: '', ship_to_city: '', ship_to_province: '', ship_to_postal_code: '',
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

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [snapshot, setSnapshot] = useState<Supplier[] | null>(null)
  const [undoRestoring, setUndoRestoring] = useState(false)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)

  useEffect(() => { fetchSuppliers() }, [])

  useEffect(() => {
    const channel = supabase
      .channel('suppliers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => fetchSuppliers())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showImportConfirm) { setShowImportConfirm(false); setPendingFile(null); return }
      if (showModal) { setShowModal(false); setEditSupplier(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal, showImportConfirm])

  async function fetchSuppliers() {
    const { data, error } = await supabase.from('suppliers').select('*').order('name')
    console.log('[suppliers] data:', data, 'error:', error)
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
      ship_to_address: s.ship_to_address || '',
      ship_to_city: s.ship_to_city || '',
      ship_to_province: s.ship_to_province || '',
      ship_to_postal_code: s.ship_to_postal_code || '',
    })
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!form.name.trim()) return
    const payload = {
      name: form.name,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone,
      country: form.country,
      notes: form.notes,
      ship_to_address: form.ship_to_address,
      ship_to_city: form.ship_to_city,
      ship_to_province: form.ship_to_province,
      ship_to_postal_code: form.ship_to_postal_code,
    }
    if (editSupplier) {
      const old = { ...editSupplier }
      const { error: updateError } = await supabase.from('suppliers').update(payload).eq('id', editSupplier.id)
      console.log('[suppliers] update id:', editSupplier.id, 'error:', updateError)
      if (updateError) { alert(`저장 실패: ${updateError.message}`); return }
      await logActivity(supabase, 'suppliers', editSupplier.id, 'UPDATE', old, payload)
    } else {
      const { data: inserted, error: insertError } = await supabase.from('suppliers').insert([payload]).select().single()
      console.log('[suppliers] insert result:', inserted, 'error:', insertError)
      if (insertError) { alert(`추가 실패: ${insertError.message}`); return }
      if (inserted) await logActivity(supabase, 'suppliers', inserted.id, 'INSERT', null, payload)
    }
    setShowModal(false)
    setEditSupplier(null)
    setForm({ ...emptyForm })
    fetchSuppliers()
  }

  async function handleDelete() {
    if (!editSupplier) return
    if (!confirm(`"${editSupplier.name}" 공급업체를 삭제하시겠습니까?`)) return
    const old = { ...editSupplier }
    const { error } = await supabase.from('suppliers').delete().eq('id', old.id)
    console.log('[suppliers] delete id:', old.id, 'error:', error)
    if (error) {
      alert(`삭제 실패: ${error.message}`)
      return
    }
    await logActivity(supabase, 'suppliers', old.id, 'DELETE', old)
    setShowModal(false)
    setEditSupplier(null)
    fetchSuppliers()
    setUndoToast({
      message: `"${old.name}" deleted.`,
      onUndo: async () => {
        await supabase.from('suppliers').upsert([old])
        await logActivity(supabase, 'suppliers', old.id, 'UPDATE', null, old)
        setUndoToast(null)
        fetchSuppliers()
      },
    })
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
    setSnapshot([...suppliers])
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
      let success = 0, failed = 0
      for (const row of rows) {
        const name = String(row['Company Name'] || row['name'] || '').trim()
        if (!name) { failed++; continue }
        const payload = {
          name,
          contact_name: String(row['Contact Name'] || row['contact_name'] || ''),
          contact_email: String(row['Contact Email'] || row['contact_email'] || ''),
          contact_phone: String(row['Contact Phone'] || row['contact_phone'] || ''),
          country: String(row['Country'] || row['country'] || 'Canada'),
          notes: String(row['Notes'] || row['notes'] || ''),
          ship_to_address: String(row['Ship To Address'] || row['address'] || ''),
          ship_to_city: String(row['Ship To City'] || ''),
          ship_to_province: String(row['Ship To Province'] || ''),
          ship_to_postal_code: String(row['Ship To Postal Code'] || ''),
        }
        const { data: existing } = await supabase.from('suppliers').select('id').eq('name', name).maybeSingle()
        let error
        if (existing) {
          ;({ error } = await supabase.from('suppliers').update(payload).eq('id', existing.id))
        } else {
          ;({ error } = await supabase.from('suppliers').insert([payload]))
        }
        if (error) failed++; else success++
      }
      setImportResult(`✅ ${success} suppliers imported.${failed > 0 ? ` ❌ ${failed} failed.` : ''}`)
      fetchSuppliers()
    } catch {
      setImportResult('❌ Error reading file. Please check the format.')
    }
    setImporting(false)
  }

  async function handleUndo() {
    if (!snapshot) return
    setUndoRestoring(true)
    await supabase.from('suppliers').upsert(snapshot, { onConflict: 'id' })
    setSnapshot(null)
    setImportResult('')
    fetchSuppliers()
    setUndoRestoring(false)
  }

  function downloadTemplate() {
    const rows = [{
      'Company Name': 'Jedwards International',
      'Contact Name': 'Jane Doe',
      'Contact Email': 'jane@supplier.com',
      'Contact Phone': '+1-800-000-0000',
      'Country': 'USA',
      'Ship To Address': '123 Warehouse St',
      'Ship To City': 'Boston',
      'Ship To Province': 'MA',
      'Ship To Postal Code': '02101',
      'Bill To Same As Ship To': true,
      'Bill To Address': '',
      'Bill To City': '',
      'Bill To Province': '',
      'Bill To Postal Code': '',
      'Notes': 'Main oil supplier',
    }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Template')
    XLSX.writeFile(wb, 'suppliers_template.xlsx')
  }

  const filtered = suppliers.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.country?.toLowerCase().includes(search.toLowerCase()) ||
    s.ship_to_city?.toLowerCase().includes(search.toLowerCase())
  )

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '5px' }

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .modal-grid-2, .modal-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>

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
            <input ref={importFileRef} type='file' accept='.xlsx,.xls' onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
          <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={16} /> Add Supplier
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
                {(s.ship_to_address || s.ship_to_city) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '13px', color: '#64748b' }}>
                    <MapPin size={14} style={{ marginTop: '2px', flexShrink: 0, color: '#16a34a' }} />
                    <span>
                      <span style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginRight: '4px' }}>Ship To</span>
                      {[s.ship_to_address, s.ship_to_city, s.ship_to_province, s.ship_to_postal_code].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {s.notes && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>{s.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Confirm Modal */}
      {showImportConfirm && (
        <div onClick={() => { setShowImportConfirm(false); setPendingFile(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '440px', maxWidth: '90vw' }}>
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditSupplier(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '520px', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              {editSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </h2>

            {/* Basic Info */}
            {[
              { label: 'Company Name *', key: 'name', placeholder: 'Jedwards International' },
              { label: 'Contact Name', key: 'contact_name', placeholder: 'Jane Doe' },
              { label: 'Contact Email', key: 'contact_email', placeholder: 'jane@supplier.com' },
              { label: 'Contact Phone', key: 'contact_phone', placeholder: '+1-800-000-0000' },
              { label: 'Country', key: 'country', placeholder: 'USA' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '12px' }}>
                <label style={lbl}>{field.label}</label>
                <input value={form[field.key as keyof typeof form]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} style={inp} />
              </div>
            ))}

            {/* Ship To */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', marginTop: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block', flexShrink: 0 }} />
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ship To</div>
            </div>
            {[
              { label: 'Address', key: 'ship_to_address', placeholder: '123 Warehouse St' },
              { label: 'City', key: 'ship_to_city', placeholder: 'Toronto' },
              { label: 'Province / State', key: 'ship_to_province', placeholder: 'ON' },
              { label: 'Postal Code', key: 'ship_to_postal_code', placeholder: 'M1M 1M1' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '10px' }}>
                <label style={lbl}>{field.label}</label>
                <input value={form[field.key as keyof typeof form]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder} style={inp} />
              </div>
            ))}


            {/* Notes */}
            <div style={{ marginBottom: '14px', marginTop: '4px' }}>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder='e.g. Main oil supplier' style={inp} />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '8px', alignItems: 'center' }}>
              <div>
                {editSupplier && (
                  <button onClick={handleDelete} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setShowModal(false); setEditSupplier(null) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                  {editSupplier ? 'Save Changes' : 'Save Supplier'}
                </button>
              </div>
            </div>
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
