'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatTorontoDate } from '@/lib/utils'
import { FlaskConical, Package, Search, TableIcon } from 'lucide-react'
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

function formatShrinkBand(stock: number | null | undefined, roll_length_m: number | null | undefined): string {
  const s = stock ?? 0
  if (roll_length_m) return `${s.toLocaleString()} rolls (${roll_length_m}m/roll)`
  return `${s.toLocaleString()} rolls (length TBD)`
}

function formatPackStock(stock: number | null | undefined, module_qty: number | null | undefined): string {
  const s = stock ?? 0
  if (module_qty && module_qty > 1) {
    const modules = Math.floor(s / module_qty)
    const remainder = s % module_qty
    const base = `${s.toLocaleString()} ea (${modules} module${modules !== 1 ? 's' : ''}`
    return remainder > 0 ? `${base} + ${remainder.toLocaleString()} ea)` : `${base})`
  }
  return `${s.toLocaleString()} ea`
}

export default function Products() {
  const [tab, setTab] = useState<'raw' | 'packaging'>('raw')
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packaging, setPackaging] = useState<Packaging[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editRaw, setEditRaw] = useState<RawMaterial | null>(null)
  const [editPack, setEditPack] = useState<Packaging | null>(null)
  const [editRawForm, setEditRawForm] = useState({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', cost_per_unit_usd: '', current_stock: '', reorder_threshold: '', max_capacity: '', preferred_supplier_id: '', purchase_unit: '', purchase_unit_kg: '' })
  const [editPackForm, setEditPackForm] = useState({ item_no: '', name: '', type: 'bottle', size_oz: '', unit: 'ea', cost_cad: '', current_stock: '', reorder_threshold: '', max_capacity: '', preferred_supplier_id: '', modules: '', maxCapModules: '', roll_length_m: '' })
  const [editPackError, setEditPackError] = useState('')
  const [itemPurchaseHistory, setItemPurchaseHistory] = useState<PurchaseHistoryEntry[]>([])
  const [loadingItemHistory, setLoadingItemHistory] = useState(false)
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
      .select(`
        quantity, unit_price,
        purchase_orders (
          id, po_number, ordered_at, received_at, status,
          suppliers (name)
        )
      `)
      .eq('material_type', itemType)
      .eq('material_id', itemId)
      .order('created_at', { ascending: false })
    setItemPurchaseHistory((data as unknown as PurchaseHistoryEntry[]) || [])
    setLoadingItemHistory(false)
  }

  function openEditRaw(r: RawMaterial) {
    setEditRaw(r)
    setItemPurchaseHistory([])
    setEditRawForm({
      item_no: r.item_no || '',
      name: r.name || '',
      unit: r.unit || 'ml',
      cost_per_unit_cad: String(r.cost_per_unit_cad ?? ''),
      cost_per_unit_usd: String(r.cost_per_unit_usd ?? ''),
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
      item_no: p.item_no || '',
      name: p.name || '',
      type: p.type || 'bottle',
      size_oz: p.size_oz > 0 ? String(p.size_oz) : '',
      unit: p.unit || 'ea',
      cost_cad: String(p.cost_cad ?? ''),
      current_stock: String(p.current_stock ?? ''),
      reorder_threshold: String(p.reorder_threshold ?? ''),
      max_capacity: String(p.max_capacity ?? ''),
      preferred_supplier_id: p.preferred_supplier_id || '',
      modules,
      maxCapModules,
      roll_length_m: p.roll_length_m != null ? String(p.roll_length_m) : '',
    })
    fetchItemPurchaseHistory('packaging', p.id)
  }

  async function handleUpdateRaw() {
    if (!editRaw) return
    const { error } = await supabase.from('raw_materials').update({
      item_no: editRawForm.item_no.trim(),
      name: editRawForm.name.trim(),
      unit: editRawForm.unit,
      cost_per_unit_cad: parseFloat(editRawForm.cost_per_unit_cad) || 0,
      cost_per_unit_usd: editRawForm.cost_per_unit_usd !== '' ? parseFloat(editRawForm.cost_per_unit_usd) : null,
      current_stock: parseFloat(editRawForm.current_stock) || 0,
      reorder_threshold: parseFloat(editRawForm.reorder_threshold) || 0,
      max_capacity: editRawForm.max_capacity !== '' ? parseFloat(editRawForm.max_capacity) : null,
      preferred_supplier_id: editRawForm.preferred_supplier_id || null,
      purchase_unit: editRawForm.purchase_unit || null,
      purchase_unit_kg: editRawForm.purchase_unit_kg !== '' ? parseFloat(editRawForm.purchase_unit_kg) : null,
    }).eq('id', editRaw.id)
    if (error) console.error('raw_material update error:', error)
    setEditRaw(null)
    setItemPurchaseHistory([])
    fetchAll()
  }

  async function handleDeleteRaw() {
    if (!editRaw) return
    if (!confirm(`Delete "${editRaw.name}"?`)) return
    const old = { ...editRaw }
    await logActivity(supabase, 'raw_materials', old.id, 'DELETE', old)
    const { error } = await supabase.from('raw_materials').delete().eq('id', old.id)
    if (error) console.error('raw_material delete error:', error)
    setEditRaw(null)
    setItemPurchaseHistory([])
    fetchAll()
    setUndoToast({
      message: `"${old.name}" deleted.`,
      onUndo: async () => {
        await supabase.from('raw_materials').upsert([old])
        await logActivity(supabase, 'raw_materials', old.id, 'UPDATE', null, old)
        setUndoToast(null)
        fetchAll()
      },
    })
  }

  async function handleUpdatePack() {
    if (!editPack) return
    setEditPackError('')
    const maxCap = editPackForm.max_capacity !== '' ? parseInt(editPackForm.max_capacity) : null
    const { data, error } = await supabase.from('packaging').update({
      item_no: editPackForm.item_no.trim(),
      name: editPackForm.name.trim(),
      type: editPackForm.type,
      size_oz: parseFloat(editPackForm.size_oz) || 0,
      unit: editPackForm.unit || null,
      cost_cad: parseFloat(editPackForm.cost_cad) || 0,
      current_stock: parseInt(editPackForm.current_stock) || 0,
      reorder_threshold: parseInt(editPackForm.reorder_threshold) || 0,
      max_capacity: maxCap != null && !isNaN(maxCap) ? maxCap : null,
      preferred_supplier_id: editPackForm.preferred_supplier_id || null,
    }).eq('id', editPack.id).select()
    if (error) {
      setEditPackError(`DB error: ${error.message} (code: ${error.code})`)
      return
    }
    if (!data || data.length === 0) {
      setEditPackError('Update failed: no rows were modified. The item may have been deleted or you may lack permission.')
      return
    }
    setEditPack(null)
    setItemPurchaseHistory([])
    fetchAll()
  }

  async function handleDeletePack() {
    if (!editPack) return
    if (!confirm(`Delete "${editPack.name}"?`)) return
    const old = { ...editPack }
    await logActivity(supabase, 'packaging', old.id, 'DELETE', old)
    const { error } = await supabase.from('packaging').delete().eq('id', old.id)
    if (error) console.error('packaging delete error:', error)
    setEditPack(null)
    setItemPurchaseHistory([])
    fetchAll()
    setUndoToast({
      message: `"${old.name}" deleted.`,
      onUndo: async () => {
        await supabase.from('packaging').upsert([old])
        await logActivity(supabase, 'packaging', old.id, 'UPDATE', null, old)
        setUndoToast(null)
        fetchAll()
      },
    })
  }

  function handleExport() {
    if (tab === 'raw') {
      const rows = filteredRaw.map(r => ({
        item_no: r.item_no,
        name: r.name,
        unit: r.unit,
        cost_cad: r.cost_per_unit_cad,
        avg_cost_cad: r.avg_cost_cad ?? '',
        current_stock: r.current_stock,
        reorder_threshold: r.reorder_threshold,
        preferred_supplier: suppliers.find(s => s.id === r.preferred_supplier_id)?.name || '',
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Raw Materials')
      XLSX.writeFile(wb, `raw_materials_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } else {
      const rows = filteredPack.map(p => ({
        item_no: p.item_no,
        name: p.name,
        type: p.type,
        unit: p.unit || (p.type === 'shrink_band' ? 'roll' : 'ea'),
        cost_cad: p.cost_cad,
        avg_cost_cad: p.avg_cost_cad ?? '',
        current_stock: p.current_stock,
        reorder_threshold: p.reorder_threshold,
        preferred_supplier: suppliers.find(s => s.id === p.preferred_supplier_id)?.name || '',
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Packaging')
      XLSX.writeFile(wb, `packaging_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }
  }

  const filteredRaw = rawMaterials.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.item_no?.toLowerCase().includes(search.toLowerCase())
  )
  const filteredPack = packaging.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.item_no?.toLowerCase().includes(search.toLowerCase())
  )

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }
  const rowHover = { onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) => (e.currentTarget.style.background = '#f8fafc'), onMouseLeave: (e: React.MouseEvent<HTMLTableRowElement>) => (e.currentTarget.style.background = '') }

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .modal-grid-2, .modal-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {([{ key: 'raw', label: 'Raw Materials' }, { key: 'packaging', label: 'Packaging' }] as const).map((t, i) => (
            <button key={t.key} onClick={() => { setTab(t.key); setSearch('') }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', background: tab === t.key ? '#2563eb' : '#fff', color: tab === t.key ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '14px', fontWeight: '500', borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0', borderLeft: i > 0 ? 'none' : '1px solid #e2e8f0' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px' }}>
            <Search size={16} color='#94a3b8' />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '160px' }} />
          </div>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
            <TableIcon size={14} /> Export Excel
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {tab === 'raw'
                  ? ['Item No', 'Name', 'Unit', 'Cost (CAD)', 'Avg Cost', 'Current Stock', 'Reorder At', 'Preferred Supplier'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))
                  : ['Item No', 'Name', 'Type', 'Unit', 'Cost (CAD)', 'Avg Cost', 'Current Stock', 'Reorder At', 'Preferred Supplier'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))
                }
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
              ) : tab === 'raw' ? (
                filteredRaw.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                    <FlaskConical size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                    No raw materials found
                  </td></tr>
                ) : filteredRaw.map(r => (
                  <tr key={r.id} onClick={() => openEditRaw(r)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{r.item_no}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{r.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.unit}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${r.cost_per_unit_cad?.toFixed(4)}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.avg_cost_cad != null ? `$${r.avg_cost_cad.toFixed(4)}` : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: r.current_stock <= r.reorder_threshold ? '#dc2626' : '#16a34a' }}>{r.current_stock?.toLocaleString()} {r.unit}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.reorder_threshold?.toLocaleString()} {r.unit}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{suppliers.find(s => s.id === r.preferred_supplier_id)?.name || '—'}</td>
                  </tr>
                ))
              ) : (
                filteredPack.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                    <Package size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                    No packaging items found
                  </td></tr>
                ) : filteredPack.map(p => (
                  <tr key={p.id} onClick={() => openEditPack(p)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{p.item_no}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{p.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.type}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.type === 'shrink_band' ? 'roll' : (p.unit && p.unit !== '') ? p.unit : 'ea'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${p.cost_cad?.toFixed(5)}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.avg_cost_cad != null ? `$${p.avg_cost_cad.toFixed(5)}` : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a' }}>
                      {p.type === 'shrink_band' ? formatShrinkBand(p.current_stock, p.roll_length_m) : formatPackStock(p.current_stock, p.module_qty)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.reorder_threshold?.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{suppliers.find(s => s.id === p.preferred_supplier_id)?.name || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Raw Material Modal */}
      {editRaw && (
        <div className="modal-overlay" onClick={() => { setEditRaw(null); setItemPurchaseHistory([]) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Edit Raw Material</h2>
            {([['Item #', 'item_no'], ['Name', 'name'], ['Cost (CAD)', 'cost_per_unit_cad'], ['Current Stock (ml)', 'current_stock'], ['Reorder Threshold (ml)', 'reorder_threshold'], ['Max Capacity (ml)', 'max_capacity']] as [string, string][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={lbl}>{label}</label>
                <input value={editRawForm[key as keyof typeof editRawForm]} onChange={e => setEditRawForm({ ...editRawForm, [key]: e.target.value })} style={inp} />
              </div>
            ))}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>USD Price/kg</label>
              <input type='number' min='0' step='0.01' value={editRawForm.cost_per_unit_usd} onChange={e => setEditRawForm({ ...editRawForm, cost_per_unit_usd: e.target.value })} placeholder='e.g. 9.00' style={inp} />
            </div>
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={lbl}>Purchase Unit</label>
                <select value={editRawForm.purchase_unit} onChange={e => setEditRawForm({ ...editRawForm, purchase_unit: e.target.value })} style={inp}>
                  <option value=''>—</option>
                  <option value='Drum'>Drum</option>
                  <option value='Gallon'>Gallon</option>
                  <option value='Pail'>Pail</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Unit Size (kg)</label>
                <input type='number' min='0' step='0.1' value={editRawForm.purchase_unit_kg} onChange={e => setEditRawForm({ ...editRawForm, purchase_unit_kg: e.target.value })} placeholder='e.g. 200' style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Cost (Avg) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(auto-calculated from purchases)</span></label>
              <input readOnly value={editRaw?.avg_cost_cad != null ? editRaw.avg_cost_cad.toFixed(4) : ''} placeholder='—' style={{ ...inp, background: '#f8fafc', color: '#64748b', cursor: 'default' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Unit</label>
              <select value={editRawForm.unit} onChange={e => setEditRawForm({ ...editRawForm, unit: e.target.value })} style={inp}>
                <option value='ml'>ml</option><option value='g'>g</option><option value='kg'>kg</option><option value='L'>L</option>
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Preferred Supplier</label>
              <select value={editRawForm.preferred_supplier_id} onChange={e => setEditRawForm({ ...editRawForm, preferred_supplier_id: e.target.value })} style={inp}>
                <option value=''>None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Purchase History</span>
                {!loadingItemHistory && itemPurchaseHistory.length > 0 && (() => {
                  const received = itemPurchaseHistory.filter(h => h.purchase_orders?.status === 'received' && h.quantity > 0)
                  const totalCost = received.reduce((s, h) => s + h.quantity * h.unit_price, 0)
                  const totalQty = received.reduce((s, h) => s + h.quantity, 0)
                  const avg = totalQty > 0 ? totalCost / totalQty : null
                  return avg != null ? (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Avg unit price (received): <strong>${avg.toFixed(4)}</strong></span>
                  ) : null
                })()}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeleteRaw} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setEditRaw(null); setItemPurchaseHistory([]) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdateRaw} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Packaging Modal */}
      {editPack && (
        <div className="modal-overlay" onClick={() => { setEditPack(null); setItemPurchaseHistory([]) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Edit Packaging</h2>
            {([['Item #', 'item_no'], ['Name', 'name'], ['Cost (CAD)', 'cost_cad'], ['Reorder Threshold', 'reorder_threshold']] as [string, string][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={lbl}>{label}</label>
                <input value={editPackForm[key as keyof typeof editPackForm]} onChange={e => setEditPackForm({ ...editPackForm, [key]: e.target.value })} style={inp} />
              </div>
            ))}
            {editPack?.module_qty && editPack.module_qty > 1 ? (
              <div style={{ marginBottom: '16px' }}>
                <label style={lbl}>Max Capacity (Modules) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(1 module = {editPack.module_qty.toLocaleString()} ea)</span></label>
                <input type='number' min='0' value={editPackForm.maxCapModules}
                  onChange={e => {
                    const mods = e.target.value
                    setEditPackForm({ ...editPackForm, maxCapModules: mods, max_capacity: mods !== '' ? String((parseInt(mods) || 0) * editPack!.module_qty!) : '' })
                  }}
                  placeholder='0' style={inp} />
                {editPackForm.maxCapModules !== '' && (
                  <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                    = {((parseInt(editPackForm.maxCapModules) || 0) * editPack.module_qty).toLocaleString()} ea
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <label style={lbl}>Max Capacity</label>
                <input value={editPackForm.max_capacity} onChange={e => setEditPackForm({ ...editPackForm, max_capacity: e.target.value })} style={inp} />
              </div>
            )}
            {editPack?.module_qty && editPack.module_qty > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={lbl}>Modules <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(1 module = {editPack.module_qty.toLocaleString()} ea)</span></label>
                <input type='number' min='0' value={editPackForm.modules}
                  onChange={e => {
                    const mods = e.target.value
                    setEditPackForm({ ...editPackForm, modules: mods, current_stock: mods !== '' ? String((parseInt(mods) || 0) * editPack!.module_qty!) : '0' })
                  }}
                  placeholder='0' style={inp} />
                {editPackForm.modules !== '' && (
                  <div style={{ marginTop: '6px', fontSize: '13px', color: '#2563eb', fontWeight: '500' }}>
                    = {((parseInt(editPackForm.modules) || 0) * editPack.module_qty).toLocaleString()} ea ({parseInt(editPackForm.modules) || 0} module × {editPack.module_qty.toLocaleString()} ea/module)
                  </div>
                )}
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>{editPack?.type === 'shrink_band' ? 'Current Stock (Rolls)' : 'Current Stock'}</label>
              <input type='number' min='0' value={editPackForm.current_stock} onChange={e => setEditPackForm({ ...editPackForm, current_stock: e.target.value })} style={inp} />
              {editPack?.type === 'shrink_band' && editPackForm.current_stock !== '' && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  {formatShrinkBand(parseInt(editPackForm.current_stock) || 0, editPackForm.roll_length_m !== '' ? parseFloat(editPackForm.roll_length_m) : null)}
                </div>
              )}
            </div>
            {editPack?.type === 'shrink_band' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={lbl}>Roll Length (m) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(optional)</span></label>
                <input type='number' min='0' step='any' value={editPackForm.roll_length_m} onChange={e => setEditPackForm({ ...editPackForm, roll_length_m: e.target.value })} placeholder='e.g. 100' style={inp} />
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Cost (Avg) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(auto-calculated from purchases)</span></label>
              <input readOnly value={editPack?.avg_cost_cad != null ? editPack.avg_cost_cad.toFixed(5) : ''} placeholder='—' style={{ ...inp, background: '#f8fafc', color: '#64748b', cursor: 'default' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Type</label>
              <select value={editPackForm.type} onChange={e => setEditPackForm({ ...editPackForm, type: e.target.value })} style={inp}>
                <option value='bottle'>Bottle</option><option value='dropper'>Dropper</option><option value='cap'>Cap</option>
                <option value='box'>Box</option><option value='shrink_band'>Shrink Band</option><option value='label'>Label</option>
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Unit</label>
              <select value={editPackForm.unit} onChange={e => setEditPackForm({ ...editPackForm, unit: e.target.value })} style={inp}>
                <option value='ea'>ea</option>
                <option value='roll'>roll</option>
                <option value='box'>box</option>
                <option value='pack'>pack</option>
                <option value='bottle'>bottle</option>
              </select>
            </div>
            {['bottle', 'dropper', 'cap'].includes(editPackForm.type) && (
              <div style={{ marginBottom: '16px' }}>
                <label style={lbl}>Size (oz)</label>
                <input type='number' min='0' step='any' value={editPackForm.size_oz} onChange={e => setEditPackForm({ ...editPackForm, size_oz: e.target.value })} placeholder='0' style={inp} />
              </div>
            )}
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Preferred Supplier</label>
              <select value={editPackForm.preferred_supplier_id} onChange={e => setEditPackForm({ ...editPackForm, preferred_supplier_id: e.target.value })} style={inp}>
                <option value=''>None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Purchase History</span>
                {!loadingItemHistory && itemPurchaseHistory.length > 0 && (() => {
                  const received = itemPurchaseHistory.filter(h => h.purchase_orders?.status === 'received' && h.quantity > 0)
                  const totalCost = received.reduce((s, h) => s + h.quantity * h.unit_price, 0)
                  const totalQty = received.reduce((s, h) => s + h.quantity, 0)
                  const avg = totalQty > 0 ? totalCost / totalQty : null
                  return avg != null ? (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Avg unit price (received): <strong>${avg.toFixed(4)}</strong></span>
                  ) : null
                })()}
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
            {editPackError && (
              <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px' }}>
                {editPackError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeletePack} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setEditPack(null); setEditPackError(''); setItemPurchaseHistory([]) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdatePack} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {undoToast && <UndoToast message={undoToast.message} onUndo={undoToast.onUndo} onDismiss={() => setUndoToast(null)} />}
    </MainLayout>
  )
}
