'use client'

// -- SQL: CREATE TABLE IF NOT EXISTS purchase_order_attachments (
// --   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
// --   po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
// --   file_name text NOT NULL,
// --   file_url text NOT NULL,
// --   uploaded_at timestamptz DEFAULT now()
// -- );

import { useEffect, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { ShoppingCart, Plus, Search, X, Trash2, Paperclip } from 'lucide-react'

interface Supplier { id: string; name: string }

interface Material {
  id: string
  item_no: string
  name: string
  unit: string
  cost_per_unit: number
  material_type: 'raw_material' | 'packaging'
}

interface POLineItem {
  material_id: string
  item_no: string
  name: string
  unit: string
  material_type: 'raw_material' | 'packaging'
  unit_price: number
  qty: number
  total: number
}

interface PO {
  id: string
  po_number: string | null
  supplier_id: string
  ordered_at: string
  status: 'ordered' | 'shipped' | 'received' | 'cancelled'
  cost_total_cad: number
  shipping_cad: number | null
  brokerage_cad: number | null
  duty_cad: number | null
  amount_usd: number | null
  exchange_rate: number | null
  notes: string | null
  invoice_url: string | null
  shipped_at: string | null
  received_at: string | null
  suppliers?: { name: string }
}

interface POItem {
  id: string
  po_id: string
  material_type: 'raw_material' | 'packaging'
  material_id: string
  quantity: number
  unit_price: number
}

interface POAttachment {
  id: string
  po_id: string
  file_name: string
  file_url: string
  uploaded_at: string
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ordered:   { bg: '#eff6ff', color: '#2563eb', label: 'Ordered' },
  shipped:   { bg: '#fef3c7', color: '#d97706', label: 'Shipped' },
  received:  { bg: '#f0fdf4', color: '#16a34a', label: 'Received' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' },
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '5px' }
const numInp: React.CSSProperties = { ...inp, textAlign: 'right' }

export default function Purchasing() {
  const [pos, setPOs] = useState<PO[]>([])
  const [poItems, setPoItems] = useState<Record<string, POItem[]>>({})
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createSupplier, setCreateSupplier] = useState<Supplier | null>(null)
  const [createLineItems, setCreateLineItems] = useState<POLineItem[]>([])
  const [createForm, setCreateForm] = useState({
    supplier_id: '', ordered_at: new Date().toISOString().slice(0, 10),
    shipping_cad: '', brokerage_cad: '', duty_cad: '',
    amount_usd: '', amount_cad: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')

  // Detail/Edit modal
  const [showDetail, setShowDetail] = useState(false)
  const [detailPO, setDetailPO] = useState<PO | null>(null)
  const [editLineItems, setEditLineItems] = useState<POLineItem[]>([])
  const [editForm, setEditForm] = useState({
    supplier_id: '', ordered_at: '', status: 'ordered',
    shipping_cad: '', brokerage_cad: '', duty_cad: '',
    amount_usd: '', amount_cad: '', notes: '',
    shipped_at: '', received_at: '',
  })
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Attachments
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createFileInputRef = useRef<HTMLInputElement>(null)
  const [poAttachments, setPoAttachments] = useState<Record<string, POAttachment[]>>({})
  const [showAttachments, setShowAttachments] = useState(false)
  const [attachmentPO, setAttachmentPO] = useState<PO | null>(null)
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [createAttachFiles, setCreateAttachFiles] = useState<File[]>([])

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showDeleteConfirm) { setShowDeleteConfirm(false); return }
      if (showAttachments) { setShowAttachments(false); setAttachmentFiles([]); return }
      if (showCreate) { setShowCreate(false); setCreateError(''); setCreateAttachFiles([]); return }
      if (showDetail) { setShowDetail(false); setUpdateError(''); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCreate, showDetail, showDeleteConfirm, showAttachments])

  async function fetchAll() {
    const [posRes, suppRes, rawRes, pkgRes, itemsRes, attachRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, suppliers(name)')
        .is('deleted_at', null)
        .order('ordered_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('raw_materials').select('id, item_no, name, unit, cost_per_unit_cad').order('item_no'),
      supabase.from('packaging').select('id, item_no, name, type, cost_cad').order('item_no'),
      supabase.from('purchase_order_items').select('id, po_id, material_type, material_id, quantity, unit_price'),
      supabase.from('purchase_order_attachments').select('id, po_id, file_name, file_url, uploaded_at').order('uploaded_at'),
    ])
    setPOs(posRes.data || [])
    setSuppliers(suppRes.data || [])

    const raw: Material[] = (rawRes.data || []).map(m => ({
      id: m.id, item_no: m.item_no, name: m.name, unit: m.unit,
      cost_per_unit: m.cost_per_unit_cad ?? 0, material_type: 'raw_material',
    }))
    const pkg: Material[] = (pkgRes.data || []).map(p => ({
      id: p.id, item_no: p.item_no, name: p.name, unit: p.type || 'ea',
      cost_per_unit: p.cost_cad ?? 0, material_type: 'packaging',
    }))
    setMaterials([...raw, ...pkg])

    const grouped: Record<string, POItem[]> = {}
    for (const item of (itemsRes.data || []) as POItem[]) {
      if (!grouped[item.po_id]) grouped[item.po_id] = []
      grouped[item.po_id].push(item)
    }
    setPoItems(grouped)

    const attachGrouped: Record<string, POAttachment[]> = {}
    for (const a of (attachRes.data || []) as POAttachment[]) {
      if (!attachGrouped[a.po_id]) attachGrouped[a.po_id] = []
      attachGrouped[a.po_id].push(a)
    }
    setPoAttachments(attachGrouped)
    setLoading(false)
  }

  function handleSupplierChange(supplierId: string) {
    const supplier = suppliers.find(s => s.id === supplierId) || null
    setCreateSupplier(supplier)
    setCreateForm(prev => ({ ...prev, supplier_id: supplierId }))
    setCreateLineItems(materials.map(m => ({
      material_id: m.id,
      item_no: m.item_no,
      name: m.name,
      unit: m.unit,
      material_type: m.material_type,
      unit_price: m.cost_per_unit,
      qty: 0,
      total: 0,
    })))
  }

  function updateCreateQty(index: number, qty: number) {
    setCreateLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], qty, total: updated[index].unit_price * qty }
      return updated
    })
  }

  function updateCreatePrice(index: number, price: number) {
    setCreateLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], unit_price: price, total: price * updated[index].qty }
      return updated
    })
  }

  const activeCreateItems = createLineItems.filter(item => item.qty > 0)
  const createSubtotal = activeCreateItems.reduce((s, i) => s + i.total, 0)
  const createShipping = parseFloat(createForm.shipping_cad || '0') || 0
  const createBrokerage = parseFloat(createForm.brokerage_cad || '0') || 0
  const createDuty = parseFloat(createForm.duty_cad || '0') || 0
  const createTotal = createSubtotal + createShipping + createBrokerage + createDuty
  const createExchangeRate = createForm.amount_usd && createForm.amount_cad && parseFloat(createForm.amount_usd) > 0
    ? (parseFloat(createForm.amount_cad) / parseFloat(createForm.amount_usd)).toFixed(4) : null

  function closeCreate() {
    setShowCreate(false)
    setCreateError('')
    setCreateAttachFiles([])
  }

  async function handleCreate() {
    setCreateError('')
    if (!createForm.supplier_id) { setCreateError('Please select a supplier.'); return }
    if (activeCreateItems.length === 0) { setCreateError('Please enter a quantity for at least one item.'); return }

    setSaving(true)
    const exchangeRate = createForm.amount_usd && createForm.amount_cad && parseFloat(createForm.amount_usd) > 0
      ? parseFloat(createForm.amount_cad) / parseFloat(createForm.amount_usd) : null

    const { data: poData, error: poError } = await supabase.from('purchase_orders').insert([{
      supplier_id: createForm.supplier_id,
      item_type: activeCreateItems[0].material_type,
      raw_material_id: null,
      packaging_id: null,
      qty_ordered: 0,
      cost_total_cad: createTotal,
      shipping_cad: createShipping || null,
      brokerage_cad: createBrokerage || null,
      duty_cad: createDuty || null,
      status: 'ordered',
      ordered_at: createForm.ordered_at,
      notes: createForm.notes || null,
      amount_usd: createForm.amount_usd ? parseFloat(createForm.amount_usd) : null,
      exchange_rate: exchangeRate,
    }]).select('id').single()

    if (poError || !poData) {
      setCreateError(poError?.message || 'Failed to create PO.')
      setSaving(false)
      return
    }

    const { error: itemsError } = await supabase.from('purchase_order_items').insert(
      activeCreateItems.map(item => ({
        po_id: poData.id,
        material_type: item.material_type,
        material_id: item.material_id,
        quantity: item.qty,
        unit_price: item.unit_price,
      }))
    )

    if (itemsError) {
      setCreateError(itemsError.message || 'Failed to save items.')
      await supabase.from('purchase_orders').delete().eq('id', poData.id)
      setSaving(false)
      return
    }

    // Upload attachments — best effort, PO is already created
    for (const file of createAttachFiles) {
      const path = `${poData.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('purchase-invoices').upload(path, file)
      if (uploadError) continue
      const { data: urlData } = supabase.storage.from('purchase-invoices').getPublicUrl(path)
      await supabase.from('purchase_order_attachments').insert({
        po_id: poData.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
      })
    }

    setSaving(false)
    setShowCreate(false)
    setCreateError('')
    setCreateForm({ supplier_id: '', ordered_at: new Date().toISOString().slice(0, 10), shipping_cad: '', brokerage_cad: '', duty_cad: '', amount_usd: '', amount_cad: '', notes: '' })
    setCreateLineItems([])
    setCreateSupplier(null)
    setCreateAttachFiles([])
    fetchAll()
  }

  async function openDetail(po: PO) {
    setDetailPO(po)
    setEditForm({
      supplier_id: po.supplier_id,
      ordered_at: po.ordered_at,
      status: po.status,
      shipping_cad: po.shipping_cad != null ? String(po.shipping_cad) : '',
      brokerage_cad: po.brokerage_cad != null ? String(po.brokerage_cad) : '',
      duty_cad: po.duty_cad != null ? String(po.duty_cad) : '',
      amount_usd: po.amount_usd != null ? String(po.amount_usd) : '',
      amount_cad: '',
      notes: po.notes || '',
      shipped_at: po.shipped_at || '',
      received_at: po.received_at || '',
    })
    setUpdateError('')

    const { data: freshItems } = await supabase
      .from('purchase_order_items')
      .select('id, po_id, material_type, material_id, quantity, unit_price')
      .eq('po_id', po.id)

    const existingMap: Record<string, { qty: number; unit_price: number }> = {}
    for (const item of (freshItems || []) as POItem[]) {
      existingMap[item.material_id] = { qty: item.quantity, unit_price: item.unit_price }
    }

    setEditLineItems(materials.map(m => ({
      material_id: m.id,
      item_no: m.item_no,
      name: m.name,
      unit: m.unit,
      material_type: m.material_type,
      unit_price: existingMap[m.id]?.unit_price ?? m.cost_per_unit,
      qty: existingMap[m.id]?.qty ?? 0,
      total: (existingMap[m.id]?.unit_price ?? m.cost_per_unit) * (existingMap[m.id]?.qty ?? 0),
    })))

    setShowDetail(true)
  }

  function updateEditQty(index: number, qty: number) {
    setEditLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], qty, total: updated[index].unit_price * qty }
      return updated
    })
  }

  function updateEditPrice(index: number, price: number) {
    setEditLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], unit_price: price, total: price * updated[index].qty }
      return updated
    })
  }

  const activeEditItems = editLineItems.filter(item => item.qty > 0)
  const editSubtotal = activeEditItems.reduce((s, i) => s + i.total, 0)
  const editShipping = parseFloat(editForm.shipping_cad || '0') || 0
  const editBrokerage = parseFloat(editForm.brokerage_cad || '0') || 0
  const editDuty = parseFloat(editForm.duty_cad || '0') || 0
  const editTotal = editSubtotal + editShipping + editBrokerage + editDuty
  const editExchangeRate = editForm.amount_usd && editForm.amount_cad && parseFloat(editForm.amount_usd) > 0
    ? (parseFloat(editForm.amount_cad) / parseFloat(editForm.amount_usd)).toFixed(4) : null
  const isReadOnly = detailPO?.status === 'received' || detailPO?.status === 'cancelled'

  async function handleUpdate() {
    if (!detailPO) return
    setUpdateError('')
    if (activeEditItems.length === 0) { setUpdateError('At least one item with quantity is required.'); return }

    setUpdating(true)
    const exchangeRate = editForm.amount_usd && editForm.amount_cad && parseFloat(editForm.amount_usd) > 0
      ? parseFloat(editForm.amount_cad) / parseFloat(editForm.amount_usd) : detailPO.exchange_rate ?? null

    const updatePayload: Record<string, unknown> = {
      supplier_id: editForm.supplier_id,
      ordered_at: editForm.ordered_at,
      status: editForm.status,
      cost_total_cad: editTotal,
      shipping_cad: editShipping || null,
      brokerage_cad: editBrokerage || null,
      duty_cad: editDuty || null,
      notes: editForm.notes || null,
      amount_usd: editForm.amount_usd ? parseFloat(editForm.amount_usd) : null,
      exchange_rate: exchangeRate,
      shipped_at: editForm.status === 'shipped' || editForm.status === 'received'
        ? (editForm.shipped_at || new Date().toISOString().slice(0, 10)) : null,
      received_at: editForm.status === 'received'
        ? (editForm.received_at || new Date().toISOString().slice(0, 10)) : null,
    }

    const { error } = await supabase.from('purchase_orders').update(updatePayload).eq('id', detailPO.id)
    if (error) { setUpdateError(error.message); setUpdating(false); return }

    await supabase.from('purchase_order_items').delete().eq('po_id', detailPO.id)
    await supabase.from('purchase_order_items').insert(
      activeEditItems.map(item => ({
        po_id: detailPO.id,
        material_type: item.material_type,
        material_id: item.material_id,
        quantity: item.qty,
        unit_price: item.unit_price,
      }))
    )

    if (editForm.status === 'received' && detailPO.status !== 'received') {
      for (const item of activeEditItems) {
        if (item.material_type === 'raw_material') {
          const { data: mat } = await supabase.from('raw_materials').select('current_stock').eq('id', item.material_id).single()
          await supabase.from('raw_materials').update({ current_stock: (mat?.current_stock || 0) + item.qty }).eq('id', item.material_id)
        } else {
          const { data: pkg } = await supabase.from('packaging').select('current_stock').eq('id', item.material_id).single()
          await supabase.from('packaging').update({ current_stock: (pkg?.current_stock || 0) + item.qty }).eq('id', item.material_id)
        }
      }
    }

    setUpdating(false)
    setShowDetail(false)
    fetchAll()
  }

  async function handleDelete() {
    if (!detailPO) return
    setDeleting(true)
    await supabase.from('purchase_order_items').delete().eq('po_id', detailPO.id)
    await supabase.from('purchase_orders').delete().eq('id', detailPO.id)
    setDeleting(false)
    setShowDeleteConfirm(false)
    setShowDetail(false)
    fetchAll()
  }

  function getPOSummary(po: PO): string {
    const items = poItems[po.id]
    if (!items || items.length === 0) return '—'
    if (items.length === 1) {
      const mat = materials.find(m => m.id === items[0].material_id)
      return mat ? `${mat.item_no} — ${mat.name}` : '—'
    }
    return `${items.length} items`
  }

  function openAttachments(e: React.MouseEvent, po: PO) {
    e.stopPropagation()
    setAttachmentPO(po)
    setAttachmentFiles([])
    setShowAttachments(true)
  }

  async function handleUploadAttachments() {
    if (!attachmentPO || attachmentFiles.length === 0) return
    setUploadingAttachment(true)
    for (const file of attachmentFiles) {
      const path = `${attachmentPO.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('purchase-invoices').upload(path, file)
      if (uploadError) continue
      const { data: urlData } = supabase.storage.from('purchase-invoices').getPublicUrl(path)
      await supabase.from('purchase_order_attachments').insert({
        po_id: attachmentPO.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
      })
    }
    setAttachmentFiles([])
    setUploadingAttachment(false)
    fetchAll()
  }

  async function handleDeleteAttachment(attachment: POAttachment) {
    await supabase.from('purchase_order_attachments').delete().eq('id', attachment.id)
    fetchAll()
  }

  const filtered = pos.filter(po =>
    po.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    getPOSummary(po).toLowerCase().includes(search.toLowerCase()) ||
    po.status?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search supplier, item, status...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(''); setCreateForm({ supplier_id: '', ordered_at: new Date().toISOString().slice(0, 10), shipping_cad: '', brokerage_cad: '', duty_cad: '', amount_usd: '', amount_cad: '', notes: '' }); setCreateLineItems([]); setCreateSupplier(null); setCreateAttachFiles([]) }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
        >
          <Plus size={16} /> New PO
        </button>
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
                {['Supplier', 'Items', 'Cost (CAD)', 'Status', 'Order Date', 'Shipped', 'Received', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((po, i) => {
                const st = STATUS_STYLE[po.status] || STATUS_STYLE.ordered
                return (
                  <tr key={po.id} onClick={() => openDetail(po)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: '500', color: '#374151' }}>{po.suppliers?.name || '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{getPOSummary(po)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1e293b' }}>${formatCurrency(po.cost_total_cad || 0)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: st.bg, color: st.color, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500' }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px' }}>{po.ordered_at}</td>
                    <td style={{ padding: '12px 16px', color: po.shipped_at ? '#d97706' : '#cbd5e1', fontSize: '13px' }}>{po.shipped_at || '—'}</td>
                    <td style={{ padding: '12px 16px', color: po.received_at ? '#16a34a' : '#cbd5e1', fontSize: '13px' }}>{po.received_at || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button onClick={e => openAttachments(e, po)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: (poAttachments[po.id]?.length ?? 0) > 0 ? '#2563eb' : '#94a3b8' }}>
                          <Paperclip size={15} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setDetailPO(po); setShowDeleteConfirm(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
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
        <div className="modal-overlay" onClick={closeCreate}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '900px', margin: '20px auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>New Purchase Order</h2>
              <button onClick={closeCreate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            {/* Supplier + Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={lbl}>Supplier *</label>
                <select value={createForm.supplier_id} onChange={e => handleSupplierChange(e.target.value)} style={inp}>
                  <option value=''>Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Order Date *</label>
                <input type='date' value={createForm.ordered_at} onChange={e => setCreateForm(f => ({ ...f, ordered_at: e.target.value }))} style={inp} />
              </div>
            </div>

            {/* Materials table */}
            {createSupplier && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ ...lbl, marginBottom: '8px' }}>Materials — enter qty for items to include</label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', maxHeight: '400px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Type</th>
                        <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Item No</th>
                        <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Name</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Qty</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit Price</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {createLineItems.map((item, idx) => (
                        <tr key={item.material_id} style={{ borderBottom: '1px solid #f1f5f9', background: item.qty > 0 ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '7px 14px' }}>
                            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', fontWeight: '500', background: item.material_type === 'raw_material' ? '#eff6ff' : '#fef3c7', color: item.material_type === 'raw_material' ? '#2563eb' : '#d97706' }}>
                              {item.material_type === 'raw_material' ? 'Raw' : 'Pkg'}
                            </span>
                          </td>
                          <td style={{ padding: '7px 14px', color: '#2563eb', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.item_no}</td>
                          <td style={{ padding: '7px 14px', color: '#374151' }}>{item.name}</td>
                          <td style={{ padding: '7px 14px', textAlign: 'right', color: '#64748b' }}>{item.unit}</td>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                            <input type='number' min='0' step='any'
                              value={item.qty || ''}
                              onChange={e => updateCreateQty(idx, parseFloat(e.target.value) || 0)}
                              placeholder='0'
                              style={{ ...numInp, padding: '4px 8px', fontSize: '13px', width: '80px' }}
                            />
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                            <input type='number' min='0' step='0.0001'
                              value={item.unit_price || ''}
                              onChange={e => updateCreatePrice(idx, parseFloat(e.target.value) || 0)}
                              placeholder='0.00'
                              style={{ ...numInp, padding: '4px 8px', fontSize: '13px', width: '90px' }}
                            />
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: '500', color: item.qty > 0 ? '#1e293b' : '#94a3b8' }}>
                            {item.qty > 0 ? `$${formatCurrency(item.total)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                  <span>{activeCreateItems.length} item(s) with qty &gt; 0</span>
                  {createSubtotal > 0 && <span style={{ fontWeight: '600', color: '#1e293b' }}>Subtotal: ${formatCurrency(createSubtotal)}</span>}
                </div>
              </div>
            )}

            {/* Cost fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={lbl}>Shipping (CAD)</label>
                <input type='number' min='0' step='0.01' value={createForm.shipping_cad} onChange={e => setCreateForm(f => ({ ...f, shipping_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Brokerage (CAD)</label>
                <input type='number' min='0' step='0.01' value={createForm.brokerage_cad} onChange={e => setCreateForm(f => ({ ...f, brokerage_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>Duty (CAD)</label>
                <input type='number' min='0' step='0.01' value={createForm.duty_cad} onChange={e => setCreateForm(f => ({ ...f, duty_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
            </div>

            {/* USD section */}
            <div style={{ marginBottom: '14px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>USD Invoice (optional)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Amount (USD)</label>
                  <input type='number' min='0' step='0.01' value={createForm.amount_usd} onChange={e => setCreateForm(f => ({ ...f, amount_usd: e.target.value }))} placeholder='0.00' style={numInp} />
                </div>
                <div>
                  <label style={lbl}>Amount (CAD)</label>
                  <input type='number' min='0' step='0.01' value={createForm.amount_cad} onChange={e => setCreateForm(f => ({ ...f, amount_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                </div>
                <div>
                  <label style={lbl}>Exchange Rate</label>
                  <input readOnly value={createExchangeRate ?? ''} placeholder='auto' style={{ ...inp, background: '#f8fafc', color: '#64748b', textAlign: 'right' }} />
                </div>
              </div>
            </div>

            {/* Grand Total */}
            {createSupplier && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginBottom: '14px', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: '14px', color: '#1d4ed8', fontWeight: '600' }}>Grand Total (CAD):</span>
                <span style={{ fontSize: '18px', fontWeight: '700', color: '#1d4ed8' }}>${formatCurrency(createTotal)}</span>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Notes</label>
              <textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Optional notes...' style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {/* Attachments */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Attachments</label>
              <input ref={createFileInputRef} type='file' multiple style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files) {
                    setCreateAttachFiles(prev => [...prev, ...Array.from(e.target.files!)])
                    e.target.value = ''
                  }
                }} />
              <button type='button' onClick={() => createFileInputRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                <Paperclip size={14} /> Choose Files
              </button>
              {createAttachFiles.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {createAttachFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                      <button type='button' onClick={() => setCreateAttachFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px 4px', marginLeft: '8px', flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {createError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>{createError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={closeCreate} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {saving ? 'Saving...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail / Edit Modal ── */}
      {showDetail && detailPO && (
        <div className="modal-overlay" onClick={() => { setShowDetail(false); setUpdateError('') }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '900px', margin: '20px auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 2px' }}>Purchase Order</h2>
                {detailPO.po_number && <div style={{ fontSize: '12px', color: '#94a3b8' }}>PO# {detailPO.po_number}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => setShowDeleteConfirm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}><Trash2 size={16} /></button>
                <button onClick={() => { setShowDetail(false); setUpdateError('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              </div>
            </div>

            {/* Supplier + Date + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={lbl}>Supplier</label>
                <select value={editForm.supplier_id} onChange={e => setEditForm(f => ({ ...f, supplier_id: e.target.value }))} style={inp} disabled={isReadOnly}>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Order Date</label>
                <input type='date' value={editForm.ordered_at} onChange={e => setEditForm(f => ({ ...f, ordered_at: e.target.value }))} style={inp} disabled={isReadOnly} />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={inp} disabled={isReadOnly}>
                  <option value='ordered'>Ordered</option>
                  <option value='shipped'>Shipped</option>
                  <option value='received'>Received</option>
                  <option value='cancelled'>Cancelled</option>
                </select>
              </div>
            </div>

            {/* Shipped / Received dates */}
            {(editForm.status === 'shipped' || editForm.status === 'received') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={lbl}>Shipped Date</label>
                  <input type='date' value={editForm.shipped_at} onChange={e => setEditForm(f => ({ ...f, shipped_at: e.target.value }))} style={inp} disabled={isReadOnly} />
                </div>
                {editForm.status === 'received' && (
                  <div>
                    <label style={lbl}>Received Date</label>
                    <input type='date' value={editForm.received_at} onChange={e => setEditForm(f => ({ ...f, received_at: e.target.value }))} style={inp} disabled={isReadOnly} />
                  </div>
                )}
              </div>
            )}

            {/* Materials table */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ ...lbl, marginBottom: '8px' }}>Materials</label>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Type</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Item No</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Name</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit Price</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isReadOnly ? editLineItems.filter(item => item.qty > 0) : editLineItems).map((item, idx) => (
                      <tr key={item.material_id} style={{ borderBottom: '1px solid #f1f5f9', background: item.qty > 0 ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 14px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', fontWeight: '500', background: item.material_type === 'raw_material' ? '#eff6ff' : '#fef3c7', color: item.material_type === 'raw_material' ? '#2563eb' : '#d97706' }}>
                            {item.material_type === 'raw_material' ? 'Raw' : 'Pkg'}
                          </span>
                        </td>
                        <td style={{ padding: '7px 14px', color: '#2563eb', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.item_no}</td>
                        <td style={{ padding: '7px 14px', color: '#374151' }}>{item.name}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', color: '#64748b' }}>{item.unit}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                          {isReadOnly ? (
                            <span style={{ color: '#374151' }}>{item.qty > 0 ? item.qty : '—'}</span>
                          ) : (
                            <input type='number' min='0' step='any'
                              value={item.qty || ''}
                              onChange={e => updateEditQty(idx, parseFloat(e.target.value) || 0)}
                              placeholder='0'
                              style={{ ...numInp, padding: '4px 8px', fontSize: '13px', width: '80px' }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                          {isReadOnly ? (
                            <span style={{ color: '#64748b' }}>${formatCurrency(item.unit_price)}</span>
                          ) : (
                            <input type='number' min='0' step='0.0001'
                              value={item.unit_price || ''}
                              onChange={e => updateEditPrice(idx, parseFloat(e.target.value) || 0)}
                              placeholder='0.00'
                              style={{ ...numInp, padding: '4px 8px', fontSize: '13px', width: '90px' }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: '500', color: item.qty > 0 ? '#1e293b' : '#94a3b8' }}>
                          {item.qty > 0 ? `$${formatCurrency(item.total)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                <span>{activeEditItems.length} item(s) with qty &gt; 0</span>
                {editSubtotal > 0 && <span style={{ fontWeight: '600', color: '#1e293b' }}>Subtotal: ${formatCurrency(editSubtotal)}</span>}
              </div>
            </div>

            {/* Cost fields */}
            {!isReadOnly && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
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
            )}

            {/* Grand Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginBottom: '14px', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              <span style={{ fontSize: '14px', color: '#1d4ed8', fontWeight: '600' }}>Grand Total (CAD):</span>
              <span style={{ fontSize: '18px', fontWeight: '700', color: '#1d4ed8' }}>${formatCurrency(isReadOnly ? detailPO.cost_total_cad : editTotal)}</span>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Optional notes...' style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} disabled={isReadOnly} />
            </div>

            {updateError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>{updateError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => { setShowDetail(false); setUpdateError('') }} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>
                {isReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!isReadOnly && (
                <button onClick={handleUpdate} disabled={updating} style={{ padding: '9px 20px', background: updating ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: updating ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Attachments Modal ── */}
      {showAttachments && attachmentPO && (
        <div className="modal-overlay" onClick={() => { setShowAttachments(false); setAttachmentFiles([]) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '520px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Attachments</h3>
              <button onClick={() => { setShowAttachments(false); setAttachmentFiles([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            {(poAttachments[attachmentPO.id] || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '14px', background: '#f8fafc', borderRadius: '8px', marginBottom: '20px' }}>
                No attachments yet
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                {(poAttachments[attachmentPO.id] || []).map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                    <a href={a.file_url} target='_blank' rel='noopener noreferrer'
                      style={{ fontSize: '14px', color: '#2563eb', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'}>
                      <Paperclip size={13} style={{ flexShrink: 0 }} />
                      {a.file_name}
                    </a>
                    <button onClick={() => handleDeleteAttachment(a)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px', marginLeft: '8px', flexShrink: 0 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <input ref={fileInputRef} type='file' multiple style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files) {
                    setAttachmentFiles(prev => [...prev, ...Array.from(e.target.files!)])
                    e.target.value = ''
                  }
                }} />
              <button type='button' onClick={() => fileInputRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                <Paperclip size={14} /> Choose Files
              </button>
              {attachmentFiles.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {attachmentFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                      <button type='button' onClick={() => setAttachmentFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px 4px', marginLeft: '8px', flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => { setShowAttachments(false); setAttachmentFiles([]) }}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Close</button>
              <button onClick={handleUploadAttachments}
                disabled={uploadingAttachment || attachmentFiles.length === 0}
                style={{ padding: '8px 16px', background: uploadingAttachment || attachmentFiles.length === 0 ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: uploadingAttachment || attachmentFiles.length === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {uploadingAttachment ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {showDeleteConfirm && detailPO && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '380px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 12px', color: '#dc2626' }}>Delete Purchase Order</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px' }}>
              Are you sure? This cannot be undone.
              {detailPO.status === 'received' && (
                <span style={{ display: 'block', marginTop: '8px', color: '#92400e', fontWeight: '500' }}>
                  ⚠️ This PO is Received — inventory will NOT be automatically reversed.
                </span>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
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
