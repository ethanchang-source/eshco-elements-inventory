'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatTorontoDate } from '@/lib/utils'
import { Plus, Search, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/activityLog'
import UndoToast from '@/components/UndoToast'

interface RawMaterial {
  id: string
  item_no: string
  name: string
  unit: string
  cost_per_unit_cad: number
  cost_per_unit_usd?: number | null
  avg_cost_cad: number | null
  price_whs_cad?: number | null
  barcode?: string | null
  current_stock: number
  reorder_threshold: number
  max_capacity?: number | null
  purchase_unit?: string | null
  purchase_unit_kg?: number | null
  notes?: string | null
  preferred_supplier_id?: string | null
}

interface Packaging {
  id: string
  item_no: string
  name: string
  type: string
  size_oz: number
  unit?: string | null
  cost_cad: number
  avg_cost_cad: number | null
  price_whs_cad?: number | null
  barcode?: string | null
  current_stock: number
  reorder_threshold: number
  max_capacity?: number | null
  notes?: string | null
  preferred_supplier_id?: string | null
  module_qty?: number | null
  roll_length_m?: number | null
}

interface Supplier {
  id: string
  name: string
}

interface PurchaseHistoryEntry {
  quantity: number
  unit_price: number
  purchase_orders: {
    id: string
    po_number: string | null
    ordered_at: string
    received_at: string | null
    status: string
    suppliers: { name: string } | null
  } | null
}

type UnifiedItem =
  | (RawMaterial & { itemType: 'Raw Material' })
  | (Packaging & { itemType: 'Packaging' })

const emptyAddRawForm = { item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', price_whs_cad: '', barcode: '', current_stock: '', reorder_threshold: '' }
const emptyAddPackForm = { item_no: '', name: '', type: 'bottle', unit: 'ea', cost_cad: '', price_whs_cad: '', barcode: '', current_stock: '', reorder_threshold: '' }

function getDisplayCost(item: UnifiedItem): number | null {
  if (item.itemType === 'Raw Material') {
    return item.cost_per_unit_cad ?? null
  } else {
    const p = item as Packaging & { itemType: 'Packaging' }
    return p.cost_cad ?? null
  }
}

function fmtCost(item: UnifiedItem): string {
  const cost = getDisplayCost(item)
  if (cost == null) return '—'
  return item.itemType === 'Raw Material' ? `$${cost.toFixed(4)}` : `$${cost.toFixed(5)}`
}

function getMargin(cost: number | null, whs: number | null | undefined): string | null {
  if (cost == null || whs == null || whs === 0) return null
  return ((whs - cost) / whs * 100).toFixed(1)
}

export default function Products() {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packaging, setPackaging] = useState<Packaging[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'Raw Material' | 'Packaging'>('all')

  const [editRaw, setEditRaw] = useState<RawMaterial | null>(null)
  const [editPack, setEditPack] = useState<Packaging | null>(null)
  const [editRawForm, setEditRawForm] = useState({
    item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', cost_per_unit_usd: '',
    price_whs_cad: '', barcode: '',
    current_stock: '', reorder_threshold: '', max_capacity: '',
    preferred_supplier_id: '', purchase_unit: '', purchase_unit_kg: '',
  })
  const [editPackForm, setEditPackForm] = useState({
    item_no: '', name: '', type: 'bottle', size_oz: '', unit: 'ea',
    cost_cad: '', price_whs_cad: '', barcode: '',
    current_stock: '', reorder_threshold: '', max_capacity: '',
    preferred_supplier_id: '', modules: '', maxCapModules: '', roll_length_m: '',
  })
  const [editRawError, setEditRawError] = useState('')
  const [editPackError, setEditPackError] = useState('')
  const [itemPurchaseHistory, setItemPurchaseHistory] = useState<PurchaseHistoryEntry[]>([])
  const [loadingItemHistory, setLoadingItemHistory] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [addType, setAddType] = useState<'raw_material' | 'packaging'>('raw_material')
  const [addRawForm, setAddRawForm] = useState({ ...emptyAddRawForm })
  const [addPackForm, setAddPackForm] = useState({ ...emptyAddPackForm })

  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [r, p, sup] = await Promise.all([
      supabase.from('raw_materials').select('*').order('item_no'),
      supabase.from('packaging').select('*').order('item_no'),
      supabase.from('suppliers').select('id, name').order('name'),
    ])
    setRawMaterials(r.data || [])
    setPackaging(p.data || [])
    setSuppliers(sup.data || [])
    setLoading(false)
  }

  async function fetchItemPurchaseHistory(itemType: 'raw_material' | 'packaging', itemId: string) {
    setLoadingItemHistory(true)
    const { data } = await supabase
      .from('purchase_order_items')
      .select(`quantity, unit_price, purchase_orders (id, po_number, ordered_at, received_at, status, suppliers (name))`)
      .eq('material_type', itemType)
      .eq('material_id', itemId)
      .order('created_at', { ascending: false })
    setItemPurchaseHistory((data as unknown as PurchaseHistoryEntry[]) || [])
    setLoadingItemHistory(false)
  }

  function openEditRaw(r: RawMaterial) {
    setEditRaw(r)
    setEditRawError('')
    setItemPurchaseHistory([])
    setEditRawForm({
      item_no: r.item_no || '', name: r.name || '', unit: r.unit || 'ml',
      cost_per_unit_cad: String(r.cost_per_unit_cad ?? ''),
      cost_per_unit_usd: String(r.cost_per_unit_usd ?? ''),
      price_whs_cad: String(r.price_whs_cad ?? ''),
      barcode: r.barcode || '',
      current_stock: String(r.current_stock ?? ''),
      reorder_threshold: String(r.reorder_threshold ?? ''),
      max_capacity: String(r.max_capacity ?? ''),
      preferred_supplier_id: r.preferred_supplier_id || '',
      purchase_unit: r.purchase_unit || '',
      purchase_unit_kg: String(r.purchase_unit_kg ?? ''),
    })
    fetchItemPurchaseHistory('raw_material', r.id)
  }

  function openEditPack(p: Packaging) {
    setEditPack(p)
    setEditPackError('')
    setItemPurchaseHistory([])
    const modules = p.module_qty && p.module_qty > 1 ? String(Math.floor(p.current_stock / p.module_qty)) : ''
    const maxCapModules = p.module_qty && p.module_qty > 1 && p.max_capacity ? String(Math.floor(p.max_capacity / p.module_qty)) : ''
    setEditPackForm({
      item_no: p.item_no || '', name: p.name || '', type: p.type || 'bottle',
      size_oz: p.size_oz > 0 ? String(p.size_oz) : '', unit: p.unit || 'ea',
      cost_cad: String(p.cost_cad ?? ''),
      price_whs_cad: String(p.price_whs_cad ?? ''),
      barcode: p.barcode || '',
      current_stock: String(p.current_stock ?? ''),
      reorder_threshold: String(p.reorder_threshold ?? ''),
      max_capacity: String(p.max_capacity ?? ''),
      preferred_supplier_id: p.preferred_supplier_id || '',
      modules, maxCapModules,
      roll_length_m: p.roll_length_m != null ? String(p.roll_length_m) : '',
    })
    fetchItemPurchaseHistory('packaging', p.id)
  }

  async function handleUpdateRaw() {
    if (!editRaw) return
    setEditRawError('')
    const { error } = await supabase.from('raw_materials').update({
      item_no: editRawForm.item_no.trim(), name: editRawForm.name.trim(), unit: editRawForm.unit,
      cost_per_unit_cad: parseFloat(editRawForm.cost_per_unit_cad) || 0,
      cost_per_unit_usd: editRawForm.cost_per_unit_usd !== '' ? parseFloat(editRawForm.cost_per_unit_usd) : null,
      price_whs_cad: editRawForm.price_whs_cad !== '' ? parseFloat(editRawForm.price_whs_cad) : null,
      barcode: editRawForm.barcode.trim() || null,
      current_stock: parseFloat(editRawForm.current_stock) || 0,
      reorder_threshold: parseFloat(editRawForm.reorder_threshold) || 0,
      max_capacity: editRawForm.max_capacity !== '' ? parseFloat(editRawForm.max_capacity) : null,
      preferred_supplier_id: editRawForm.preferred_supplier_id || null,
      purchase_unit: editRawForm.purchase_unit || null,
      purchase_unit_kg: editRawForm.purchase_unit_kg !== '' ? parseFloat(editRawForm.purchase_unit_kg) : null,
    }).eq('id', editRaw.id)
    if (error) { setEditRawError(`DB error: ${error.message} (code: ${error.code})`); return }
    setEditRaw(null); setItemPurchaseHistory([])
    fetchAll()
  }

  async function handleDeleteRaw() {
    if (!editRaw) return
    if (!confirm(`Delete "${editRaw.name}"?`)) return
    const old = { ...editRaw }
    await logActivity(supabase, 'raw_materials', old.id, 'DELETE', old)
    await supabase.from('raw_materials').delete().eq('id', old.id)
    setEditRaw(null); setItemPurchaseHistory([])
    fetchAll()
    setUndoToast({
      message: `"${old.name}" deleted.`,
      onUndo: async () => {
        await supabase.from('raw_materials').upsert([old])
        await logActivity(supabase, 'raw_materials', old.id, 'UPDATE', null, old)
        setUndoToast(null); fetchAll()
      },
    })
  }

  async function handleUpdatePack() {
    if (!editPack) return
    setEditPackError('')
    const maxCap = editPackForm.max_capacity !== '' ? parseInt(editPackForm.max_capacity) : null
    const { error } = await supabase.from('packaging').update({
      item_no: editPackForm.item_no.trim(), name: editPackForm.name.trim(), type: editPackForm.type,
      size_oz: parseFloat(editPackForm.size_oz) || 0, unit: editPackForm.unit || null,
      cost_cad: parseFloat(editPackForm.cost_cad) || 0,
      price_whs_cad: editPackForm.price_whs_cad !== '' ? parseFloat(editPackForm.price_whs_cad) : null,
      barcode: editPackForm.barcode.trim() || null,
      current_stock: parseInt(editPackForm.current_stock) || 0,
      reorder_threshold: parseInt(editPackForm.reorder_threshold) || 0,
      max_capacity: maxCap != null && !isNaN(maxCap) ? maxCap : null,
      preferred_supplier_id: editPackForm.preferred_supplier_id || null,
      roll_length_m: editPackForm.roll_length_m !== '' ? parseFloat(editPackForm.roll_length_m) : null,
    }).eq('id', editPack.id)
    if (error) { setEditPackError(`DB error: ${error.message} (code: ${error.code})`); return }
    setEditPack(null); setItemPurchaseHistory([])
    fetchAll()
  }

  async function handleDeletePack() {
    if (!editPack) return
    if (!confirm(`Delete "${editPack.name}"?`)) return
    const old = { ...editPack }
    await logActivity(supabase, 'packaging', old.id, 'DELETE', old)
    await supabase.from('packaging').delete().eq('id', old.id)
    setEditPack(null); setItemPurchaseHistory([])
    fetchAll()
    setUndoToast({
      message: `"${old.name}" deleted.`,
      onUndo: async () => {
        await supabase.from('packaging').upsert([old])
        await logActivity(supabase, 'packaging', old.id, 'UPDATE', null, old)
        setUndoToast(null); fetchAll()
      },
    })
  }

  async function handleAddItem() {
    if (addType === 'raw_material') {
      const { error } = await supabase.from('raw_materials').insert([{
        item_no: addRawForm.item_no.trim(), name: addRawForm.name.trim(), unit: addRawForm.unit,
        cost_per_unit_cad: parseFloat(addRawForm.cost_per_unit_cad) || 0,
        price_whs_cad: addRawForm.price_whs_cad !== '' ? parseFloat(addRawForm.price_whs_cad) : null,
        barcode: addRawForm.barcode.trim() || null,
        current_stock: parseFloat(addRawForm.current_stock) || 0,
        reorder_threshold: parseFloat(addRawForm.reorder_threshold) || 0,
      }])
      if (error) { alert(`Failed to add: ${error.message}`); return }
    } else {
      const { error } = await supabase.from('packaging').insert([{
        item_no: addPackForm.item_no.trim(), name: addPackForm.name.trim(), type: addPackForm.type,
        unit: addPackForm.unit, cost_cad: parseFloat(addPackForm.cost_cad) || 0,
        price_whs_cad: addPackForm.price_whs_cad !== '' ? parseFloat(addPackForm.price_whs_cad) : null,
        barcode: addPackForm.barcode.trim() || null,
        current_stock: parseInt(addPackForm.current_stock) || 0,
        reorder_threshold: parseInt(addPackForm.reorder_threshold) || 0,
        size_oz: 0,
      }])
      if (error) { alert(`Failed to add: ${error.message}`); return }
    }
    setShowAddModal(false)
    setAddRawForm({ ...emptyAddRawForm })
    setAddPackForm({ ...emptyAddPackForm })
    fetchAll()
  }

  async function handleSyncWhsFromCost() {
    const rawToUpdate = rawMaterials
      .filter(r => r.price_whs_cad == null)
      .map(r => ({ id: r.id, price_whs_cad: r.cost_per_unit_cad }))
    const packToUpdate = packaging
      .filter(p => p.price_whs_cad == null)
      .map(p => ({ id: p.id, price_whs_cad: p.cost_cad }))

    if (rawToUpdate.length === 0 && packToUpdate.length === 0) {
      alert('모든 아이템에 WHS Price가 이미 설정되어 있습니다.')
      return
    }

    if (!confirm(`WHS Price가 없는 ${rawToUpdate.length + packToUpdate.length}개 아이템에 현재 Cost 값을 WHS Price로 설정합니다. 계속하시겠습니까?`)) return

    await Promise.all([
      ...rawToUpdate.map(r => supabase.from('raw_materials').update({ price_whs_cad: r.price_whs_cad }).eq('id', r.id)),
      ...packToUpdate.map(p => supabase.from('packaging').update({ price_whs_cad: p.price_whs_cad }).eq('id', p.id)),
    ])
    fetchAll()
  }

  function handleExport() {
    const rows = filteredItems.map(item => {
      const cost = getDisplayCost(item)
      if (item.itemType === 'Raw Material') {
        return { type: 'Raw Material', item_no: item.item_no, name: item.name, unit: item.unit, barcode: item.barcode || '', cost_cad: cost, whs_price_cad: item.price_whs_cad || '', current_stock: item.current_stock, reorder_at: item.reorder_threshold }
      } else {
        const p = item as Packaging & { itemType: 'Packaging' }
        return { type: 'Packaging', item_no: p.item_no, name: p.name, unit: p.unit || 'ea', barcode: p.barcode || '', cost_cad: cost, whs_price_cad: p.price_whs_cad || '', current_stock: p.current_stock, reorder_at: p.reorder_threshold }
      }
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Materials & Packaging')
    XLSX.writeFile(wb, `materials_packaging_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const allItems: UnifiedItem[] = [
    ...rawMaterials.map(r => ({ ...r, itemType: 'Raw Material' as const })),
    ...packaging.map(p => ({ ...p, itemType: 'Packaging' as const })),
  ].sort((a, b) => a.item_no.localeCompare(b.item_no))

  const filteredItems = allItems.filter(item => {
    const q = search.toLowerCase()
    const matchesSearch = !q || item.name?.toLowerCase().includes(q) || item.item_no?.toLowerCase().includes(q)
    const matchesType = typeFilter === 'all' || item.itemType === typeFilter
    return matchesSearch && matchesType
  })

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }

  function PurchaseHistorySection() {
    const received = itemPurchaseHistory.filter(h => h.purchase_orders?.status === 'received' && h.quantity > 0)
    const totalCost = received.reduce((s, h) => s + h.quantity * h.unit_price, 0)
    const totalQty = received.reduce((s, h) => s + h.quantity, 0)
    const avg = totalQty > 0 ? totalCost / totalQty : null
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Purchase History</span>
          {!loadingItemHistory && avg != null && (
            <span style={{ fontSize: '12px', color: '#64748b' }}>Avg unit price (received): <strong>${avg.toFixed(4)}</strong></span>
          )}
        </div>
        {loadingItemHistory ? (
          <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '12px' }}>Loading...</div>
        ) : itemPurchaseHistory.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '12px' }}>No purchase history</div>
        ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Supplier', 'Order Date', 'Qty', 'Price', 'Status', 'Received'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', fontSize: '11px', fontWeight: '600', color: '#64748b', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemPurchaseHistory.map((h, i) => {
                  const po = h.purchase_orders
                  const status = po?.status || '—'
                  return (
                    <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : undefined, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '7px 10px', fontSize: '12px', color: '#374151' }}>{po?.suppliers?.name || '—'}</td>
                      <td style={{ padding: '7px 10px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{formatTorontoDate(po?.ordered_at || '')}</td>
                      <td style={{ padding: '7px 10px', fontSize: '12px', color: '#1e293b', fontWeight: '500' }}>{h.quantity?.toLocaleString()}</td>
                      <td style={{ padding: '7px 10px', fontSize: '12px', color: '#1e293b' }}>${h.unit_price?.toFixed(4)}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ background: status === 'received' ? '#f0fdf4' : status === 'ordered' ? '#eff6ff' : '#f8fafc', color: status === 'received' ? '#16a34a' : status === 'ordered' ? '#2563eb' : '#64748b', padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: '500' }}>{status}</span>
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{formatTorontoDate(po?.received_at || '')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .modal-grid-2 { grid-template-columns: 1fr !important; }
        }
        .prod-row:hover td { background: #f8fafc; }
      `}</style>

      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', minWidth: '240px' }}>
            <Search size={15} color='#94a3b8' />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search items...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%', color: '#1e293b' }} />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
            style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff', color: '#374151', cursor: 'pointer', height: '38px' }}>
            <option value='all'>All Types</option>
            <option value='Raw Material'>Raw Material</option>
            <option value='Packaging'>Packaging</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {allItems.some(i => i.price_whs_cad == null) && (
            <button onClick={handleSyncWhsFromCost}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#d97706', border: '1px solid #fcd34d', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', height: '38px' }}>
              Cost → WHS Price
            </button>
          )}
          <button onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', height: '38px' }}>
            <Download size={14} /> Export Excel
          </button>
          <button onClick={() => { setShowAddModal(true); setAddType('raw_material'); setAddRawForm({ ...emptyAddRawForm }); setAddPackForm({ ...emptyAddPackForm }) }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', height: '38px' }}>
            <Plus size={15} /> Add Item
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['ITEM NO', 'ITEM DESCRIPTION', 'UNIT', 'TYPE', 'BARCODE', 'COST (CAD)', 'WHS PRICE', 'MARGIN RATE', 'STOCK', 'REORDER AT', 'STATUS'].map(h => (
                  <th key={h} style={{ padding: '13px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ padding: '56px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: '56px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No items found</td></tr>
              ) : filteredItems.map(item => {
                const isLow = item.current_stock <= item.reorder_threshold && item.reorder_threshold > 0
                const isOut = item.current_stock === 0
                const displayUnit = item.itemType === 'Packaging'
                  ? ((item as Packaging).type === 'shrink_band' ? 'roll' : ((item as Packaging).unit || 'ea'))
                  : item.unit
                const cost = getDisplayCost(item)
                const whs = item.price_whs_cad ?? null
                const marginStr = getMargin(cost, whs)
                const marginNum = marginStr != null ? parseFloat(marginStr) : null

                return (
                  <tr key={`${item.itemType}-${item.id}`} className="prod-row"
                    onClick={() => item.itemType === 'Raw Material' ? openEditRaw(item as RawMaterial & { itemType: 'Raw Material' }) : openEditPack(item as Packaging & { itemType: 'Packaging' })}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>

                    {/* ITEM NO */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{item.item_no}</span>
                    </td>

                    {/* ITEM DESCRIPTION */}
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500', maxWidth: '260px' }}>
                      {item.name}
                    </td>

                    {/* UNIT */}
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>
                      {displayUnit}
                    </td>

                    {/* TYPE */}
                    <td style={{ padding: '14px 16px' }}>
                      {item.itemType === 'Raw Material' ? (
                        <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>Raw Material</span>
                      ) : (
                        <span style={{ background: '#f5f3ff', color: '#7c3aed', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>Packaging</span>
                      )}
                    </td>

                    {/* BARCODE */}
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      {item.barcode || '—'}
                    </td>

                    {/* COST (CAD) */}
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>
                      {fmtCost(item)}
                    </td>

                    {/* WHS PRICE */}
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>
                      {whs != null ? `$${whs.toFixed(2)}` : '—'}
                    </td>

                    {/* MARGIN RATE */}
                    <td style={{ padding: '14px 16px' }}>
                      {marginStr != null ? (
                        <span style={{ fontSize: '13px', fontWeight: '600', color: marginNum! >= 0 ? '#16a34a' : '#dc2626' }}>
                          {marginStr}%
                        </span>
                      ) : <span style={{ fontSize: '13px', color: '#94a3b8' }}>—</span>}
                    </td>

                    {/* STOCK */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: isOut ? '#dc2626' : isLow ? '#d97706' : '#1e293b' }}>
                        {item.current_stock?.toLocaleString()}
                      </span>
                    </td>

                    {/* REORDER AT */}
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>
                      {item.reorder_threshold?.toLocaleString()}
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: '14px 16px' }}>
                      {isOut ? (
                        <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600' }}>Out of Stock</span>
                      ) : isLow ? (
                        <span style={{ background: '#fef3c7', color: '#d97706', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600' }}>Low Stock</span>
                      ) : (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600' }}>OK</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Row count footer */}
        {!loading && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8' }}>
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Add Item Modal ── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', margin: '0 auto' }}>

            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>Add Item</h2>

            {/* Type toggle */}
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px', marginBottom: '22px', gap: '4px' }}>
              {(['raw_material', 'packaging'] as const).map(t => (
                <button key={t} onClick={() => setAddType(t)}
                  style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s',
                    background: addType === t ? '#fff' : 'transparent',
                    color: addType === t ? (t === 'raw_material' ? '#2563eb' : '#7c3aed') : '#64748b',
                    boxShadow: addType === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  {t === 'raw_material' ? 'Raw Material' : 'Packaging'}
                </button>
              ))}
            </div>

            {addType === 'raw_material' ? (
              <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Name</label>
                  <input value={addRawForm.name} onChange={e => setAddRawForm({ ...addRawForm, name: e.target.value })} placeholder='e.g. Jojoba Oil' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Item No</label>
                  <input value={addRawForm.item_no} onChange={e => setAddRawForm({ ...addRawForm, item_no: e.target.value })} placeholder='e.g. RM-001' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Unit</label>
                  <select value={addRawForm.unit} onChange={e => setAddRawForm({ ...addRawForm, unit: e.target.value })} style={inp}>
                    <option value='ml'>ml</option><option value='g'>g</option><option value='kg'>kg</option><option value='L'>L</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Cost (CAD)</label>
                  <input type='number' min='0' step='0.0001' value={addRawForm.cost_per_unit_cad} onChange={e => setAddRawForm({ ...addRawForm, cost_per_unit_cad: e.target.value })} placeholder='0.0000' style={inp} />
                </div>
                <div>
                  <label style={lbl}>WHS Price (CAD)</label>
                  <input type='number' min='0' step='0.01' value={addRawForm.price_whs_cad} onChange={e => setAddRawForm({ ...addRawForm, price_whs_cad: e.target.value })} placeholder='0.00' style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Barcode</label>
                  <input value={addRawForm.barcode} onChange={e => setAddRawForm({ ...addRawForm, barcode: e.target.value })} placeholder='e.g. 628176712130' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Current Stock</label>
                  <input type='number' min='0' value={addRawForm.current_stock} onChange={e => setAddRawForm({ ...addRawForm, current_stock: e.target.value })} placeholder='0' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Reorder At</label>
                  <input type='number' min='0' value={addRawForm.reorder_threshold} onChange={e => setAddRawForm({ ...addRawForm, reorder_threshold: e.target.value })} placeholder='0' style={inp} />
                </div>
              </div>
            ) : (
              <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Name</label>
                  <input value={addPackForm.name} onChange={e => setAddPackForm({ ...addPackForm, name: e.target.value })} placeholder='e.g. 2oz Bottle' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Item No</label>
                  <input value={addPackForm.item_no} onChange={e => setAddPackForm({ ...addPackForm, item_no: e.target.value })} placeholder='e.g. PK-001' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Type</label>
                  <select value={addPackForm.type} onChange={e => setAddPackForm({ ...addPackForm, type: e.target.value })} style={inp}>
                    <option value='bottle'>Bottle</option><option value='dropper'>Dropper</option><option value='cap'>Cap</option>
                    <option value='box'>Box</option><option value='shrink_band'>Shrink Band</option><option value='label'>Label</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Unit</label>
                  <select value={addPackForm.unit} onChange={e => setAddPackForm({ ...addPackForm, unit: e.target.value })} style={inp}>
                    <option value='ea'>ea</option><option value='roll'>roll</option><option value='box'>box</option><option value='pack'>pack</option><option value='bottle'>bottle</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Cost (CAD)</label>
                  <input type='number' min='0' step='0.00001' value={addPackForm.cost_cad} onChange={e => setAddPackForm({ ...addPackForm, cost_cad: e.target.value })} placeholder='0.00000' style={inp} />
                </div>
                <div>
                  <label style={lbl}>WHS Price (CAD)</label>
                  <input type='number' min='0' step='0.01' value={addPackForm.price_whs_cad} onChange={e => setAddPackForm({ ...addPackForm, price_whs_cad: e.target.value })} placeholder='0.00' style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Barcode</label>
                  <input value={addPackForm.barcode} onChange={e => setAddPackForm({ ...addPackForm, barcode: e.target.value })} placeholder='e.g. 628176712130' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Current Stock</label>
                  <input type='number' min='0' value={addPackForm.current_stock} onChange={e => setAddPackForm({ ...addPackForm, current_stock: e.target.value })} placeholder='0' style={inp} />
                </div>
                <div>
                  <label style={lbl}>Reorder At</label>
                  <input type='number' min='0' value={addPackForm.reorder_threshold} onChange={e => setAddPackForm({ ...addPackForm, reorder_threshold: e.target.value })} placeholder='0' style={inp} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={() => setShowAddModal(false)}
                style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>Cancel</button>
              <button onClick={handleAddItem}
                style={{ padding: '9px 22px', background: addType === 'raw_material' ? '#2563eb' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Raw Material Modal ── */}
      {editRaw && (
        <div className="modal-overlay" onClick={() => { setEditRaw(null); setItemPurchaseHistory([]) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Edit Raw Material</h2>
              <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '600' }}>{editRaw.item_no}</span>
            </div>
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '4px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Name</label>
                <input value={editRawForm.name} onChange={e => setEditRawForm({ ...editRawForm, name: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Item No</label>
                <input value={editRawForm.item_no} onChange={e => setEditRawForm({ ...editRawForm, item_no: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Unit</label>
                <select value={editRawForm.unit} onChange={e => setEditRawForm({ ...editRawForm, unit: e.target.value })} style={inp}>
                  <option value='ml'>ml</option><option value='g'>g</option><option value='kg'>kg</option><option value='L'>L</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Cost (CAD)</label>
                <input type='number' min='0' step='0.0001' value={editRawForm.cost_per_unit_cad} onChange={e => setEditRawForm({ ...editRawForm, cost_per_unit_cad: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>USD Price/kg</label>
                <input type='number' min='0' step='0.01' value={editRawForm.cost_per_unit_usd} onChange={e => setEditRawForm({ ...editRawForm, cost_per_unit_usd: e.target.value })} placeholder='—' style={inp} />
              </div>
              <div>
                <label style={lbl}>WHS Price (CAD)</label>
                <input type='number' min='0' step='0.01' value={editRawForm.price_whs_cad} onChange={e => setEditRawForm({ ...editRawForm, price_whs_cad: e.target.value })} placeholder='—' style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Barcode</label>
                <input value={editRawForm.barcode} onChange={e => setEditRawForm({ ...editRawForm, barcode: e.target.value })} placeholder='—' style={inp} />
              </div>
              <div>
                <label style={lbl}>Current Stock</label>
                <input type='number' min='0' value={editRawForm.current_stock} onChange={e => setEditRawForm({ ...editRawForm, current_stock: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Reorder At</label>
                <input type='number' min='0' value={editRawForm.reorder_threshold} onChange={e => setEditRawForm({ ...editRawForm, reorder_threshold: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Max Capacity</label>
                <input type='number' min='0' value={editRawForm.max_capacity} onChange={e => setEditRawForm({ ...editRawForm, max_capacity: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Purchase Unit</label>
                <select value={editRawForm.purchase_unit} onChange={e => setEditRawForm({ ...editRawForm, purchase_unit: e.target.value })} style={inp}>
                  <option value=''>—</option><option value='Drum'>Drum</option><option value='Gallon'>Gallon</option><option value='Pail'>Pail</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Unit Size (kg)</label>
                <input type='number' min='0' step='0.1' value={editRawForm.purchase_unit_kg} onChange={e => setEditRawForm({ ...editRawForm, purchase_unit_kg: e.target.value })} placeholder='e.g. 200' style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Avg Cost (CAD) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>auto-calculated from purchases</span></label>
                <input readOnly value={editRaw?.avg_cost_cad != null ? editRaw.avg_cost_cad.toFixed(4) : ''} placeholder='—' style={{ ...inp, background: '#f8fafc', color: '#64748b', cursor: 'default' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Preferred Supplier</label>
                <select value={editRawForm.preferred_supplier_id} onChange={e => setEditRawForm({ ...editRawForm, preferred_supplier_id: e.target.value })} style={inp}>
                  <option value=''>None</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <PurchaseHistorySection />
            {editRawError && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px' }}>{editRawError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeleteRaw} style={{ padding: '9px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setEditRaw(null); setEditRawError(''); setItemPurchaseHistory([]) }} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdateRaw} style={{ padding: '9px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Packaging Modal ── */}
      {editPack && (
        <div className="modal-overlay" onClick={() => { setEditPack(null); setItemPurchaseHistory([]) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Edit Packaging</h2>
              <span style={{ background: '#f5f3ff', color: '#7c3aed', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '600' }}>{editPack.item_no}</span>
            </div>
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '4px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Name</label>
                <input value={editPackForm.name} onChange={e => setEditPackForm({ ...editPackForm, name: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Item No</label>
                <input value={editPackForm.item_no} onChange={e => setEditPackForm({ ...editPackForm, item_no: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select value={editPackForm.type} onChange={e => setEditPackForm({ ...editPackForm, type: e.target.value })} style={inp}>
                  <option value='bottle'>Bottle</option><option value='dropper'>Dropper</option><option value='cap'>Cap</option>
                  <option value='box'>Box</option><option value='shrink_band'>Shrink Band</option><option value='label'>Label</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Unit</label>
                <select value={editPackForm.unit} onChange={e => setEditPackForm({ ...editPackForm, unit: e.target.value })} style={inp}>
                  <option value='ea'>ea</option><option value='roll'>roll</option><option value='box'>box</option><option value='pack'>pack</option><option value='bottle'>bottle</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Cost (CAD)</label>
                <input type='number' min='0' step='0.00001' value={editPackForm.cost_cad} onChange={e => setEditPackForm({ ...editPackForm, cost_cad: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>WHS Price (CAD)</label>
                <input type='number' min='0' step='0.01' value={editPackForm.price_whs_cad} onChange={e => setEditPackForm({ ...editPackForm, price_whs_cad: e.target.value })} placeholder='—' style={inp} />
              </div>
              {['bottle', 'dropper', 'cap'].includes(editPackForm.type) && (
                <div>
                  <label style={lbl}>Size (oz)</label>
                  <input type='number' min='0' step='any' value={editPackForm.size_oz} onChange={e => setEditPackForm({ ...editPackForm, size_oz: e.target.value })} placeholder='0' style={inp} />
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Barcode</label>
                <input value={editPackForm.barcode} onChange={e => setEditPackForm({ ...editPackForm, barcode: e.target.value })} placeholder='—' style={inp} />
              </div>
              <div>
                <label style={lbl}>Reorder At</label>
                <input type='number' min='0' value={editPackForm.reorder_threshold} onChange={e => setEditPackForm({ ...editPackForm, reorder_threshold: e.target.value })} style={inp} />
              </div>
              {editPack?.module_qty && editPack.module_qty > 1 ? (
                <>
                  <div>
                    <label style={lbl}>Max Capacity (Modules) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(1 module = {editPack.module_qty.toLocaleString()} ea)</span></label>
                    <input type='number' min='0' value={editPackForm.maxCapModules}
                      onChange={e => {
                        const mods = e.target.value
                        setEditPackForm({ ...editPackForm, maxCapModules: mods, max_capacity: mods !== '' ? String((parseInt(mods) || 0) * editPack!.module_qty!) : '' })
                      }} placeholder='0' style={inp} />
                    {editPackForm.maxCapModules !== '' && <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>= {((parseInt(editPackForm.maxCapModules) || 0) * editPack.module_qty).toLocaleString()} ea</div>}
                  </div>
                  <div>
                    <label style={lbl}>Modules <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(1 module = {editPack.module_qty.toLocaleString()} ea)</span></label>
                    <input type='number' min='0' value={editPackForm.modules}
                      onChange={e => {
                        const mods = e.target.value
                        setEditPackForm({ ...editPackForm, modules: mods, current_stock: mods !== '' ? String((parseInt(mods) || 0) * editPack!.module_qty!) : '0' })
                      }} placeholder='0' style={inp} />
                    {editPackForm.modules !== '' && <div style={{ marginTop: '4px', fontSize: '12px', color: '#2563eb' }}>= {((parseInt(editPackForm.modules) || 0) * editPack.module_qty).toLocaleString()} ea</div>}
                  </div>
                </>
              ) : (
                <div>
                  <label style={lbl}>{editPack?.type === 'shrink_band' ? 'Current Stock (Rolls)' : 'Current Stock'}</label>
                  <input type='number' min='0' value={editPackForm.current_stock} onChange={e => setEditPackForm({ ...editPackForm, current_stock: e.target.value })} style={inp} />
                </div>
              )}
              {editPack?.type === 'shrink_band' && (
                <div>
                  <label style={lbl}>Roll Length (m)</label>
                  <input type='number' min='0' step='any' value={editPackForm.roll_length_m} onChange={e => setEditPackForm({ ...editPackForm, roll_length_m: e.target.value })} placeholder='e.g. 100' style={inp} />
                </div>
              )}
              {!(editPack?.module_qty && editPack.module_qty > 1) && editPack?.type !== 'shrink_band' && (
                <div>
                  <label style={lbl}>Max Capacity</label>
                  <input type='number' min='0' value={editPackForm.max_capacity} onChange={e => setEditPackForm({ ...editPackForm, max_capacity: e.target.value })} style={inp} />
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Avg Cost (CAD) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>auto-calculated from purchases</span></label>
                <input readOnly value={editPack?.avg_cost_cad != null ? editPack.avg_cost_cad.toFixed(5) : ''} placeholder='—' style={{ ...inp, background: '#f8fafc', color: '#64748b', cursor: 'default' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Preferred Supplier</label>
                <select value={editPackForm.preferred_supplier_id} onChange={e => setEditPackForm({ ...editPackForm, preferred_supplier_id: e.target.value })} style={inp}>
                  <option value=''>None</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {editPackError && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px' }}>{editPackError}</div>
            )}
            <PurchaseHistorySection />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeletePack} style={{ padding: '9px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setEditPack(null); setEditPackError(''); setItemPurchaseHistory([]) }} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdatePack} style={{ padding: '9px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {undoToast && <UndoToast message={undoToast.message} onUndo={undoToast.onUndo} onDismiss={() => setUndoToast(null)} />}
    </MainLayout>
  )
}
