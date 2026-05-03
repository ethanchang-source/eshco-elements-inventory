'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { ShoppingCart, Plus, Search, Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Supplier { id: string; name: string }
interface RawMaterial { id: string; item_no: string; name: string; unit: string; cost_per_unit_cad: number; current_stock: number }
interface PackagingItem { id: string; item_no: string; name: string; cost_cad: number; current_stock: number }

interface PO {
  id: string
  supplier_id: string
  item_type: 'raw_material' | 'packaging'
  raw_material_id: string | null
  packaging_id: string | null
  qty_ordered: number
  qty_received: number | null
  unit: string | null
  cost_total_cad: number
  shipping_cad: number | null
  brokerage_cad: number | null
  duty_cad: number | null
  status: 'draft' | 'ordered' | 'received' | 'cancelled'
  ordered_at: string
  received_at: string | null
  notes: string | null
  suppliers?: { name: string }
  raw_materials?: { item_no: string; name: string }
  packaging?: { item_no: string; name: string }
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
  ordered:   { bg: '#eff6ff', color: '#2563eb', label: 'Ordered' },
  received:  { bg: '#f0fdf4', color: '#16a34a', label: 'Received' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' },
}

const emptyForm = {
  supplier_id: '',
  item_type: 'raw_material' as 'raw_material' | 'packaging',
  raw_material_id: '',
  packaging_id: '',
  qty_ordered: '',
  unit: '',
  cost_total_cad: '',
  shipping_cad: '',
  brokerage_cad: '',
  duty_cad: '',
  ordered_at: new Date().toISOString().slice(0, 10),
  notes: '',
}

export default function Purchasing() {
  const [pos, setPOs] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packaging, setPackaging] = useState<PackagingItem[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')

  const [showDetail, setShowDetail] = useState(false)
  const [detail, setDetail] = useState<PO | null>(null)
  const [receiving, setReceiving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showCreate) { setShowCreate(false); setCreateError(''); return }
      if (showDetail) setShowDetail(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCreate, showDetail])

  async function fetchAll() {
    const [posRes, suppRes, rawRes, pkgRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*, suppliers(name), raw_materials(item_no, name), packaging(item_no, name)')
        .order('ordered_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('raw_materials').select('id, item_no, name, unit, cost_per_unit_cad, current_stock').order('item_no'),
      supabase.from('packaging').select('id, item_no, name, cost_cad, current_stock').order('item_no'),
    ])
    setPOs(posRes.data || [])
    setSuppliers(suppRes.data || [])
    setRawMaterials(rawRes.data || [])
    setPackaging(pkgRes.data || [])
    setLoading(false)
  }

  function getMaterialLabel(po: PO): string {
    if (po.item_type === 'raw_material' && po.raw_materials) {
      return `${po.raw_materials.item_no} — ${po.raw_materials.name}`
    }
    if (po.item_type === 'packaging' && po.packaging) {
      return `${po.packaging.item_no} — ${po.packaging.name}`
    }
    return '—'
  }

  async function handleCreate() {
    setCreateError('')
    if (!form.supplier_id) { setCreateError('Please select a supplier.'); return }
    if (!form.ordered_at) { setCreateError('Please enter an order date.'); return }
    if (!form.qty_ordered || parseFloat(form.qty_ordered) <= 0) { setCreateError('Please enter a valid quantity.'); return }
    if (!form.cost_total_cad || parseFloat(form.cost_total_cad) < 0) { setCreateError('Please enter the total cost.'); return }
    if (form.item_type === 'raw_material' && !form.raw_material_id) { setCreateError('Please select a raw material.'); return }
    if (form.item_type === 'packaging' && !form.packaging_id) { setCreateError('Please select a packaging item.'); return }

    setSaving(true)

    const payload = {
      supplier_id: form.supplier_id,
      item_type: form.item_type,
      raw_material_id: form.item_type === 'raw_material' ? form.raw_material_id : null,
      packaging_id: form.item_type === 'packaging' ? form.packaging_id : null,
      qty_ordered: parseFloat(form.qty_ordered),
      qty_received: null,
      unit: form.unit || null,
      cost_total_cad: parseFloat(form.cost_total_cad) || 0,
      shipping_cad: form.shipping_cad ? parseFloat(form.shipping_cad) : null,
      brokerage_cad: form.brokerage_cad ? parseFloat(form.brokerage_cad) : null,
      duty_cad: form.duty_cad ? parseFloat(form.duty_cad) : null,
      status: 'ordered',
      ordered_at: form.ordered_at,
      notes: form.notes || null,
    }

    const { error } = await supabase.from('purchase_orders').insert([payload])

    if (error) {
      console.error('PO insert error:', error)
      setCreateError(error.message || 'Failed to create purchase order. Check RLS policies.')
      setSaving(false)
      return
    }

    setSaving(false)
    setShowCreate(false)
    setCreateError('')
    setForm({ ...emptyForm })
    fetchAll()
  }

