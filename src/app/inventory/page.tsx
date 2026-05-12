'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { FlaskConical, Plus, Search, Package, Upload, Download, AlertTriangle } from 'lucide-react'
import { parseCSV, downloadCSVTemplate } from '@/lib/csvImport'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/activityLog'
import UndoToast from '@/components/UndoToast'

interface RawMaterial {
  id: string
  item_no: string
  name: string
  unit: string
  cost_per_unit_cad: number
  avg_cost_cad: number | null
  current_stock: number
  reorder_threshold: number
  max_capacity?: number | null
  notes?: string | null
  preferred_supplier_id?: string | null
}

interface Packaging {
  id: string
  item_no: string
  name: string
  type: string
  size_oz: number
  cost_cad: number
  avg_cost_cad: number | null
  current_stock: number
  reorder_threshold: number
  max_capacity?: number | null
  notes?: string | null
  preferred_supplier_id?: string | null
}

interface Supplier {
  id: string
  name: string
}

interface PurchaseHistoryEntry {
  id: string
  qty_ordered: number
  cost_total_cad: number
  ordered_at: string
  status: string
  suppliers: { name: string } | null
}

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  unit_cost_cad: number
  current_stock: number
  reorder_threshold: number
  max_capacity?: number | null
  is_active: boolean
  barcode_upc?: string | null
  barcode_itf14?: string | null
  whs_price_cad?: number | null
  msrp_cad?: number | null
}

function InventoryContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  function resolveTab(params: ReturnType<typeof useSearchParams>): 'raw' | 'packaging' | 'finished' {
    const t = params.get('tab')
    if (t === 'raw' || t === 'packaging' || t === 'finished') return t
    return 'finished'
  }

  const [tab, setTab] = useState<'raw' | 'packaging' | 'finished'>(() => resolveTab(searchParams))
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packaging, setPackaging] = useState<Packaging[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingTab, setPendingTab] = useState<'raw' | 'packaging' | 'finished' | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [snapshotRaw, setSnapshotRaw] = useState<RawMaterial[] | null>(null)
  const [snapshotPack, setSnapshotPack] = useState<Packaging[] | null>(null)
  const [snapshotFinished, setSnapshotFinished] = useState<Product[] | null>(null)
  const [undoRestoring, setUndoRestoring] = useState(false)
  const [rawForm, setRawForm] = useState({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', current_stock: '', reorder_threshold: '', max_capacity: '' })
  const [packForm, setPackForm] = useState({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '', max_capacity: '' })

  const [editRaw, setEditRaw] = useState<RawMaterial | null>(null)
  const [editPack, setEditPack] = useState<Packaging | null>(null)
  const [editFinished, setEditFinished] = useState<Product | null>(null)
  const [editRawForm, setEditRawForm] = useState({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', current_stock: '', reorder_threshold: '', max_capacity: '', preferred_supplier_id: '' })
  const [editPackForm, setEditPackForm] = useState({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '', max_capacity: '', preferred_supplier_id: '' })
  const [editFinishedStock, setEditFinishedStock] = useState('')
  const [editFinishedMaxCapacity, setEditFinishedMaxCapacity] = useState('')
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)
  const [inventorySuppliers, setInventorySuppliers] = useState<Supplier[]>([])
  const [itemPurchaseHistory, setItemPurchaseHistory] = useState<PurchaseHistoryEntry[]>([])
  const [loadingItemHistory, setLoadingItemHistory] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [r, p, fg, sup] = await Promise.all([
      supabase.from('raw_materials').select('*').order('item_no'),
      supabase.from('packaging').select('*').order('item_no'),
      supabase.from('products').select('*').eq('is_active', true).is('deleted_at', null).order('sku'),
      supabase.from('suppliers').select('id, name').order('name'),
    ])
    setRawMaterials(r.data || [])
    setPackaging(p.data || [])
    setProducts(fg.data || [])
    setInventorySuppliers(sup.data || [])
    setLoading(false)
  }

  async function fetchItemPurchaseHistory(itemType: 'raw_material' | 'packaging', itemId: string) {
    setLoadingItemHistory(true)
    const col = itemType === 'raw_material' ? 'raw_material_id' : 'packaging_id'
    const { data } = await supabase
      .from('purchase_orders')
      .select('id, qty_ordered, cost_total_cad, ordered_at, status, suppliers(name)')
      .eq(col, itemId)
      .order('ordered_at', { ascending: false })
      .limit(10)
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
      current_stock: String(r.current_stock ?? ''),
      reorder_threshold: String(r.reorder_threshold ?? ''),
      max_capacity: String(r.max_capacity ?? ''),
      preferred_supplier_id: r.preferred_supplier_id || '',
    })
    fetchItemPurchaseHistory('raw_material', r.id)
  }

  function openEditPack(p: Packaging) {
    setEditPack(p)
    setItemPurchaseHistory([])
    setEditPackForm({
      item_no: p.item_no || '',
      name: p.name || '',
      type: p.type || 'bottle',
      size_oz: String(p.size_oz ?? ''),
      cost_cad: String(p.cost_cad ?? ''),
      current_stock: String(p.current_stock ?? ''),
      reorder_threshold: String(p.reorder_threshold ?? ''),
      max_capacity: String(p.max_capacity ?? ''),
      preferred_supplier_id: p.preferred_supplier_id || '',
    })
    fetchItemPurchaseHistory('packaging', p.id)
  }

  function openEditFinished(p: Product) {
    setEditFinished(p)
    setEditFinishedStock(String(p.current_stock != null ? Math.round(p.current_stock / 36) : ''))
    setEditFinishedMaxCapacity(String(p.max_capacity ?? ''))
  }

  async function handleUpdateRaw() {
    if (!editRaw) return
    const { error } = await supabase.from('raw_materials').update({
      item_no: editRawForm.item_no.trim(),
      name: editRawForm.name.trim(),
      unit: editRawForm.unit,
      cost_per_unit_cad: parseFloat(editRawForm.cost_per_unit_cad) || 0,
      current_stock: parseFloat(editRawForm.current_stock) || 0,
      reorder_threshold: parseFloat(editRawForm.reorder_threshold) || 0,
      max_capacity: editRawForm.max_capacity !== '' ? parseFloat(editRawForm.max_capacity) : null,
      preferred_supplier_id: editRawForm.preferred_supplier_id || null,
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
    const { error } = await supabase.from('packaging').update({
      item_no: editPackForm.item_no.trim(),
      name: editPackForm.name.trim(),
      type: editPackForm.type,
      size_oz: parseFloat(editPackForm.size_oz) || 0,
      cost_cad: parseFloat(editPackForm.cost_cad) || 0,
      current_stock: parseInt(editPackForm.current_stock) || 0,
      reorder_threshold: parseInt(editPackForm.reorder_threshold) || 0,
      max_capacity: editPackForm.max_capacity !== '' ? parseInt(editPackForm.max_capacity) : null,
      preferred_supplier_id: editPackForm.preferred_supplier_id || null,
    }).eq('id', editPack.id)
    if (error) console.error('packaging update error:', error)
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

  async function handleUpdateFinished() {
    if (!editFinished) return
    const { error } = await supabase.from('products').update({
      current_stock: (parseInt(editFinishedStock) || 0) * 36,
      max_capacity: editFinishedMaxCapacity !== '' ? (parseInt(editFinishedMaxCapacity) || 0) * 36 : null,
    }).eq('id', editFinished.id)
    if (error) console.error('finished product update error:', error)
    setEditFinished(null)
    fetchAll()
  }

  async function handleDeleteFinished() {
    if (!editFinished) return
    if (!confirm(`Delete product "${editFinished.sku} – ${editFinished.name}"?`)) return
    const old = { ...editFinished }
    await logActivity(supabase, 'products', old.id, 'DELETE', old)
    await supabase.from('products').delete().eq('id', old.id)
    setEditFinished(null)
    fetchAll()
    setUndoToast({
      message: `"${old.sku}" deleted.`,
      onUndo: async () => {
        await supabase.from('products').upsert([old])
        await logActivity(supabase, 'products', old.id, 'UPDATE', null, old)
        setUndoToast(null)
        fetchAll()
      },
    })
  }

  async function handleRawSubmit() {
    await supabase.from('raw_materials').insert([{
      item_no: rawForm.item_no, name: rawForm.name, unit: rawForm.unit,
      cost_per_unit_cad: parseFloat(rawForm.cost_per_unit_cad),
      current_stock: parseFloat(rawForm.current_stock),
      reorder_threshold: parseFloat(rawForm.reorder_threshold),
      max_capacity: rawForm.max_capacity !== '' ? parseFloat(rawForm.max_capacity) : null,
    }])
    setShowModal(false)
    setRawForm({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', current_stock: '', reorder_threshold: '', max_capacity: '' })
    fetchAll()
  }

  async function handlePackSubmit() {
    await supabase.from('packaging').insert([{
      item_no: packForm.item_no, name: packForm.name, type: packForm.type,
      size_oz: parseFloat(packForm.size_oz), cost_cad: parseFloat(packForm.cost_cad),
      current_stock: parseInt(packForm.current_stock),
      reorder_threshold: parseInt(packForm.reorder_threshold),
      max_capacity: packForm.max_capacity !== '' ? parseInt(packForm.max_capacity) : null,
    }])
    setShowModal(false)
    setPackForm({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '', max_capacity: '' })
    fetchAll()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPendingTab(tab)
    setShowImportConfirm(true)
    e.target.value = ''
  }

  async function confirmImport() {
    setShowImportConfirm(false)
    if (!pendingFile || !pendingTab) return
    if (pendingTab === 'raw') setSnapshotRaw([...rawMaterials])
    else if (pendingTab === 'packaging') setSnapshotPack([...packaging])
    else setSnapshotFinished([...products])
    await runImport(pendingFile, pendingTab)
    setPendingFile(null)
    setPendingTab(null)
  }

  async function parseFileRows(file: File): Promise<Record<string, string>[]> {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      return data.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim(), String(v)])))
    }
    return parseCSV(await file.text())
  }

  async function runImport(file: File, importTab: 'raw' | 'packaging' | 'finished') {
    setImporting(true)
    setImportResult('')
    try {
      const rows = await parseFileRows(file)
      let success = 0, failed = 0
      for (const row of rows) {
        if (importTab === 'finished') {
          if (!row.sku) { failed++; continue }
          const existing = products.find(p => p.sku === row.sku.trim())
          const upsertData: Record<string, unknown> = { sku: row.sku.trim(), is_active: true }
          if (row.name) upsertData.name = row.name.trim()
          else if (existing) upsertData.name = existing.name
          if (row.size_oz) upsertData.size_oz = parseFloat(row.size_oz)
          else if (existing) upsertData.size_oz = existing.size_oz
          if (row.barcode_upc) upsertData.barcode_upc = row.barcode_upc.trim()
          else if (existing?.barcode_upc) upsertData.barcode_upc = existing.barcode_upc
          if (row.barcode_itf14) upsertData.barcode_itf14 = row.barcode_itf14.trim()
          else if (existing?.barcode_itf14) upsertData.barcode_itf14 = existing.barcode_itf14
          if (row.unit_cost_cad) upsertData.unit_cost_cad = parseFloat(row.unit_cost_cad)
          else if (existing) upsertData.unit_cost_cad = existing.unit_cost_cad
          if (row.price_whs_cad) upsertData.whs_price_cad = parseFloat(row.price_whs_cad)
          else if (existing?.whs_price_cad != null) upsertData.whs_price_cad = existing.whs_price_cad
          if (row.msrp_cad) upsertData.msrp_cad = parseFloat(row.msrp_cad)
          else if (existing?.msrp_cad != null) upsertData.msrp_cad = existing.msrp_cad
          if (row.current_stock) upsertData.current_stock = parseInt(row.current_stock)
          else if (existing) upsertData.current_stock = existing.current_stock
          if (row.reorder_threshold) upsertData.reorder_threshold = parseInt(row.reorder_threshold)
          else if (existing) upsertData.reorder_threshold = existing.reorder_threshold
          const { error } = await supabase.from('products').upsert([upsertData], { onConflict: 'sku' })
          if (error) failed++; else success++
        } else {
          if (!row.item_no || !row.name) { failed++; continue }
          if (importTab === 'raw') {
            const { error } = await supabase.from('raw_materials').upsert([{
              item_no: row.item_no, name: row.name, unit: row.unit || 'ml',
              cost_per_unit_cad: parseFloat(row.cost_per_unit_cad) || 0,
              current_stock: parseFloat(row.current_stock) || 0,
              reorder_threshold: parseFloat(row.reorder_threshold) || 0,
            }], { onConflict: 'item_no' })
            if (error) failed++; else success++
          } else {
            const { error } = await supabase.from('packaging').upsert([{
              item_no: row.item_no, name: row.name, type: row.type || 'bottle',
              size_oz: parseFloat(row.size_oz) || 0,
              cost_cad: parseFloat(row.cost_cad) || 0,
              current_stock: parseInt(row.current_stock) || 0,
              reorder_threshold: parseInt(row.reorder_threshold) || 0,
            }], { onConflict: 'item_no' })
            if (error) failed++; else success++
          }
        }
      }
      setImportResult(`✅ ${success} items imported. ${failed > 0 ? `❌ ${failed} failed.` : ''}`)
      fetchAll()
    } catch {
      setImportResult('❌ Error reading file.')
    }
    setImporting(false)
  }

  async function handleUndo() {
    setUndoRestoring(true)
    if (tab === 'raw' && snapshotRaw) {
      await supabase.from('raw_materials').upsert(snapshotRaw, { onConflict: 'id' })
      setSnapshotRaw(null)
    } else if (tab === 'packaging' && snapshotPack) {
      await supabase.from('packaging').upsert(snapshotPack, { onConflict: 'id' })
      setSnapshotPack(null)
    } else if (tab === 'finished' && snapshotFinished) {
      await supabase.from('products').upsert(snapshotFinished, { onConflict: 'id' })
      setSnapshotFinished(null)
    }
    setImportResult('')
    fetchAll()
    setUndoRestoring(false)
  }

  function handleDownloadTemplate() {
    if (tab === 'raw') {
      downloadCSVTemplate(['item_no', 'name', 'unit', 'cost_per_unit_cad', 'current_stock', 'reorder_threshold'], 'raw_materials_template.csv')
    } else if (tab === 'packaging') {
      downloadCSVTemplate(['item_no', 'name', 'type', 'size_oz', 'cost_cad', 'current_stock', 'reorder_threshold'], 'packaging_template.csv')
    } else if (tab === 'finished') {
      const ws = XLSX.utils.aoa_to_sheet([['sku', 'name', 'size_oz', 'barcode_upc', 'barcode_itf14', 'unit_cost_cad', 'price_whs_cad', 'msrp_cad', 'current_stock', 'reorder_threshold']])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Finished Goods')
      XLSX.writeFile(wb, 'finished_goods_template.xlsx')
    }
  }

  function handleExportFinished() {
    const rows = products.map(p => ({
      'SKU': p.sku,
      'Name': p.name,
      'Size (oz)': p.size_oz,
      'Barcode UPC': p.barcode_upc ?? '',
      'Barcode ITF14': p.barcode_itf14 ?? '',
      'Unit Cost CAD': p.unit_cost_cad,
      'WHS Price CAD': p.whs_price_cad ?? '',
      'MSRP CAD': p.msrp_cad ?? '',
      'Current Stock': p.current_stock,
      'Reorder Threshold': p.reorder_threshold,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Finished Goods')
    XLSX.writeFile(wb, 'finished_goods_export.xlsx')
  }

  function handleExportRaw() {
    const rows = rawMaterials.map(r => ({
      'Item No': r.item_no,
      'Name': r.name,
      'Unit': r.unit,
      'Cost per Unit CAD': r.cost_per_unit_cad,
      'Avg Cost CAD': r.avg_cost_cad ?? '',
      'Current Stock': r.current_stock,
      'Reorder Threshold': r.reorder_threshold,
      'Notes': r.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Raw Materials')
    XLSX.writeFile(wb, 'raw_materials_export.xlsx')
  }

  function handleExportPack() {
    const rows = packaging.map(p => ({
      'Item No': p.item_no,
      'Name': p.name,
      'Type': p.type,
      'Size (oz)': p.size_oz,
      'Cost CAD': p.cost_cad,
      'Avg Cost CAD': p.avg_cost_cad ?? '',
      'Current Stock': p.current_stock,
      'Reorder Threshold': p.reorder_threshold,
      'Notes': p.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Packaging')
    XLSX.writeFile(wb, 'packaging_export.xlsx')
  }

  const filteredRaw = rawMaterials.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()) || r.item_no?.toLowerCase().includes(search.toLowerCase()))
  const filteredPack = packaging.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.item_no?.toLowerCase().includes(search.toLowerCase()))
  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()))

  const tabs = [
    { key: 'finished', label: 'Finished Goods' },
    { key: 'raw', label: 'Raw Materials' },
    { key: 'packaging', label: 'Packaging' },
  ] as const

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
          {tabs.map((t, i) => (
            <button key={t.key} onClick={() => { setTab(t.key); router.replace(`?tab=${t.key}`, { scroll: false }); setImportResult('') }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', background: tab === t.key ? '#2563eb' : '#fff', color: tab === t.key ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '14px', fontWeight: '500', borderRadius: i === 0 ? '8px 0 0 8px' : i === tabs.length - 1 ? '0 8px 8px 0' : '0', borderLeft: i > 0 ? 'none' : '1px solid #e2e8f0' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px' }}>
            <Search size={16} color='#94a3b8' />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '160px' }} />
          </div>
          <button
            onClick={tab === 'finished' ? handleExportFinished : tab === 'raw' ? handleExportRaw : handleExportPack}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}
          >
            <Download size={14} /> Export Excel
          </button>
          <button onClick={handleDownloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> Template
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            <Upload size={14} /> {importing ? 'Importing...' : 'Import'}
            <input type='file' accept='.csv,.xlsx,.xls' onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
          {tab !== 'finished' && (
            <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
              <Plus size={14} /> Add
            </button>
          )}
        </div>
      </div>

      {((tab === 'raw' && snapshotRaw) || (tab === 'packaging' && snapshotPack) || (tab === 'finished' && snapshotFinished)) && (
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

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {tab === 'raw' && ['Item #', 'Name', 'Unit', 'Cost (CAD)', 'Cost (Avg)', 'Current Stock', 'Reorder At', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
              {tab === 'packaging' && ['Item #', 'Name', 'Type', 'Unit', 'Cost (CAD)', 'Cost (Avg)', 'Current Stock', 'Reorder At', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
              {tab === 'finished' && ['SKU', 'Name', 'Size', 'MFG Cost (CAD)', 'Current Stock', 'Reorder At', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : tab === 'raw' ? (
              filteredRaw.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                  <FlaskConical size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                  No raw materials yet
                </td></tr>
              ) : filteredRaw.map(r => {
                const rawPct = r.max_capacity ? Math.min(100, (r.current_stock / r.max_capacity) * 100) : null
                const rawBarColor = rawPct === null ? '#94a3b8' : rawPct >= 80 ? '#16a34a' : rawPct >= 50 ? '#f59e0b' : '#dc2626'
                return (
                <tr key={r.id} onClick={() => openEditRaw(r)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{r.item_no}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.unit}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${r.cost_per_unit_cad?.toFixed(4)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.avg_cost_cad != null ? `$${r.avg_cost_cad.toFixed(4)}` : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: r.current_stock <= r.reorder_threshold ? '#dc2626' : '#16a34a' }}>
                    <div>{r.current_stock?.toLocaleString()} {r.unit}{r.max_capacity != null ? ` / ${r.max_capacity.toLocaleString()}` : ''}</div>
                    {rawPct !== null && (
                      <div style={{ marginTop: '4px', height: '4px', background: '#e2e8f0', borderRadius: '2px', width: '80px' }}>
                        <div style={{ height: '100%', width: `${rawPct}%`, background: rawBarColor, borderRadius: '2px', transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.reorder_threshold?.toLocaleString()} {r.unit}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: r.current_stock <= r.reorder_threshold ? '#fef2f2' : '#f0fdf4', color: r.current_stock <= r.reorder_threshold ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }}>
                      {r.current_stock <= r.reorder_threshold ? 'Low Stock' : 'OK'}
                    </span>
                  </td>
                </tr>
                )
              })
            ) : tab === 'packaging' ? (
              filteredPack.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                  <Package size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                  No packaging items yet
                </td></tr>
              ) : filteredPack.map(p => {
                const packPct = p.max_capacity ? Math.min(100, (p.current_stock / p.max_capacity) * 100) : null
                const packBarColor = packPct === null ? '#94a3b8' : packPct >= 80 ? '#16a34a' : packPct >= 50 ? '#f59e0b' : '#dc2626'
                return (
                <tr key={p.id} onClick={() => openEditPack(p)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{p.item_no}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.type}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.size_oz} oz</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${p.cost_cad?.toFixed(4)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.avg_cost_cad != null ? `$${p.avg_cost_cad.toFixed(4)}` : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a' }}>
                    <div>{p.current_stock?.toLocaleString()}{p.max_capacity != null ? ` / ${p.max_capacity.toLocaleString()}` : ''}</div>
                    {packPct !== null && (
                      <div style={{ marginTop: '4px', height: '4px', background: '#e2e8f0', borderRadius: '2px', width: '80px' }}>
                        <div style={{ height: '100%', width: `${packPct}%`, background: packBarColor, borderRadius: '2px', transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.reorder_threshold?.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: p.current_stock <= p.reorder_threshold ? '#fef2f2' : '#f0fdf4', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }}>
                      {p.current_stock <= p.reorder_threshold ? 'Low Stock' : 'OK'}
                    </span>
                  </td>
                </tr>
                )
              })
            ) : (
              filteredProducts.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                  <Package size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                  No finished goods yet
                </td></tr>
              ) : filteredProducts.map(p => {
                const fgPct = p.max_capacity ? Math.min(100, (p.current_stock / p.max_capacity) * 100) : null
                const fgBarColor = fgPct === null ? '#94a3b8' : fgPct >= 80 ? '#16a34a' : fgPct >= 50 ? '#f59e0b' : '#dc2626'
                return (
                <tr key={p.id} onClick={() => openEditFinished(p)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{p.sku}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.size_oz} oz</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${formatCurrency(p.unit_cost_cad)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a' }}>
                    <div>
                      {p.current_stock?.toLocaleString()} units ({Math.round((p.current_stock || 0) / 36)} boxes)
                      {p.max_capacity != null && ` / ${p.max_capacity.toLocaleString()} units (${Math.round(p.max_capacity / 36)} boxes)`}
                    </div>
                    {fgPct !== null && (
                      <div style={{ marginTop: '4px', height: '4px', background: '#e2e8f0', borderRadius: '2px', width: '120px' }}>
                        <div style={{ height: '100%', width: `${fgPct}%`, background: fgBarColor, borderRadius: '2px', transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.reorder_threshold?.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: p.current_stock <= p.reorder_threshold ? '#fef2f2' : '#f0fdf4', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }}>
                      {p.current_stock <= p.reorder_threshold ? 'Low Stock' : 'OK'}
                    </span>
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            {tab === 'raw' && !loading && filteredRaw.length > 0 && (() => {
              const listVal = filteredRaw.reduce((s, r) => s + (r.cost_per_unit_cad || 0) * (r.current_stock || 0), 0)
              const avgVal = filteredRaw.filter(r => r.avg_cost_cad != null).reduce((s, r) => s + r.avg_cost_cad! * (r.current_stock || 0), 0)
              const fmt = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              return (
                <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                  <td colSpan={8} style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>Total Inventory Value: <strong>{fmt(listVal)}</strong></span>
                      <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>Total Avg Cost Value: <strong>{fmt(avgVal)}</strong></span>
                    </div>
                  </td>
                </tr>
              )
            })()}
            {tab === 'packaging' && !loading && filteredPack.length > 0 && (() => {
              const listVal = filteredPack.reduce((s, p) => s + (p.cost_cad || 0) * (p.current_stock || 0), 0)
              const avgVal = filteredPack.filter(p => p.avg_cost_cad != null).reduce((s, p) => s + p.avg_cost_cad! * (p.current_stock || 0), 0)
              const fmt = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              return (
                <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                  <td colSpan={9} style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>Total Inventory Value: <strong>{fmt(listVal)}</strong></span>
                      <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>Total Avg Cost Value: <strong>{fmt(avgVal)}</strong></span>
                    </div>
                  </td>
                </tr>
              )
            })()}
            {tab === 'finished' && !loading && filteredProducts.length > 0 && (() => {
              const mfgVal = filteredProducts.reduce((s, p) => s + (p.unit_cost_cad || 0) * (p.current_stock || 0), 0)
              const whsVal = filteredProducts.reduce((s, p) => s + (p.whs_price_cad || 0) * (p.current_stock || 0), 0)
              const fmt = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              return (
                <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                  <td colSpan={7} style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>Total MFG Cost Value: <strong>{fmt(mfgVal)}</strong></span>
                      <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>Total WHS Revenue Potential: <strong>{fmt(whsVal)}</strong></span>
                    </div>
                  </td>
                </tr>
              )
            })()}
          </tfoot>
        </table>
      </div>

      {showImportConfirm && (
        <div className="modal-overlay" onClick={() => { setShowImportConfirm(false); setPendingFile(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '440px', margin: '20px auto' }}>
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

      {/* Add Modal (Raw / Packaging) */}
      {showModal && tab !== 'finished' && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add {tab === 'raw' ? 'Raw Material' : 'Packaging Item'}</h2>
            {tab === 'raw' ? (
              <>
                {([['Item #', 'item_no', 'EE-R001'], ['Name', 'name', 'Black Castor Oil - Organic'], ['Cost per unit (CAD)', 'cost_per_unit_cad', '0.0140'], ['Current Stock', 'current_stock', '200000'], ['Reorder Threshold', 'reorder_threshold', '10000'], ['Max Capacity', 'max_capacity', '500000']] as [string, string, string][]).map(([label, key, placeholder]) => (
                  <div key={key} style={{ marginBottom: '16px' }}>
                    <label style={lbl}>{label}</label>
                    <input value={rawForm[key as keyof typeof rawForm]} onChange={e => setRawForm({ ...rawForm, [key]: e.target.value })} placeholder={placeholder} style={inp} />
                  </div>
                ))}
                <div style={{ marginBottom: '16px' }}>
                  <label style={lbl}>Unit</label>
                  <select value={rawForm.unit} onChange={e => setRawForm({ ...rawForm, unit: e.target.value })} style={inp}>
                    <option value='ml'>ml</option><option value='g'>g</option><option value='kg'>kg</option><option value='L'>L</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                {([['Item #', 'item_no', 'EE-P001'], ['Name', 'name', '2oz Amber Boston Bottle'], ['Size (oz)', 'size_oz', '2'], ['Cost (CAD)', 'cost_cad', '0.28'], ['Current Stock (qty)', 'current_stock', '1000'], ['Reorder Threshold (qty)', 'reorder_threshold', '200'], ['Max Capacity (qty)', 'max_capacity', '5000']] as [string, string, string][]).map(([label, key, placeholder]) => (
                  <div key={key} style={{ marginBottom: '16px' }}>
                    <label style={lbl}>{label}</label>
                    <input value={packForm[key as keyof typeof packForm]} onChange={e => setPackForm({ ...packForm, [key]: e.target.value })} placeholder={placeholder} style={inp} />
                  </div>
                ))}
                <div style={{ marginBottom: '16px' }}>
                  <label style={lbl}>Type</label>
                  <select value={packForm.type} onChange={e => setPackForm({ ...packForm, type: e.target.value })} style={inp}>
                    <option value='bottle'>Bottle</option><option value='dropper'>Dropper</option><option value='cap'>Cap</option>
                    <option value='box'>Box</option><option value='shrink_band'>Shrink Band</option><option value='label'>Label</option>
                  </select>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={tab === 'raw' ? handleRawSubmit : handlePackSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Raw Material Modal */}
      {editRaw && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditRaw(null); setItemPurchaseHistory([]) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Edit Raw Material</h2>
            {([['Item #', 'item_no'], ['Name', 'name'], ['Cost (CAD)', 'cost_per_unit_cad'], ['Current Stock', 'current_stock'], ['Reorder Threshold', 'reorder_threshold'], ['Max Capacity', 'max_capacity']] as [string, string][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={lbl}>{label}</label>
                <input value={editRawForm[key as keyof typeof editRawForm]} onChange={e => setEditRawForm({ ...editRawForm, [key]: e.target.value })} style={inp} />
              </div>
            ))}
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
                {inventorySuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Purchase History</span>
                {!loadingItemHistory && itemPurchaseHistory.length > 0 && (() => {
                  const received = itemPurchaseHistory.filter(h => h.status === 'received' && h.qty_ordered > 0)
                  const totalCost = received.reduce((s, h) => s + h.cost_total_cad, 0)
                  const totalQty = received.reduce((s, h) => s + h.qty_ordered, 0)
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
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Supplier', 'Date', 'Qty', 'Unit Cost', 'Status'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', fontSize: '11px', fontWeight: '600', color: '#64748b', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itemPurchaseHistory.map((h, i) => {
                        const unitCost = h.qty_ordered > 0 ? h.cost_total_cad / h.qty_ordered : 0
                        return (
                          <tr key={h.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : undefined, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#374151' }}>{h.suppliers?.name || '—'}</td>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{h.ordered_at ? new Date(h.ordered_at).toLocaleDateString('en-CA') : '—'}</td>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#1e293b', fontWeight: '500' }}>{h.qty_ordered?.toLocaleString()}</td>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#1e293b' }}>${unitCost.toFixed(4)}</td>
                            <td style={{ padding: '7px 10px' }}>
                              <span style={{ background: h.status === 'received' ? '#f0fdf4' : h.status === 'ordered' ? '#eff6ff' : '#f8fafc', color: h.status === 'received' ? '#16a34a' : h.status === 'ordered' ? '#2563eb' : '#64748b', padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: '500' }}>{h.status}</span>
                            </td>
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
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditPack(null); setItemPurchaseHistory([]) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Edit Packaging</h2>
            {([['Item #', 'item_no'], ['Name', 'name'], ['Size (oz)', 'size_oz'], ['Cost (CAD)', 'cost_cad'], ['Current Stock', 'current_stock'], ['Reorder Threshold', 'reorder_threshold'], ['Max Capacity', 'max_capacity']] as [string, string][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={lbl}>{label}</label>
                <input value={editPackForm[key as keyof typeof editPackForm]} onChange={e => setEditPackForm({ ...editPackForm, [key]: e.target.value })} style={inp} />
              </div>
            ))}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Cost (Avg) <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(auto-calculated from purchases)</span></label>
              <input readOnly value={editPack?.avg_cost_cad != null ? editPack.avg_cost_cad.toFixed(4) : ''} placeholder='—' style={{ ...inp, background: '#f8fafc', color: '#64748b', cursor: 'default' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Type</label>
              <select value={editPackForm.type} onChange={e => setEditPackForm({ ...editPackForm, type: e.target.value })} style={inp}>
                <option value='bottle'>Bottle</option><option value='dropper'>Dropper</option><option value='cap'>Cap</option>
                <option value='box'>Box</option><option value='shrink_band'>Shrink Band</option><option value='label'>Label</option>
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Preferred Supplier</label>
              <select value={editPackForm.preferred_supplier_id} onChange={e => setEditPackForm({ ...editPackForm, preferred_supplier_id: e.target.value })} style={inp}>
                <option value=''>None</option>
                {inventorySuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Purchase History</span>
                {!loadingItemHistory && itemPurchaseHistory.length > 0 && (() => {
                  const received = itemPurchaseHistory.filter(h => h.status === 'received' && h.qty_ordered > 0)
                  const totalCost = received.reduce((s, h) => s + h.cost_total_cad, 0)
                  const totalQty = received.reduce((s, h) => s + h.qty_ordered, 0)
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
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Supplier', 'Date', 'Qty', 'Unit Cost', 'Status'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', fontSize: '11px', fontWeight: '600', color: '#64748b', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itemPurchaseHistory.map((h, i) => {
                        const unitCost = h.qty_ordered > 0 ? h.cost_total_cad / h.qty_ordered : 0
                        return (
                          <tr key={h.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : undefined, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#374151' }}>{h.suppliers?.name || '—'}</td>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{h.ordered_at ? new Date(h.ordered_at).toLocaleDateString('en-CA') : '—'}</td>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#1e293b', fontWeight: '500' }}>{h.qty_ordered?.toLocaleString()}</td>
                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#1e293b' }}>${unitCost.toFixed(4)}</td>
                            <td style={{ padding: '7px 10px' }}>
                              <span style={{ background: h.status === 'received' ? '#f0fdf4' : h.status === 'ordered' ? '#eff6ff' : '#f8fafc', color: h.status === 'received' ? '#16a34a' : h.status === 'ordered' ? '#2563eb' : '#64748b', padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: '500' }}>{h.status}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeletePack} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setEditPack(null); setItemPurchaseHistory([]) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdatePack} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Finished Goods Modal */}
      {editFinished && (
        <div className="modal-overlay" onClick={() => setEditFinished(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Edit Stock</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>{editFinished.sku} – {editFinished.name}</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Boxes (1 box = 36 units)</label>
              <input type='number' value={editFinishedStock} onChange={e => setEditFinishedStock(e.target.value)} style={inp} placeholder='0' />
              {editFinishedStock !== '' && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#2563eb', fontWeight: '500' }}>
                  {parseInt(editFinishedStock) || 0} boxes = {(parseInt(editFinishedStock) || 0) * 36} units
                </div>
              )}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Max Capacity (boxes)</label>
              <input type='number' value={editFinishedMaxCapacity} onChange={e => setEditFinishedMaxCapacity(e.target.value)} style={inp} placeholder='0' />
              {editFinishedMaxCapacity !== '' && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  {parseInt(editFinishedMaxCapacity) || 0} boxes = {(parseInt(editFinishedMaxCapacity) || 0) * 36} units
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeleteFinished} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setEditFinished(null)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdateFinished} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {undoToast && <UndoToast message={undoToast.message} onUndo={undoToast.onUndo} onDismiss={() => setUndoToast(null)} />}
    </MainLayout>
  )
}

export default function Inventory() {
  return (
    <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>}>
      <InventoryContent />
    </Suspense>
  )
}
