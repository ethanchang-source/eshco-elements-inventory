'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { ShoppingCart, Plus, Search, Download, X, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Supplier { id: string; name: string }
interface RawMaterial { id: string; item_no: string; name: string; unit: string; cost_per_unit_cad: number }
interface PackagingItem { id: string; item_no: string; name: string; type: string | null; cost_cad: number }

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
  status: 'draft' | 'ordered' | 'shipped' | 'received' | 'cancelled'
  ordered_at: string
  shipped_at: string | null
  received_at: string | null
  notes: string | null
  po_number: string | null
  suppliers?: { name: string }
  raw_materials?: { item_no: string; name: string }
  packaging?: { item_no: string; name: string }
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
  ordered:   { bg: '#eff6ff', color: '#2563eb', label: 'Ordered' },
  shipped:   { bg: '#fef3c7', color: '#d97706', label: 'Shipped' },
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

function calcDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const d = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
  return d >= 0 ? d : null
}

const UNIT_SELECT = (value: string, onChange: (v: string) => void, style: React.CSSProperties) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={style}>
    <option value=''>—</option>
    <optgroup label='Volume'>
      <option value='mL'>mL</option>
      <option value='L'>L</option>
      <option value='fl oz'>fl oz</option>
      <option value='gal'>gal</option>
    </optgroup>
    <optgroup label='Weight'>
      <option value='g'>g</option>
      <option value='kg'>kg</option>
      <option value='lb'>lb</option>
      <option value='oz'>oz</option>
    </optgroup>
    <optgroup label='Count'>
      <option value='ea'>ea</option>
      <option value='box'>box</option>
      <option value='case'>case</option>
      <option value='pack'>pack</option>
      <option value='roll'>roll</option>
      <option value='sheet'>sheet</option>
      <option value='bag'>bag</option>
      <option value='bottle'>bottle</option>
      <option value='jar'>jar</option>
      <option value='tube'>tube</option>
      <option value='pallet'>pallet</option>
    </optgroup>
    <optgroup label='Length'>
      <option value='mm'>mm</option>
      <option value='cm'>cm</option>
      <option value='m'>m</option>
      <option value='inch'>inch</option>
      <option value='ft'>ft</option>
    </optgroup>
  </select>
)

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
  const [editForm, setEditForm] = useState({ ...emptyForm })
  const [updateError, setUpdateError] = useState('')
  const [updating, setUpdating] = useState(false)

  const [showStatusModal, setShowStatusModal] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<'shipped' | 'received' | 'cancelled' | 'ordered'>('shipped')
  const [statusDate, setStatusDate] = useState(new Date().toISOString().slice(0, 10))
  const [statusTransitioning, setStatusTransitioning] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showDeleteConfirm) { setShowDeleteConfirm(false); setDeleteError(''); return }
      if (showStatusModal) { setShowStatusModal(false); return }
      if (showCreate) { setShowCreate(false); setCreateError(''); return }
      if (showDetail) { setShowDetail(false); setUpdateError(''); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCreate, showDetail, showStatusModal, showDeleteConfirm])

  async function fetchAll() {
    const [posRes, suppRes, rawRes, pkgRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*, suppliers(name), raw_materials(item_no, name), packaging(item_no, name)')
        .order('ordered_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('raw_materials').select('id, item_no, name, unit, cost_per_unit_cad').order('item_no'),
      supabase.from('packaging').select('id, item_no, name, type, cost_cad').order('item_no'),
    ])
    setPOs(posRes.data || [])
    setSuppliers(suppRes.data || [])
    setRawMaterials(rawRes.data || [])
    setPackaging(pkgRes.data || [])
    setLoading(false)
  }

  function getMaterialLabel(po: PO): string {
    if (po.item_type === 'raw_material' && po.raw_materials) return `${po.raw_materials.item_no} — ${po.raw_materials.name}`
    if (po.item_type === 'packaging' && po.packaging) return `${po.packaging.item_no} — ${po.packaging.name}`
    return '—'
  }

  function openDetail(po: PO) {
    setDetail(po)
    setEditForm({
      supplier_id: po.supplier_id,
      item_type: po.item_type,
      raw_material_id: po.raw_material_id || '',
      packaging_id: po.packaging_id || '',
      qty_ordered: String(po.qty_ordered),
      unit: po.unit || '',
      cost_total_cad: String(po.cost_total_cad ?? ''),
      shipping_cad: po.shipping_cad != null ? String(po.shipping_cad) : '',
      brokerage_cad: po.brokerage_cad != null ? String(po.brokerage_cad) : '',
      duty_cad: po.duty_cad != null ? String(po.duty_cad) : '',
      ordered_at: po.ordered_at,
      notes: po.notes || '',
    })
    setUpdateError('')
    setShowDetail(true)
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
    const { error } = await supabase.from('purchase_orders').insert([{
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
      // inventory is NOT updated here — only when status becomes 'received'
    }])

    if (error) {
      console.error('PO insert error:', error)
      setCreateError(error.message || 'Failed to create purchase order.')
      setSaving(false)
      return
    }
    setSaving(false)
    setShowCreate(false)
    setCreateError('')
    setForm({ ...emptyForm })
    fetchAll()
  }

  async function handleUpdate() {
    if (!detail) return
    setUpdateError('')
    if (!editForm.supplier_id) { setUpdateError('Please select a supplier.'); return }
    if (!editForm.ordered_at) { setUpdateError('Please enter an order date.'); return }
    if (!editForm.qty_ordered || parseFloat(editForm.qty_ordered) <= 0) { setUpdateError('Please enter a valid quantity.'); return }
    if (!editForm.cost_total_cad || parseFloat(editForm.cost_total_cad) < 0) { setUpdateError('Please enter the total cost.'); return }
    if (editForm.item_type === 'raw_material' && !editForm.raw_material_id) { setUpdateError('Please select a raw material.'); return }
    if (editForm.item_type === 'packaging' && !editForm.packaging_id) { setUpdateError('Please select a packaging item.'); return }

    setUpdating(true)
    const { error } = await supabase.from('purchase_orders').update({
      supplier_id: editForm.supplier_id,
      item_type: editForm.item_type,
      raw_material_id: editForm.item_type === 'raw_material' ? editForm.raw_material_id : null,
      packaging_id: editForm.item_type === 'packaging' ? editForm.packaging_id : null,
      qty_ordered: parseFloat(editForm.qty_ordered),
      unit: editForm.unit || null,
      cost_total_cad: parseFloat(editForm.cost_total_cad) || 0,
      shipping_cad: editForm.shipping_cad ? parseFloat(editForm.shipping_cad) : null,
      brokerage_cad: editForm.brokerage_cad ? parseFloat(editForm.brokerage_cad) : null,
      duty_cad: editForm.duty_cad ? parseFloat(editForm.duty_cad) : null,
      ordered_at: editForm.ordered_at,
      notes: editForm.notes || null,
    }).eq('id', detail.id)

    if (error) {
      console.error('PO update error:', error)
      setUpdateError(error.message || 'Failed to update purchase order.')
      setUpdating(false)
      return
    }
    setUpdating(false)
    setShowDetail(false)
    fetchAll()
  }

  function initiateStatusChange(next: 'shipped' | 'received' | 'cancelled' | 'ordered') {
    if (next === 'ordered') {
      confirmDirectStatus('ordered')
      return
    }
    setPendingStatus(next)
    setStatusDate(new Date().toISOString().slice(0, 10))
    setShowStatusModal(true)
  }

  async function confirmDirectStatus(newStatus: 'ordered') {
    if (!detail) return
    const { error } = await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', detail.id)
    if (error) { console.error('Status update error:', error); return }
    setShowDetail(false)
    fetchAll()
  }

  async function confirmStatusTransition() {
    if (!detail) return
    setStatusTransitioning(true)

    console.log('[confirmStatusTransition] detail.status:', detail.status, '→ pendingStatus:', pendingStatus)

    const updatePayload: Record<string, unknown> = { status: pendingStatus }

    if (pendingStatus === 'shipped') {
      updatePayload.shipped_at = statusDate
    } else if (pendingStatus === 'received') {
      // Guard: only update inventory if current status is NOT already 'received'
      // This prevents double-counting if this function is somehow called twice
      if (detail.status === 'received') {
        console.warn('[confirmStatusTransition] PO is already received — skipping inventory update')
      } else {
        updatePayload.received_at = statusDate
        updatePayload.qty_received = detail.qty_ordered

        console.log('[confirmStatusTransition] updating inventory, qty_ordered:', detail.qty_ordered)

        if (detail.item_type === 'raw_material' && detail.raw_material_id) {
          const { data: mat, error: matFetchErr } = await supabase
            .from('raw_materials').select('current_stock').eq('id', detail.raw_material_id).single()
          if (matFetchErr) console.error('[confirmStatusTransition] raw_materials fetch error:', matFetchErr)
          const newStock = (mat?.current_stock || 0) + detail.qty_ordered
          console.log('[confirmStatusTransition] raw_material current_stock:', mat?.current_stock, '→', newStock)
          const { error: matUpdErr } = await supabase
            .from('raw_materials').update({ current_stock: newStock }).eq('id', detail.raw_material_id)
          if (matUpdErr) {
            console.error('[confirmStatusTransition] raw_materials update error:', matUpdErr)
            setStatusTransitioning(false)
            return
          }
        } else if (detail.item_type === 'packaging' && detail.packaging_id) {
          const { data: pkg, error: pkgFetchErr } = await supabase
            .from('packaging').select('current_stock').eq('id', detail.packaging_id).single()
          if (pkgFetchErr) console.error('[confirmStatusTransition] packaging fetch error:', pkgFetchErr)
          const newStock = (pkg?.current_stock || 0) + detail.qty_ordered
          console.log('[confirmStatusTransition] packaging current_stock:', pkg?.current_stock, '→', newStock)
          const { error: pkgUpdErr } = await supabase
            .from('packaging').update({ current_stock: newStock }).eq('id', detail.packaging_id)
          if (pkgUpdErr) {
            console.error('[confirmStatusTransition] packaging update error:', pkgUpdErr)
            setStatusTransitioning(false)
            return
          }
        }
      }
    }

    const { error } = await supabase.from('purchase_orders').update(updatePayload).eq('id', detail.id)
    if (error) { console.error('[confirmStatusTransition] PO status update error:', error); setStatusTransitioning(false); return }

    console.log('[confirmStatusTransition] done')
    setStatusTransitioning(false)
    setShowStatusModal(false)
    setShowDetail(false)
    fetchAll()
  }

  async function handleDelete() {
    if (!detail) return
    setDeleting(true)
    setDeleteError('')

    console.log('[handleDelete] starting delete for PO id:', detail.id, 'status:', detail.status)

    if (detail.status === 'received') {
      if (detail.item_type === 'raw_material' && detail.raw_material_id) {
        const { data: mat, error: matErr } = await supabase
          .from('raw_materials')
          .select('current_stock')
          .eq('id', detail.raw_material_id)
          .single()
        if (matErr) { console.error('[handleDelete] raw_materials fetch error:', matErr) }
        const newStock = Math.max(0, (mat?.current_stock || 0) - detail.qty_ordered)
        console.log('[handleDelete] updating raw_material current_stock to:', newStock)
        const { error: updErr } = await supabase
          .from('raw_materials')
          .update({ current_stock: newStock })
          .eq('id', detail.raw_material_id)
        if (updErr) {
          console.error('[handleDelete] raw_materials update error:', updErr)
          setDeleteError(updErr.message || 'Failed to update raw material stock.')
          setDeleting(false)
          return
        }
      } else if (detail.item_type === 'packaging' && detail.packaging_id) {
        const { data: pkg, error: pkgErr } = await supabase
          .from('packaging')
          .select('current_stock')
          .eq('id', detail.packaging_id)
          .single()
        if (pkgErr) { console.error('[handleDelete] packaging fetch error:', pkgErr) }
        const newStock = Math.max(0, (pkg?.current_stock || 0) - detail.qty_ordered)
        console.log('[handleDelete] updating packaging current_stock to:', newStock)
        const { error: updErr } = await supabase
          .from('packaging')
          .update({ current_stock: newStock })
          .eq('id', detail.packaging_id)
        if (updErr) {
          console.error('[handleDelete] packaging update error:', updErr)
          setDeleteError(updErr.message || 'Failed to update packaging stock.')
          setDeleting(false)
          return
        }
      }
    }

    console.log('[handleDelete] deleting purchase_orders row id:', detail.id)
    const { error } = await supabase.from('purchase_orders').delete().eq('id', detail.id)
    if (error) {
      console.error('[handleDelete] PO delete error:', error)
      setDeleteError(error.message || 'Failed to delete purchase order.')
      setDeleting(false)
      return
    }

    console.log('[handleDelete] delete successful')
    setDeleting(false)
    setShowDeleteConfirm(false)
    setShowDetail(false)
    fetchAll()
  }

  function handleExport() {
    const rows = pos.map(po => ({
      'PO Number': po.po_number || '',
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
      'Shipped Date': po.shipped_at || '',
      'Received Date': po.received_at || '',
      'Lead Time O→S (days)': calcDays(po.ordered_at, po.shipped_at) ?? '',
      'Lead Time S→R (days)': calcDays(po.shipped_at, po.received_at) ?? '',
      'Lead Time Total (days)': calcDays(po.ordered_at, po.received_at) ?? '',
      'Notes': po.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchase Orders')
    XLSX.writeFile(wb, `purchase_orders_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleMaterialSelect(id: string, isEdit: boolean) {
    if (!isEdit) {
      if (form.item_type === 'raw_material') {
        const mat = rawMaterials.find(r => r.id === id)
        setForm(f => ({ ...f, raw_material_id: id, unit: mat?.unit || f.unit, cost_total_cad: mat?.cost_per_unit_cad != null ? String(mat.cost_per_unit_cad) : f.cost_total_cad }))
      } else {
        const pkg = packaging.find(p => p.id === id)
        setForm(f => ({ ...f, packaging_id: id, cost_total_cad: pkg?.cost_cad != null ? String(pkg.cost_cad) : f.cost_total_cad }))
      }
    } else {
      if (editForm.item_type === 'raw_material') {
        const mat = rawMaterials.find(r => r.id === id)
        setEditForm(f => ({ ...f, raw_material_id: id, unit: mat?.unit || f.unit, cost_total_cad: mat?.cost_per_unit_cad != null ? String(mat.cost_per_unit_cad) : f.cost_total_cad }))
      } else {
        const pkg = packaging.find(p => p.id === id)
        setEditForm(f => ({ ...f, packaging_id: id, cost_total_cad: pkg?.cost_cad != null ? String(pkg.cost_cad) : f.cost_total_cad }))
      }
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
  const roInp: React.CSSProperties = { ...inp, background: '#f8fafc', color: '#64748b' }

  const createMatOpts = form.item_type === 'raw_material'
    ? rawMaterials.map(m => ({ id: m.id, label: `${m.item_no} — ${m.name}${m.unit ? ` (${m.unit})` : ''}` }))
    : packaging.map(p => ({ id: p.id, label: `${p.item_no} — ${p.name}${p.type ? ` [${p.type}]` : ''}` }))
  const editMatOpts = editForm.item_type === 'raw_material'
    ? rawMaterials.map(m => ({ id: m.id, label: `${m.item_no} — ${m.name}${m.unit ? ` (${m.unit})` : ''}` }))
    : packaging.map(p => ({ id: p.id, label: `${p.item_no} — ${p.name}${p.type ? ` [${p.type}]` : ''}` }))

  const isReadOnly = detail?.status === 'received'

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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '860px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Supplier', 'Material', 'Qty', 'Cost (CAD)', 'Status', 'Order Date', 'Lead Time'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((po, i) => {
                const st = STATUS_STYLE[po.status] || STATUS_STYLE.draft
                const os = calcDays(po.ordered_at, po.shipped_at)
                const sr = calcDays(po.shipped_at, po.received_at)
                const total = calcDays(po.ordered_at, po.received_at)
                return (
                  <tr
                    key={po.id}
                    onClick={() => openDetail(po)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', color: '#374151', fontWeight: '500' }}>{po.suppliers?.name || '—'}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{getMaterialLabel(po)}</td>
                    <td style={{ padding: '14px 16px', color: '#374151', whiteSpace: 'nowrap' }}>{po.qty_ordered} {po.unit || ''}</td>
                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: '500' }}>${formatCurrency(po.cost_total_cad || 0)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ display: 'inline-block', background: st.bg, color: st.color, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>{po.ordered_at}</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', lineHeight: '1.7', color: '#64748b' }}>
                      {os != null && <div>O→S: <strong style={{ color: '#374151' }}>{os}d</strong></div>}
                      {sr != null && <div>S→R: <strong style={{ color: '#374151' }}>{sr}d</strong></div>}
                      {total != null && <div>Total: <strong style={{ color: '#374151' }}>{total}d</strong></div>}
                      {os == null && sr == null && total == null && '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create PO Modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setCreateError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '620px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>New Purchase Order</h2>
              <button onClick={() => { setShowCreate(false); setCreateError('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

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

            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Item Type *</label>
                <select value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value as 'raw_material' | 'packaging', raw_material_id: '', packaging_id: '' }))} style={inp}>
                  <option value='raw_material'>Raw Material</option>
                  <option value='packaging'>Packaging</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Material *</label>
                <select value={form.item_type === 'raw_material' ? form.raw_material_id : form.packaging_id} onChange={e => handleMaterialSelect(e.target.value, false)} style={inp}>
                  <option value=''>Select material...</option>
                  {createMatOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Qty Ordered *</label>
                <input type='number' min='0' step='any' value={form.qty_ordered} onChange={e => setForm(f => ({ ...f, qty_ordered: e.target.value }))} placeholder='0' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Unit</label>
                {UNIT_SELECT(form.unit, v => setForm(f => ({ ...f, unit: v })), inp)}
              </div>
            </div>

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

            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Optional notes...' style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {createError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>{createError}</div>
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

      {/* ── Detail / Edit Modal ── */}
      {showDetail && detail && (
        <div className="modal-overlay" onClick={() => { setShowDetail(false); setUpdateError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '620px', margin: '20px auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 2px' }}>
                  {isReadOnly ? 'Purchase Order' : 'Edit Purchase Order'}
                </h2>
                {detail.po_number && <div style={{ fontSize: '12px', color: '#94a3b8' }}>PO# {detail.po_number}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: STATUS_STYLE[detail.status]?.bg, color: STATUS_STYLE[detail.status]?.color, borderRadius: '20px', padding: '4px 12px', fontSize: '13px', fontWeight: '500' }}>
                  {STATUS_STYLE[detail.status]?.label}
                </span>
                <button onClick={() => setShowDeleteConfirm(true)} title='Delete PO' style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                  <Trash2 size={16} />
                </button>
                <button onClick={() => { setShowDetail(false); setUpdateError('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              </div>
            </div>

            {isReadOnly ? (
              /* ── Read-only view ── */
              <>
                <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px', background: '#f8fafc', borderRadius: '8px', marginBottom: '20px' }}>
                  {([
                    ['Supplier', detail.suppliers?.name || '—'],
                    ['Order Date', detail.ordered_at],
                    ['Item Type', detail.item_type === 'raw_material' ? 'Raw Material' : 'Packaging'],
                    ['Material', getMaterialLabel(detail)],
                    ['Qty Ordered', `${detail.qty_ordered} ${detail.unit || ''}`.trim()],
                    ['Qty Received', detail.qty_received != null ? `${detail.qty_received} ${detail.unit || ''}`.trim() : '—'],
                    ['Cost Total (CAD)', `$${formatCurrency(detail.cost_total_cad || 0)}`],
                    ['Shipping (CAD)', detail.shipping_cad != null ? `$${formatCurrency(detail.shipping_cad)}` : '—'],
                    ['Brokerage (CAD)', detail.brokerage_cad != null ? `$${formatCurrency(detail.brokerage_cad)}` : '—'],
                    ['Duty (CAD)', detail.duty_cad != null ? `$${formatCurrency(detail.duty_cad)}` : '—'],
                    ['Shipped Date', detail.shipped_at || '—'],
                    ['Received Date', detail.received_at || '—'],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>{label}</div>
                      <div style={{ fontSize: '14px', color: '#374151' }}>{value}</div>
                    </div>
                  ))}
                  {(calcDays(detail.ordered_at, detail.shipped_at) != null || calcDays(detail.ordered_at, detail.received_at) != null) && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>Lead Time</div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px', color: '#374151' }}>
                        {calcDays(detail.ordered_at, detail.shipped_at) != null && <span>O→S: <strong>{calcDays(detail.ordered_at, detail.shipped_at)}d</strong></span>}
                        {calcDays(detail.shipped_at, detail.received_at) != null && <span>S→R: <strong>{calcDays(detail.shipped_at, detail.received_at)}d</strong></span>}
                        {calcDays(detail.ordered_at, detail.received_at) != null && <span>Total: <strong>{calcDays(detail.ordered_at, detail.received_at)}d</strong></span>}
                      </div>
                    </div>
                  )}
                  {detail.notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>Notes</div>
                      <div style={{ fontSize: '14px', color: '#374151' }}>{detail.notes}</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowDetail(false) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Close</button>
                </div>
              </>
            ) : (
              /* ── Edit form ── */
              <>
                <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={lbl}>Supplier *</label>
                    <select value={editForm.supplier_id} onChange={e => setEditForm(f => ({ ...f, supplier_id: e.target.value }))} style={inp}>
                      <option value=''>Select supplier...</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Order Date *</label>
                    <input type='date' value={editForm.ordered_at} onChange={e => setEditForm(f => ({ ...f, ordered_at: e.target.value }))} style={inp} />
                  </div>
                </div>

                <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={lbl}>Item Type *</label>
                    <select value={editForm.item_type} onChange={e => setEditForm(f => ({ ...f, item_type: e.target.value as 'raw_material' | 'packaging', raw_material_id: '', packaging_id: '' }))} style={inp}>
                      <option value='raw_material'>Raw Material</option>
                      <option value='packaging'>Packaging</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Material *</label>
                    <select value={editForm.item_type === 'raw_material' ? editForm.raw_material_id : editForm.packaging_id} onChange={e => handleMaterialSelect(e.target.value, true)} style={inp}>
                      <option value=''>Select material...</option>
                      {editMatOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={lbl}>Qty Ordered *</label>
                    <input type='number' min='0' step='any' value={editForm.qty_ordered} onChange={e => setEditForm(f => ({ ...f, qty_ordered: e.target.value }))} placeholder='0' style={numInp} />
                  </div>
                  <div>
                    <label style={lbl}>Unit</label>
                    {UNIT_SELECT(editForm.unit, v => setEditForm(f => ({ ...f, unit: v })), inp)}
                  </div>
                </div>

                <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={lbl}>Cost Total (CAD) *</label>
                    <input type='number' min='0' step='0.01' value={editForm.cost_total_cad} onChange={e => setEditForm(f => ({ ...f, cost_total_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                  </div>
                  <div>
                    <label style={lbl}>Shipping (CAD)</label>
                    <input type='number' min='0' step='0.01' value={editForm.shipping_cad} onChange={e => setEditForm(f => ({ ...f, shipping_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                  </div>
                  <div>
                    <label style={lbl}>Brokerage (CAD)</label>
                    <input type='number' min='0' step='0.01' value={editForm.brokerage_cad} onChange={e => setEditForm(f => ({ ...f, brokerage_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                  </div>
                  <div>
                    <label style={lbl}>Duty (CAD)</label>
                    <input type='number' min='0' step='0.01' value={editForm.duty_cad} onChange={e => setEditForm(f => ({ ...f, duty_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>Notes</label>
                  <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Optional notes...' style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                {/* Date timeline */}
                <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', fontSize: '13px', color: '#64748b', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <span>Ordered: <strong style={{ color: '#374151' }}>{detail.ordered_at}</strong></span>
                  {detail.shipped_at && <span>Shipped: <strong style={{ color: '#d97706' }}>{detail.shipped_at}</strong></span>}
                  {detail.received_at && <span>Received: <strong style={{ color: '#16a34a' }}>{detail.received_at}</strong></span>}
                </div>

                {updateError && (
                  <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>{updateError}</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(detail.status === 'ordered' || detail.status === 'shipped' || detail.status === 'draft') && (
                      <button onClick={() => initiateStatusChange('cancelled')} style={{ padding: '8px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                        Cancel PO
                      </button>
                    )}
                    {detail.status === 'draft' && (
                      <button onClick={() => initiateStatusChange('ordered')} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                        Mark as Ordered
                      </button>
                    )}
                    {detail.status === 'ordered' && (
                      <button onClick={() => initiateStatusChange('shipped')} style={{ padding: '8px 14px', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                        Mark as Shipped
                      </button>
                    )}
                    {detail.status === 'shipped' && (
                      <button onClick={() => initiateStatusChange('received')} style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                        Mark as Received
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => { setShowDetail(false); setUpdateError('') }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                    <button onClick={handleUpdate} disabled={updating} style={{ padding: '8px 20px', background: updating ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: updating ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                      {updating ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Status Transition Modal ── */}
      {showStatusModal && detail && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '380px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 12px' }}>
              {pendingStatus === 'shipped' && 'Mark as Shipped'}
              {pendingStatus === 'received' && 'Mark as Received'}
              {pendingStatus === 'cancelled' && 'Cancel Purchase Order'}
            </h3>
            {pendingStatus !== 'cancelled' ? (
              <>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 16px' }}>
                  {pendingStatus === 'shipped' && 'Select the date this order was shipped.'}
                  {pendingStatus === 'received' && `Select the received date. Inventory will be updated: +${detail.qty_ordered}${detail.unit ? ' ' + detail.unit : ''}.`}
                </p>
                <div style={{ marginBottom: '20px' }}>
                  <label style={lbl}>{pendingStatus === 'shipped' ? 'Shipped Date' : 'Received Date'}</label>
                  <input type='date' value={statusDate} onChange={e => setStatusDate(e.target.value)} style={inp} />
                </div>
              </>
            ) : (
              <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px' }}>
                Are you sure you want to cancel this purchase order?
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowStatusModal(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Back</button>
              <button
                onClick={confirmStatusTransition}
                disabled={statusTransitioning}
                style={{
                  padding: '8px 16px',
                  background: pendingStatus === 'cancelled' ? '#dc2626' : pendingStatus === 'received' ? '#16a34a' : '#d97706',
                  color: '#fff', border: 'none', borderRadius: '6px',
                  cursor: statusTransitioning ? 'not-allowed' : 'pointer',
                  fontSize: '14px', fontWeight: '500', opacity: statusTransitioning ? 0.7 : 1,
                }}
              >
                {statusTransitioning ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {showDeleteConfirm && detail && (
        <div className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setDeleteError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '380px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 12px', color: '#dc2626' }}>Delete Purchase Order</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 12px' }}>
              Delete this PO for {getMaterialLabel(detail)} ({detail.qty_ordered}{detail.unit ? ' ' + detail.unit : ''})?
            </p>
            <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              If status is <strong>Received</strong>, inventory will be reduced accordingly.
              {detail.status === 'received' && (
                <div style={{ marginTop: '6px', color: '#92400e', fontWeight: '500' }}>
                  This PO is Received — {detail.qty_ordered}{detail.unit ? ' ' + detail.unit : ''} will be deducted from inventory.
                </div>
              )}
            </div>
            {deleteError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteError('') }} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '8px 16px', background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