  async function handleStatusChange(newStatus: 'ordered' | 'cancelled') {
    if (!detail) return
    const { error } = await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', detail.id)
    if (error) { console.error('Status update error:', error); return }
    setDetail(d => d ? { ...d, status: newStatus } : d)
    fetchAll()
  }

  async function handleReceive() {
    if (!detail) return
    setReceiving(true)
    const today = new Date().toISOString().slice(0, 10)

    // Update inventory
    if (detail.item_type === 'raw_material' && detail.raw_material_id) {
      const { data: mat } = await supabase.from('raw_materials').select('current_stock').eq('id', detail.raw_material_id).single()
      await supabase.from('raw_materials').update({
        current_stock: (mat?.current_stock || 0) + detail.qty_ordered,
      }).eq('id', detail.raw_material_id)
    } else if (detail.item_type === 'packaging' && detail.packaging_id) {
      const { data: pkg } = await supabase.from('packaging').select('current_stock').eq('id', detail.packaging_id).single()
      await supabase.from('packaging').update({
        current_stock: (pkg?.current_stock || 0) + detail.qty_ordered,
      }).eq('id', detail.packaging_id)
    }

    await supabase.from('purchase_orders').update({
      status: 'received',
      qty_received: detail.qty_ordered,
      received_at: today,
    }).eq('id', detail.id)

    setDetail(d => d ? { ...d, status: 'received', qty_received: d.qty_ordered, received_at: today } : d)
    setReceiving(false)
    fetchAll()
  }

