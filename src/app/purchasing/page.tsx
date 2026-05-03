'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { ShoppingCart, Plus, Search, Download, X, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Supplier { id: string; name: string }
interface RawMaterial { id: string; item_no: string; name: string; unit: string; cost_per_unit_cad: number }
interface PackagingItem { id: string; item_no: string; name: string; cost_cad: number }

interface LineItem {
  material_type: 'raw_material' | 'packaging'
  material_id: string
  quantity: string
  unit_price: string
}

interface PO {
  id: string
  po_number: string
  supplier_id: string
  order_date: string
  received_date: string | null
  status: 'draft' | 'ordered' | 'received' | 'cancelled'
  notes: string
  total_amount: number
  suppliers?: { name: string }
}

interface PODetailItem {
  id: string
  material_type: string
  material_id: string
  quantity: number
  unit_price: number
  line_total: number
}

interface PODetail extends PO {
  purchase_order_items: PODetailItem[]
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
  ordered:   { bg: '#eff6ff', color: '#2563eb', label: 'Ordered' },
  received:  { bg: '#f0fdf4', color: '#16a34a', label: 'Received' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' },
}

const emptyLine = (): LineItem => ({ material_type: 'raw_material', material_id: '', quantity: '', unit_price: '' })

export default function Purchasing() {
  const [pos, setPOs] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packaging, setPackaging] = useState<PackagingItem[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [saving, setSaving] = useState(false)

  const [createError, setCreateError] = useState('')

  const [showDetail, setShowDetail] = useState(false)
  const [detail, setDetail] = useState<PODetail | null>(null)
  const [receiving, setReceiving] = useState(false)

  useEffect(() => { document.title = 'Purchasing | I AM PURE' }, [])
  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [posRes, suppRes, rawRes, pkgRes] = await Promise.all([
      supabase.from('purchase_orders').select('*, suppliers(name)').order('order_date', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('raw_materials').select('id, item_no, name, unit, cost_per_unit_cad').order('item_no'),
      supabase.from('packaging').select('id, item_no, name, cost_cad').order('item_no'),
    ])
    setPOs(posRes.data || [])
    setSuppliers(suppRes.data || [])
    setRawMaterials(rawRes.data || [])
    setPackaging(pkgRes.data || [])
    setLoading(false)
  }

  async function openDetail(po: PO) {
    const { data } = await supabase.from('purchase_order_items').select('*').eq('po_id', po.id)
    setDetail({ ...po, purchase_order_items: data || [] })
    setShowDetail(true)
  }

  function getMaterialLabel(type: string, id: string): string {
    if (type === 'raw_material') {
      const m = rawMaterials.find(r => r.id === id)
      return m ? `${m.item_no} — ${m.name}` : id
    }
    const p = packaging.find(pk => pk.id === id)
    return p ? `${p.item_no} — ${p.name}` : id
  }

  async function generatePONumber(): Promise<string> {
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('purchase_orders')
      .select('po_number')
      .ilike('po_number', `PO-${year}-%`)
      .order('po_number', { ascending: false })
      .limit(1)
    const last = data && data.length > 0 ? parseInt(data[0].po_number.split('-')[2] || '0') : 0
    return `PO-${year}-${String(last + 1).padStart(3, '0')}`
  }

  async function handleCreate() {
    setCreateError('')
    if (!form.supplier_id) { setCreateError('Please select a supplier.'); return }
    if (!form.order_date) { setCreateError('Please enter an order date.'); return }
    const validLines = lines.filter(l => l.material_id && l.quantity && l.unit_price)
    if (validLines.length === 0) { setCreateError('Please add at least one line item with material, quantity, and unit price.'); return }
    setSaving(true)

    const poNumber = await generatePONumber()
    const totalAmount = validLines.reduce((sum, l) => sum + parseFloat(l.quantity) * parseFloat(l.unit_price), 0)

    const { data: poData, error: poError } = await supabase.from('purchase_orders').insert([{
      po_number: poNumber,
      supplier_id: form.supplier_id,
      order_date: form.order_date,
      status: 'draft',
      notes: form.notes || null,
      total_amount: totalAmount,
    }]).select().single()

    if (poError || !poData) {
      console.error('PO insert error:', poError)
      setCreateError(poError?.message || 'Failed to create purchase order. Check RLS policies or DB connection.')
      setSaving(false)
      return
    }

    const { error: itemsError } = await supabase.from('purchase_order_items').insert(
      validLines.map(l => ({
        po_id: poData.id,
        material_type: l.material_type,
        material_id: l.material_id,
        quantity: parseFloat(l.quantity),
        unit_price: parseFloat(l.unit_price),
        line_total: parseFloat(l.quantity) * parseFloat(l.unit_price),
      }))
    )

    if (itemsError) {
      console.error('PO items insert error:', itemsError)
      setCreateError(`PO created but line items failed: ${itemsError.message}`)
      setSaving(false)
      fetchAll()
      return
    }

    setSaving(false)
    setShowCreate(false)
    setCreateError('')
    setForm({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), notes: '' })
    setLines([emptyLine()])
    fetchAll()
  }

