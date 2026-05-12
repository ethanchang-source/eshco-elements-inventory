'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Package, Plus, Search, Upload, Download, TableIcon, AlertTriangle } from 'lucide-react'
import { parseCSV, downloadCSVTemplate } from '@/lib/csvImport'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/activityLog'
import UndoToast from '@/components/UndoToast'

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  barcode_upc: string
  barcode_itf14?: string
  unit_cost_cad: number
  msrp_cad: number
  price_whs_cad: number
  price_dist_cad?: number
  current_stock: number
  reorder_threshold: number
  is_active: boolean
  notes?: string
}

const emptyAddForm = { sku: '', name: '', size_oz: '', barcode_upc: '', unit_cost_cad: '', msrp_cad: '', price_whs_cad: '', reorder_threshold: '' }
const emptyEditForm = { sku: '', name: '', size_oz: '', barcode_upc: '', barcode_itf14: '', unit_cost_cad: '', msrp_cad: '', price_whs_cad: '', price_dist_cad: '', reorder_threshold: '', is_active: 'true', notes: '' }

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [addForm, setAddForm] = useState({ ...emptyAddForm })
  const [editForm, setEditForm] = useState({ ...emptyEditForm })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [snapshot, setSnapshot] = useState<Product[] | null>(null)
  const [undoRestoring, setUndoRestoring] = useState(false)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').is('deleted_at', null).order('sku')
    setProducts(data || [])
    setLoading(false)
  }

  function openEditModal(p: Product) {
    setEditProduct(p)
    setEditForm({
      sku: p.sku || '',
      name: p.name || '',
      size_oz: String(p.size_oz ?? ''),
      barcode_upc: p.barcode_upc || '',
      barcode_itf14: p.barcode_itf14 || '',
      unit_cost_cad: String(p.unit_cost_cad ?? ''),
      msrp_cad: String(p.msrp_cad ?? ''),
      price_whs_cad: String(p.price_whs_cad ?? ''),
      price_dist_cad: p.price_dist_cad != null ? String(p.price_dist_cad) : '',
      reorder_threshold: String(p.reorder_threshold ?? ''),
      is_active: String(p.is_active ?? true),
      notes: p.notes || '',
    })
  }

  async function handleUpdate() {
    if (!editProduct) return
    const old = { ...editProduct }
    const payload = {
      sku: editForm.sku.trim(),
      name: editForm.name.trim(),
      size_oz: parseFloat(editForm.size_oz) || 0,
      barcode_upc: editForm.barcode_upc.trim(),
      barcode_itf14: editForm.barcode_itf14.trim() || null,
      unit_cost_cad: parseFloat(editForm.unit_cost_cad) || 0,
      msrp_cad: parseFloat(editForm.msrp_cad) || 0,
      price_whs_cad: parseFloat(editForm.price_whs_cad) || 0,
      price_dist_cad: editForm.price_dist_cad.trim() ? parseFloat(editForm.price_dist_cad) : null,
      reorder_threshold: parseInt(editForm.reorder_threshold) || 0,
      is_active: editForm.is_active === 'true',
      notes: editForm.notes.trim() || null,
    }
    const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id)
    if (error) console.error('product update error:', error)
    await logActivity(supabase, 'products', editProduct.id, 'UPDATE', old, payload)
    setEditProduct(null)
    fetchProducts()
  }

  async function handleDeleteProduct() {
    if (!editProduct) return
    if (!confirm(`Delete "${editProduct.sku} – ${editProduct.name}"?`)) return
    const old = { ...editProduct }
    await logActivity(supabase, 'products', old.id, 'DELETE', old)
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', old.id)
    setEditProduct(null)
    fetchProducts()
    setUndoToast({
      message: `"${old.sku}" deleted.`,
      onUndo: async () => {
        await supabase.from('products').update({ deleted_at: null }).eq('id', old.id)
        await logActivity(supabase, 'products', old.id, 'UPDATE', null, old)
        setUndoToast(null)
        fetchProducts()
      },
    })
  }

  async function handleAddSubmit() {
    const { error } = await supabase.from('products').insert([{
      sku: addForm.sku,
      name: addForm.name,
      size_oz: parseFloat(addForm.size_oz),
      barcode_upc: addForm.barcode_upc,
      unit_cost_cad: parseFloat(addForm.unit_cost_cad),
      msrp_cad: parseFloat(addForm.msrp_cad),
      price_whs_cad: parseFloat(addForm.price_whs_cad),
      reorder_threshold: parseInt(addForm.reorder_threshold),
    }])
    if (error) console.error('product insert error:', error)
    setShowAddModal(false)
    setAddForm({ ...emptyAddForm })
    fetchProducts()
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
    setSnapshot([...products])
    await runImport(pendingFile)
    setPendingFile(null)
  }

  async function runImport(file: File) {
    setImporting(true)
    setImportResult('')
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      let success = 0, failed = 0, skipped = 0
      for (const row of rows) {
        const sku = String(row.sku || '').trim()
        if (!sku) { skipped++; continue }
        const update: Record<string, any> = { sku }
        const str = (v: any) => String(v ?? '').trim()
        if (str(row.name)) update.name = str(row.name)
        if (str(row.size_oz)) update.size_oz = parseFloat(str(row.size_oz))
        if (str(row.barcode_upc)) update.barcode_upc = str(row.barcode_upc)
        if (str(row.barcode_itf14)) update.barcode_itf14 = str(row.barcode_itf14)
        if (str(row.unit_cost_cad)) update.unit_cost_cad = parseFloat(str(row.unit_cost_cad))
        if (str(row.msrp_cad)) update.msrp_cad = parseFloat(str(row.msrp_cad))
        if (str(row.price_whs_cad)) update.price_whs_cad = parseFloat(str(row.price_whs_cad))
        if (str(row.price_dist_cad)) update.price_dist_cad = parseFloat(str(row.price_dist_cad))
        if (str(row.current_stock)) update.current_stock = parseInt(str(row.current_stock))
        if (str(row.reorder_threshold)) update.reorder_threshold = parseInt(str(row.reorder_threshold))
        if (str(row.is_active)) update.is_active = str(row.is_active) !== 'false'
        const { error } = await supabase.from('products').upsert([update], { onConflict: 'sku' })
        if (error) failed++; else success++
      }
      const parts = [`✅ ${success} products updated.`]
      if (skipped > 0) parts.push(`⚠️ ${skipped} rows skipped (no SKU).`)
      if (failed > 0) parts.push(`❌ ${failed} failed (Supabase error).`)
      setImportResult(parts.join(' '))
      fetchProducts()
    } catch {
      setImportResult('❌ Error reading file. Please check the format.')
    }
    setImporting(false)
  }

  async function handleUndo() {
    if (!snapshot) return
    setUndoRestoring(true)
    await supabase.from('products').upsert(snapshot, { onConflict: 'id' })
    setSnapshot(null)
    setImportResult('')
    fetchProducts()
    setUndoRestoring(false)
  }

  function handleDownloadTemplate() {
    downloadCSVTemplate(
      ['sku', 'name', 'size_oz', 'barcode_upc', 'barcode_itf14', 'unit_cost_cad', 'msrp_cad', 'price_whs_cad', 'price_dist_cad', 'current_stock', 'reorder_threshold', 'is_active'],
      'products_template.csv'
    )
  }

  function handleExport() {
    const rows = products.map(p => ({
      sku: p.sku, name: p.name, size_oz: p.size_oz,
      barcode_upc: p.barcode_upc || '', barcode_itf14: p.barcode_itf14 || '',
      unit_cost_cad: p.unit_cost_cad, msrp_cad: p.msrp_cad,
      price_whs_cad: p.price_whs_cad, price_dist_cad: p.price_dist_cad ?? '',
      current_stock: p.current_stock, reorder_threshold: p.reorder_threshold,
      is_active: p.is_active, notes: p.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Products')
    XLSX.writeFile(wb, `products_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  )

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search products...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <Download size={14} /> CSV Template
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            <Upload size={14} /> {importing ? 'Importing...' : 'Import CSV'}
            <input type='file' accept='.csv' onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            <TableIcon size={14} /> Export Excel
          </button>
          <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={14} /> Add Product
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

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['SKU', 'Name', 'Size', 'Barcode', 'MFG Cost (CAD)', 'WHS Price', 'Margin Rate', 'MSRP', 'Stock', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                  <Package size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                  No products yet. Add one or import CSV.
                </td>
              </tr>
            ) : filtered.map(p => (
              <tr key={p.id} onClick={() => openEditModal(p)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{p.sku}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{p.name}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.size_oz} oz</td>
                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{p.barcode_upc}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${formatCurrency(p.unit_cost_cad)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${formatCurrency(p.price_whs_cad)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600' }}>
                  {(() => {
                    const whs = p.price_whs_cad || 0
                    const cost = p.unit_cost_cad || 0
                    if (!whs) return <span style={{ color: '#94a3b8' }}>N/A</span>
                    const m = (whs - cost) / whs * 100
                    const color = m >= 30 ? '#16a34a' : m >= 15 ? '#d97706' : '#dc2626'
                    return <span style={{ color }}>{m.toFixed(1)}%</span>
                  })()}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${formatCurrency(p.msrp_cad)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                  <span style={{ color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a', fontWeight: '600' }}>{p.current_stock}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ background: p.is_active ? '#f0fdf4' : '#fef2f2', color: p.is_active ? '#16a34a' : '#dc2626', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (() => {
        const mfgValue = filtered.reduce((s, p) => s + (p.unit_cost_cad || 0) * (p.current_stock || 0), 0)
        const whsValue = filtered.reduce((s, p) => s + (p.price_whs_cad || 0) * (p.current_stock || 0), 0)
        const grossMargin = whsValue - mfgValue
        const marginPct = whsValue > 0 ? grossMargin / whsValue * 100 : 0
        const fmt = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '16px' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total MFG Cost Value (CAD)</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#1e293b' }}>{fmt(mfgValue)}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Current inventory at manufacturing cost</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>WHS Revenue Potential (CAD)</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#1e293b' }}>{fmt(whsValue)}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>If all inventory sold at WHS price</div>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Gross Margin Potential (CAD)</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#16a34a' }}>{fmt(grossMargin)}</div>
              <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px', opacity: 0.8 }}>{marginPct.toFixed(1)}% margin on WHS revenue</div>
            </div>
          </div>
        )
      })()}

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

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setAddForm({ ...emptyAddForm }) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add New Product</h2>
            {([
              ['SKU', 'sku', 'IAP013'], ['Product Name', 'name', 'JBCO 2oz'],
              ['Size (oz)', 'size_oz', '2'], ['Barcode UPC', 'barcode_upc', '628176712130'],
              ['MFG Cost (CAD)', 'unit_cost_cad', '0.00'], ['MSRP (CAD)', 'msrp_cad', '0.00'],
              ['WHS Price (CAD)', 'price_whs_cad', '0.00'], ['Reorder Threshold', 'reorder_threshold', '100'],
            ] as [string, string, string][]).map(([label, key, placeholder]) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={lbl}>{label}</label>
                <input value={addForm[key as keyof typeof addForm]} onChange={e => setAddForm({ ...addForm, [key]: e.target.value })} placeholder={placeholder} style={inp} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => { setShowAddModal(false); setAddForm({ ...emptyAddForm }) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleAddSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Product</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editProduct && (
        <div className="modal-overlay" onClick={() => setEditProduct(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, overflowY: 'auto' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Edit Product</h2>
            <div className="modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Product Name</label>
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inp} />
              </div>
              {([
                ['SKU', 'sku'], ['Size (oz)', 'size_oz'],
                ['Barcode UPC', 'barcode_upc'], ['Barcode ITF-14', 'barcode_itf14'],
                ['MFG Cost (CAD)', 'unit_cost_cad'], ['MSRP (CAD)', 'msrp_cad'],
                ['WHS Price (CAD)', 'price_whs_cad'], ['Dist Price (CAD)', 'price_dist_cad'],
              ] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  <input value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} style={inp} />
                </div>
              ))}
              {(() => {
                const whs = parseFloat(editForm.price_whs_cad) || 0
                const cost = parseFloat(editForm.unit_cost_cad) || 0
                const margin = whs > 0 ? (whs - cost) / whs * 100 : null
                const color = margin === null ? '#64748b' : margin >= 30 ? '#16a34a' : margin >= 15 ? '#d97706' : '#dc2626'
                return (
                  <div style={{ gridColumn: '1 / -1', background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Margin:</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color }}>{margin === null ? 'N/A' : `${margin.toFixed(1)}%`}</span>
                  </div>
                )
              })()}
              {([
                ['Reorder Threshold', 'reorder_threshold'],
              ] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  <input value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} style={inp} />
                </div>
              ))}
              <div>
                <label style={lbl}>Status</label>
                <select value={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.value })} style={inp}>
                  <option value='true'>Active</option>
                  <option value='false'>Inactive</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button onClick={handleDeleteProduct} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setEditProduct(null)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdate} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Changes</button>
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