  function handleExport() {
    const rows = pos.map(po => ({
      'Supplier': po.suppliers?.name || '',
      'Item Type': po.item_type === 'raw_material' ? 'Raw Material' : 'Packaging',
      'Material': getMaterialLabel(po),
      'Qty Ordered': po.qty_ordered,
      'Qty Received': po.qty_received ?? '',
      'Unit': po.unit || '',
      'Cost Total (CAD)': po.cost_total_cad || 0,
      'Shipping (CAD)': po.shipping_cad ?? '',
      'Brokerage (CAD)': po.brokerage_cad ?? '',
      'Duty (CAD)': po.duty_cad ?? '',
      'Status': STATUS_STYLE[po.status]?.label || po.status,
      'Order Date': po.ordered_at,
      'Received Date': po.received_at || '',
      'Notes': po.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchase Orders')
    XLSX.writeFile(wb, `purchase_orders_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Auto-fill unit when material selected
  function handleMaterialSelect(id: string) {
    if (form.item_type === 'raw_material') {
      const mat = rawMaterials.find(r => r.id === id)
      setForm(f => ({ ...f, raw_material_id: id, unit: mat?.unit || f.unit }))
    } else {
      setForm(f => ({ ...f, packaging_id: id }))
    }
  }

  const filtered = pos.filter(po =>
    po.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    getMaterialLabel(po).toLowerCase().includes(search.toLowerCase()) ||
    po.status?.toLowerCase().includes(search.toLowerCase())
  )

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '5px' }
  const numInp: React.CSSProperties = { ...inp, textAlign: 'right' }

  const materialOptions = form.item_type === 'raw_material'
    ? rawMaterials.map(m => ({ id: m.id, label: `${m.item_no} — ${m.name} (${m.unit})` }))
    : packaging.map(p => ({ id: p.id, label: `${p.item_no} — ${p.name}` }))

  const selectedMaterialId = form.item_type === 'raw_material' ? form.raw_material_id : form.packaging_id

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .modal-grid-2, .modal-grid-3, .modal-grid-4 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search supplier, material, status...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> Export Excel
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreateError(''); setForm({ ...emptyForm }) }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
          >
            <Plus size={16} /> New PO
          </button>
        </div>
      </div>

      {/* PO Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <ShoppingCart size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No purchase orders yet
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '800px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Supplier', 'Material', 'Qty Ordered', 'Qty Received', 'Cost (CAD)', 'Status', 'Order Date', 'Received Date'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((po, i) => {
                const st = STATUS_STYLE[po.status] || STATUS_STYLE.draft
                return (
                  <tr
                    key={po.id}
                    onClick={() => { setDetail(po); setShowDetail(true) }}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', color: '#374151', fontWeight: '500' }}>{po.suppliers?.name || '—'}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{getMaterialLabel(po)}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{po.qty_ordered} {po.unit || ''}</td>
                    <td style={{ padding: '14px 16px', color: po.qty_received != null ? '#16a34a' : '#94a3b8' }}>{po.qty_received != null ? `${po.qty_received} ${po.unit || ''}` : '—'}</td>
                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: '500' }}>${formatCurrency(po.cost_total_cad || 0)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ display: 'inline-block', background: st.bg, color: st.color, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{po.ordered_at}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{po.received_at || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create PO Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setCreateError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '620px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>New Purchase Order</h2>
              <button onClick={() => { setShowCreate(false); setCreateError('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            {/* Supplier + Date */}
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Supplier *</label>
                <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} style={inp}>
                  <option value=''>Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Order Date *</label>
                <input type='date' value={form.ordered_at} onChange={e => setForm(f => ({ ...f, ordered_at: e.target.value }))} style={inp} />
              </div>
            </div>

            {/* Item Type + Material */}
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Item Type *</label>
                <select
                  value={form.item_type}
                  onChange={e => setForm(f => ({ ...f, item_type: e.target.value as 'raw_material' | 'packaging', raw_material_id: '', packaging_id: '' }))}
                  style={inp}
                >
                  <option value='raw_material'>Raw Material</option>
                  <option value='packaging'>Packaging</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Material *</label>
                <select value={selectedMaterialId} onChange={e => handleMaterialSelect(e.target.value)} style={inp}>
                  <option value=''>Select material...</option>
                  {materialOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Qty + Unit */}
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Qty Ordered *</label>
                <input type='number' min='0' step='any' value={form.qty_ordered} onChange={e => setForm(f => ({ ...f, qty_ordered: e.target.value }))} placeholder='0' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Unit</label>
                <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder='kg, L, pcs...' style={inp} />
              </div>
            </div>

            {/* Cost fields */}
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Cost Total (CAD) *</label>
                <input type='number' min='0' step='0.01' value={form.cost_total_cad} onChange={e => setForm(f => ({ ...f, cost_total_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Shipping (CAD)</label>
                <input type='number' min='0' step='0.01' value={form.shipping_cad} onChange={e => setForm(f => ({ ...f, shipping_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Brokerage (CAD)</label>
                <input type='number' min='0' step='0.01' value={form.brokerage_cad} onChange={e => setForm(f => ({ ...f, brokerage_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Duty (CAD)</label>
                <input type='number' min='0' step='0.01' value={form.duty_cad} onChange={e => setForm(f => ({ ...f, duty_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Optional notes...' style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {createError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => { setShowCreate(false); setCreateError('') }} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {saving ? 'Saving...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && detail && (
        <div className="modal-overlay" onClick={() => setShowDetail(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '560px', margin: '20px auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 4px' }}>{detail.suppliers?.name || '—'}</h2>
                <div style={{ fontSize: '13px', color: '#64748b' }}>{getMaterialLabel(detail)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ background: STATUS_STYLE[detail.status]?.bg, color: STATUS_STYLE[detail.status]?.color, borderRadius: '20px', padding: '4px 12px', fontSize: '13px', fontWeight: '500' }}>
                  {STATUS_STYLE[detail.status]?.label}
                </span>
                <button onClick={() => setShowDetail(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              </div>
            </div>

            {/* Info grid */}
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px', background: '#f8fafc', borderRadius: '8px', marginBottom: '20px' }}>
              {[
                { label: 'Item Type', value: detail.item_type === 'raw_material' ? 'Raw Material' : 'Packaging' },
                { label: 'Qty Ordered', value: `${detail.qty_ordered} ${detail.unit || ''}`.trim() },
                { label: 'Qty Received', value: detail.qty_received != null ? `${detail.qty_received} ${detail.unit || ''}`.trim() : '—' },
                { label: 'Cost Total (CAD)', value: `$${formatCurrency(detail.cost_total_cad || 0)}` },
                { label: 'Shipping (CAD)', value: detail.shipping_cad != null ? `$${formatCurrency(detail.shipping_cad)}` : '—' },
                { label: 'Brokerage (CAD)', value: detail.brokerage_cad != null ? `$${formatCurrency(detail.brokerage_cad)}` : '—' },
                { label: 'Duty (CAD)', value: detail.duty_cad != null ? `$${formatCurrency(detail.duty_cad)}` : '—' },
                { label: 'Order Date', value: detail.ordered_at },
                { label: 'Received Date', value: detail.received_at || '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: '14px', color: '#374151' }}>{value}</div>
                </div>
              ))}
              {detail.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>Notes</div>
                  <div style={{ fontSize: '14px', color: '#374151' }}>{detail.notes}</div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDetail(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Close</button>
              {detail.status === 'ordered' && (
                <>
                  <button onClick={() => handleStatusChange('cancelled')} style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Cancel PO</button>
                  <button onClick={handleReceive} disabled={receiving} style={{ padding: '8px 16px', background: receiving ? '#86efac' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: receiving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                    {receiving ? 'Processing...' : 'Mark as Received'}
                  </button>
                </>
              )}
              {detail.status === 'draft' && (
                <>
                  <button onClick={() => handleStatusChange('cancelled')} style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                  <button onClick={() => handleStatusChange('ordered')} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Mark as Ordered</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