  async function handleStatusChange(newStatus: 'ordered' | 'cancelled') {
    if (!detail) return
    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', detail.id)
    setDetail(d => d ? { ...d, status: newStatus } : d)
    fetchAll()
  }

  async function handleReceive() {
    if (!detail) return
    setReceiving(true)
    for (const item of detail.purchase_order_items) {
      if (item.material_type === 'raw_material') {
        const { data: mat } = await supabase.from('raw_materials').select('current_stock').eq('id', item.material_id).single()
        await supabase.from('raw_materials').update({
          current_stock: (mat?.current_stock || 0) + item.quantity,
          cost_per_unit_cad: item.unit_price,
        }).eq('id', item.material_id)
      } else {
        const { data: pkg } = await supabase.from('packaging').select('current_stock').eq('id', item.material_id).single()
        await supabase.from('packaging').update({
          current_stock: (pkg?.current_stock || 0) + item.quantity,
          cost_cad: item.unit_price,
        }).eq('id', item.material_id)
      }
    }
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('purchase_orders').update({ status: 'received', received_date: today }).eq('id', detail.id)
    setDetail(d => d ? { ...d, status: 'received', received_date: today } : d)
    setReceiving(false)
    fetchAll()
  }

  function handleExport() {
    const rows = pos.map(po => ({
      'PO Number': po.po_number,
      'Supplier': po.suppliers?.name || '',
      'Order Date': po.order_date,
      'Received Date': po.received_date || '',
      'Status': STATUS_STYLE[po.status]?.label || po.status,
      'Total (CAD)': po.total_amount ? po.total_amount.toFixed(2) : '0.00',
      'Notes': po.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchase Orders')
    XLSX.writeFile(wb, `purchase_orders_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const updated = { ...l, [field]: value }
      if (field === 'material_type') {
        updated.material_id = ''
        updated.unit_price = ''
      }
      if (field === 'material_id') {
        if (l.material_type === 'raw_material') {
          const mat = rawMaterials.find(r => r.id === value)
          if (mat) updated.unit_price = String(mat.cost_per_unit_cad ?? '')
        } else {
          const pkg = packaging.find(p => p.id === value)
          if (pkg) updated.unit_price = String(pkg.cost_cad ?? '')
        }
      }
      return updated
    }))
  }

  const filtered = pos.filter(po =>
    po.po_number?.toLowerCase().includes(search.toLowerCase()) ||
    po.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    po.status?.toLowerCase().includes(search.toLowerCase())
  )

  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500' as const, color: '#374151', marginBottom: '6px' }

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .modal-grid-2, .modal-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search PO number, supplier...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> Export Excel
          </button>
          <button onClick={() => { setShowCreate(true); setCreateError(''); setLines([emptyLine()]); setForm({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), notes: '' }) }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
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
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['PO Number', 'Supplier', 'Order Date', 'Received Date', 'Status', 'Total (CAD)'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((po, i) => {
                const st = STATUS_STYLE[po.status] || STATUS_STYLE.draft
                return (
                  <tr
                    key={po.id}
                    onClick={() => openDetail(po)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: '600', color: '#1e293b' }}>{po.po_number}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{po.suppliers?.name || '—'}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{po.order_date}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{po.received_date || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ display: 'inline-block', background: st.bg, color: st.color, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: '500' }}>
                      ${formatCurrency(po.total_amount || 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create PO Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '40px 16px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '700px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>New Purchase Order</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>Supplier *</label>
                <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} style={inputStyle}>
                  <option value=''>Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Order Date *</label>
                <input type='date' value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder='Optional notes...' style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {/* Line Items */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Line Items *</label>
                <button onClick={() => setLines(l => [...l, emptyLine()])} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer' }}>
                  <Plus size={14} /> Add Item
                </button>
              </div>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 110px 90px 32px', gap: '8px', marginBottom: '6px', padding: '0 4px' }}>
                {['Type', 'Material', 'Qty', 'Unit Price', 'Line Total', ''].map(h => (
                  <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lines.map((line, idx) => {
                  const lineTotal = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)
                  const options = line.material_type === 'raw_material'
                    ? rawMaterials.map(m => ({ id: m.id, label: `${m.item_no} — ${m.name} (${m.unit})` }))
                    : packaging.map(p => ({ id: p.id, label: `${p.item_no} — ${p.name}` }))
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 110px 90px 32px', gap: '8px', alignItems: 'center' }}>
                      <select value={line.material_type} onChange={e => updateLine(idx, 'material_type', e.target.value)} style={{ ...inputStyle, padding: '7px 8px' }}>
                        <option value='raw_material'>Raw Material</option>
                        <option value='packaging'>Packaging</option>
                      </select>
                      <select value={line.material_id} onChange={e => updateLine(idx, 'material_id', e.target.value)} style={{ ...inputStyle, padding: '7px 8px' }}>
                        <option value=''>Select...</option>
                        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      <input type='number' min='0' value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} placeholder='Qty' style={{ ...inputStyle, padding: '7px 10px' }} />
                      <input type='number' min='0' step='0.0001' value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} placeholder='0.0000' style={{ ...inputStyle, padding: '7px 10px' }} />
                      <div style={{ fontSize: '14px', color: '#374151', fontWeight: '500', padding: '0 4px' }}>
                        ${formatCurrency(lineTotal)}
                      </div>
                      <button onClick={() => setLines(l => l.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b' }}>
                  Total: ${formatCurrency(lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0))} CAD
                </div>
              </div>
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
        <div className="modal-overlay" onClick={() => setShowDetail(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '40px 16px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '660px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 4px' }}>{detail.po_number}</h2>
                <div style={{ fontSize: '13px', color: '#64748b' }}>{detail.suppliers?.name}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ display: 'inline-block', background: STATUS_STYLE[detail.status]?.bg, color: STATUS_STYLE[detail.status]?.color, borderRadius: '20px', padding: '4px 12px', fontSize: '13px', fontWeight: '500' }}>
                  {STATUS_STYLE[detail.status]?.label}
                </span>
                <button onClick={() => setShowDetail(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              </div>
            </div>

            {/* PO Info */}
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Order Date</div>
                <div style={{ fontSize: '14px', color: '#374151' }}>{detail.order_date}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Received Date</div>
                <div style={{ fontSize: '14px', color: '#374151' }}>{detail.received_date || '—'}</div>
              </div>
              {detail.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Notes</div>
                  <div style={{ fontSize: '14px', color: '#374151' }}>{detail.notes}</div>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>Line Items</div>
              {detail.purchase_order_items.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '16px' }}>No items</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Type', 'Material', 'Qty', 'Unit Price', 'Line Total'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.purchase_order_items.map((item, i) => (
                      <tr key={item.id} style={{ borderBottom: i < detail.purchase_order_items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: item.material_type === 'raw_material' ? '#f0fdf4' : '#eff6ff', color: item.material_type === 'raw_material' ? '#16a34a' : '#2563eb', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>
                            {item.material_type === 'raw_material' ? 'Raw' : 'Packaging'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#374151' }}>{getMaterialLabel(item.material_type, item.material_id)}</td>
                        <td style={{ padding: '10px 12px', color: '#374151' }}>{item.quantity}</td>
                        <td style={{ padding: '10px 12px', color: '#374151' }}>${(item.unit_price || 0).toFixed(4)}</td>
                        <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: '500' }}>${formatCurrency(item.line_total || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#374151', fontSize: '14px' }}>Total</td>
                      <td style={{ padding: '10px 12px', fontWeight: '700', color: '#1e293b', fontSize: '15px' }}>${formatCurrency(detail.total_amount || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowDetail(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Close</button>
              {detail.status === 'draft' && (
                <>
                  <button onClick={() => handleStatusChange('cancelled')} style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Cancel PO</button>
                  <button onClick={() => handleStatusChange('ordered')} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Mark as Ordered</button>
                </>
              )}
              {detail.status === 'ordered' && (
                <>
                  <button onClick={() => handleStatusChange('cancelled')} style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Cancel PO</button>
                  <button onClick={handleReceive} disabled={receiving} style={{ padding: '8px 16px', background: receiving ? '#86efac' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: receiving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                    {receiving ? 'Processing...' : 'Mark as Received'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
