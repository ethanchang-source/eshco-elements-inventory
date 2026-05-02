'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { FlaskConical, Plus, Search, Package, Upload, Download } from 'lucide-react'
import { parseCSV, downloadCSVTemplate } from '@/lib/csvImport'

interface RawMaterial {
  id: string
  item_no: string
  name: string
  unit: string
  cost_per_unit_cad: number
  current_stock: number
  reorder_threshold: number
}

interface Packaging {
  id: string
  item_no: string
  name: string
  type: string
  size_oz: number
  cost_cad: number
  current_stock: number
  reorder_threshold: number
}

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  unit_cost_cad: number
  current_stock: number
  reorder_threshold: number
  is_active: boolean
}

export default function Inventory() {
  const [tab, setTab] = useState<'raw' | 'packaging' | 'finished'>('finished')
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packaging, setPackaging] = useState<Packaging[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [rawForm, setRawForm] = useState({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', current_stock: '', reorder_threshold: '' })
  const [packForm, setPackForm] = useState({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '' })

  const [editRaw, setEditRaw] = useState<RawMaterial | null>(null)
  const [editPack, setEditPack] = useState<Packaging | null>(null)
  const [editFinished, setEditFinished] = useState<Product | null>(null)
  const [editRawForm, setEditRawForm] = useState({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', current_stock: '', reorder_threshold: '' })
  const [editPackForm, setEditPackForm] = useState({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '' })
  const [editFinishedStock, setEditFinishedStock] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [r, p, fg] = await Promise.all([
      supabase.from('raw_materials').select('*').order('item_no'),
      supabase.from('packaging').select('*').order('item_no'),
      supabase.from('products').select('*').eq('is_active', true).order('sku'),
    ])
    setRawMaterials(r.data || [])
    setPackaging(p.data || [])
    setProducts(fg.data || [])
    setLoading(false)
  }

  function openEditRaw(r: RawMaterial) {
    setEditRaw(r)
    setEditRawForm({
      item_no: r.item_no || '',
      name: r.name || '',
      unit: r.unit || 'ml',
      cost_per_unit_cad: String(r.cost_per_unit_cad ?? ''),
      current_stock: String(r.current_stock ?? ''),
      reorder_threshold: String(r.reorder_threshold ?? ''),
    })
  }

  function openEditPack(p: Packaging) {
    setEditPack(p)
    setEditPackForm({
      item_no: p.item_no || '',
      name: p.name || '',
      type: p.type || 'bottle',
      size_oz: String(p.size_oz ?? ''),
      cost_cad: String(p.cost_cad ?? ''),
      current_stock: String(p.current_stock ?? ''),
      reorder_threshold: String(p.reorder_threshold ?? ''),
    })
  }

  function openEditFinished(p: Product) {
    setEditFinished(p)
    setEditFinishedStock(String(p.current_stock ?? ''))
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
    }).eq('id', editRaw.id)
    if (error) console.error('raw_material update error:', error)
    setEditRaw(null)
    fetchAll()
  }

  async function handleDeleteRaw() {
    if (!editRaw) return
    if (!confirm(`Delete "${editRaw.name}"?`)) return
    const { error } = await supabase.from('raw_materials').delete().eq('id', editRaw.id)
    if (error) console.error('raw_material delete error:', error)
    setEditRaw(null)
    fetchAll()
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
    }).eq('id', editPack.id)
    if (error) console.error('packaging update error:', error)
    setEditPack(null)
    fetchAll()
  }

  async function handleDeletePack() {
    if (!editPack) return
    if (!confirm(`Delete "${editPack.name}"?`)) return
    const { error } = await supabase.from('packaging').delete().eq('id', editPack.id)
    if (error) console.error('packaging delete error:', error)
    setEditPack(null)
    fetchAll()
  }

  async function handleUpdateFinished() {
    if (!editFinished) return
    const { error } = await supabase.from('products').update({ current_stock: parseInt(editFinishedStock) || 0 }).eq('id', editFinished.id)
    if (error) console.error('finished product update error:', error)
    setEditFinished(null)
    fetchAll()
  }

  async function handleDeleteFinished() {
    if (!editFinished) return
    if (!confirm(`Delete product "${editFinished.sku} – ${editFinished.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('products').delete().eq('id', editFinished.id)
    if (error) console.error('product delete error:', error)
    setEditFinished(null)
    fetchAll()
  }

  async function handleRawSubmit() {
    await supabase.from('raw_materials').insert([{
      item_no: rawForm.item_no, name: rawForm.name, unit: rawForm.unit,
      cost_per_unit_cad: parseFloat(rawForm.cost_per_unit_cad),
      current_stock: parseFloat(rawForm.current_stock),
      reorder_threshold: parseFloat(rawForm.reorder_threshold),
    }])
    setShowModal(false)
    setRawForm({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', current_stock: '', reorder_threshold: '' })
    fetchAll()
  }

  async function handlePackSubmit() {
    await supabase.from('packaging').insert([{
      item_no: packForm.item_no, name: packForm.name, type: packForm.type,
      size_oz: parseFloat(packForm.size_oz), cost_cad: parseFloat(packForm.cost_cad),
      current_stock: parseInt(packForm.current_stock),
      reorder_threshold: parseInt(packForm.reorder_threshold),
    }])
    setShowModal(false)
    setPackForm({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '' })
    fetchAll()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult('')
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      let success = 0, failed = 0
      for (const row of rows) {
        if (!row.item_no || !row.name) { failed++; continue }
        if (tab === 'raw') {
          const { error } = await supabase.from('raw_materials').upsert([{
            item_no: row.item_no, name: row.name, unit: row.unit || 'ml',
            cost_per_unit_cad: parseFloat(row.cost_per_unit_cad) || 0,
            current_stock: parseFloat(row.current_stock) || 0,
            reorder_threshold: parseFloat(row.reorder_threshold) || 0,
          }], { onConflict: 'item_no' })
          if (error) failed++; else success++
        } else if (tab === 'packaging') {
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
      setImportResult(`✅ ${success} items imported. ${failed > 0 ? `❌ ${failed} failed.` : ''}`)
      fetchAll()
    } catch {
      setImportResult('❌ Error reading file.')
    }
    setImporting(false)
    e.target.value = ''
  }

  function handleDownloadTemplate() {
    if (tab === 'raw') {
      downloadCSVTemplate(['item_no', 'name', 'unit', 'cost_per_unit_cad', 'current_stock', 'reorder_threshold'], 'raw_materials_template.csv')
    } else if (tab === 'packaging') {
      downloadCSVTemplate(['item_no', 'name', 'type', 'size_oz', 'cost_cad', 'current_stock', 'reorder_threshold'], 'packaging_template.csv')
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {tabs.map((t, i) => (
            <button key={t.key} onClick={() => { setTab(t.key); setImportResult('') }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', background: tab === t.key ? '#2563eb' : '#fff', color: tab === t.key ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '14px', fontWeight: '500', borderRadius: i === 0 ? '8px 0 0 8px' : i === tabs.length - 1 ? '0 8px 8px 0' : '0', borderLeft: i > 0 ? 'none' : '1px solid #e2e8f0' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px' }}>
            <Search size={16} color='#94a3b8' />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '160px' }} />
          </div>
          {tab !== 'finished' && (
            <>
              <button onClick={handleDownloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
                <Download size={14} /> Template
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
                <Upload size={14} /> {importing ? 'Importing...' : 'Import CSV'}
                <input type='file' accept='.csv' onChange={handleImport} style={{ display: 'none' }} />
              </label>
              <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                <Plus size={14} /> Add
              </button>
            </>
          )}
        </div>
      </div>

      {importResult && (
        <div style={{ background: importResult.includes('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${importResult.includes('✅') ? '#bbf7d0' : '#fecaca'}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: importResult.includes('✅') ? '#16a34a' : '#dc2626' }}>
          {importResult}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {tab === 'raw' && ['Item #', 'Name', 'Unit', 'Cost/Unit (CAD)', 'Current Stock', 'Reorder At', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
              {tab === 'packaging' && ['Item #', 'Name', 'Type', 'Size', 'Cost (CAD)', 'Current Stock', 'Reorder At', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
              {tab === 'finished' && ['SKU', 'Name', 'Size', 'Unit Cost (CAD)', 'Current Stock', 'Reorder At', 'Status'].map(h => (
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
              ) : filteredRaw.map(r => (
                <tr key={r.id} onClick={() => openEditRaw(r)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{r.item_no}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.unit}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${r.cost_per_unit_cad?.toFixed(4)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: r.current_stock <= r.reorder_threshold ? '#dc2626' : '#16a34a' }}>{r.current_stock?.toLocaleString()} {r.unit}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{r.reorder_threshold?.toLocaleString()} {r.unit}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: r.current_stock <= r.reorder_threshold ? '#fef2f2' : '#f0fdf4', color: r.current_stock <= r.reorder_threshold ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }}>
                      {r.current_stock <= r.reorder_threshold ? 'Low Stock' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))
            ) : tab === 'packaging' ? (
              filteredPack.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                  <Package size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                  No packaging items yet
                </td></tr>
              ) : filteredPack.map(p => (
                <tr key={p.id} onClick={() => openEditPack(p)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{p.item_no}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.type}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.size_oz} oz</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${p.cost_cad?.toFixed(4)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a' }}>{p.current_stock?.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.reorder_threshold?.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: p.current_stock <= p.reorder_threshold ? '#fef2f2' : '#f0fdf4', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }}>
                      {p.current_stock <= p.reorder_threshold ? 'Low Stock' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              filteredProducts.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                  <Package size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                  No finished goods yet
                </td></tr>
              ) : filteredProducts.map(p => (
                <tr key={p.id} onClick={() => openEditFinished(p)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} {...rowHover}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{p.sku}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.size_oz} oz</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${p.unit_cost_cad?.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a' }}>{p.current_stock?.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.reorder_threshold?.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: p.current_stock <= p.reorder_threshold ? '#fef2f2' : '#f0fdf4', color: p.current_stock <= p.reorder_threshold ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }}>
                      {p.current_stock <= p.reorder_threshold ? 'Low Stock' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal (Raw / Packaging) */}
      {showModal && tab !== 'finished' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add {tab === 'raw' ? 'Raw Material' : 'Packaging Item'}</h2>
            {tab === 'raw' ? (
              <>
                {([['Item #', 'item_no', 'EE-R001'], ['Name', 'name', 'Black Castor Oil - Organic'], ['Cost per unit (CAD)', 'cost_per_unit_cad', '0.0140'], ['Current Stock', 'current_stock', '200000'], ['Reorder Threshold', 'reorder_threshold', '10000']] as [string, string, string][]).map(([label, key, placeholder]) => (
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
                {([['Item #', 'item_no', 'EE-P001'], ['Name', 'name', '2oz Amber Boston Bottle'], ['Size (oz)', 'size_oz', '2'], ['Cost (CAD)', 'cost_cad', '0.28'], ['Current Stock (qty)', 'current_stock', '1000'], ['Reorder Threshold (qty)', 'reorder_threshold', '200']] as [string, string, string][]).map(([label, key, placeholder]) => (
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Edit Raw Material</h2>
            {([['Item #', 'item_no'], ['Name', 'name'], ['Cost per unit (CAD)', 'cost_per_unit_cad'], ['Current Stock', 'current_stock'], ['Reorder Threshold', 'reorder_threshold']] as [string, string][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={lbl}>{label}</label>
                <input value={editRawForm[key as keyof typeof editRawForm]} onChange={e => setEditRawForm({ ...editRawForm, [key]: e.target.value })} style={inp} />
              </div>
            ))}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Unit</label>
              <select value={editRawForm.unit} onChange={e => setEditRawForm({ ...editRawForm, unit: e.target.value })} style={inp}>
                <option value='ml'>ml</option><option value='g'>g</option><option value='kg'>kg</option><option value='L'>L</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeleteRaw} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setEditRaw(null)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdateRaw} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Packaging Modal */}
      {editPack && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Edit Packaging</h2>
            {([['Item #', 'item_no'], ['Name', 'name'], ['Size (oz)', 'size_oz'], ['Cost (CAD)', 'cost_cad'], ['Current Stock', 'current_stock'], ['Reorder Threshold', 'reorder_threshold']] as [string, string][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={lbl}>{label}</label>
                <input value={editPackForm[key as keyof typeof editPackForm]} onChange={e => setEditPackForm({ ...editPackForm, [key]: e.target.value })} style={inp} />
              </div>
            ))}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Type</label>
              <select value={editPackForm.type} onChange={e => setEditPackForm({ ...editPackForm, type: e.target.value })} style={inp}>
                <option value='bottle'>Bottle</option><option value='dropper'>Dropper</option><option value='cap'>Cap</option>
                <option value='box'>Box</option><option value='shrink_band'>Shrink Band</option><option value='label'>Label</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={handleDeletePack} style={{ padding: '8px 20px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Delete</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setEditPack(null)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={handleUpdatePack} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Finished Goods Modal */}
      {editFinished && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Edit Stock</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>{editFinished.sku} – {editFinished.name}</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Current Stock</label>
              <input type='number' value={editFinishedStock} onChange={e => setEditFinishedStock(e.target.value)} style={inp} />
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
    </MainLayout>
  )
}
