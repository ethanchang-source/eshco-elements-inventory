'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { FlaskConical, Plus, Search, Package } from 'lucide-react'

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
  const [tab, setTab] = useState<'raw' | 'packaging' | 'finished'>('raw')
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packaging, setPackaging] = useState<Packaging[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [rawForm, setRawForm] = useState({ item_no: '', name: '', unit: 'ml', cost_per_unit_cad: '', current_stock: '', reorder_threshold: '' })
  const [packForm, setPackForm] = useState({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '' })

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

  async function handleRawSubmit() {
    await supabase.from('raw_materials').insert([{
      item_no: rawForm.item_no,
      name: rawForm.name,
      unit: rawForm.unit,
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
      item_no: packForm.item_no,
      name: packForm.name,
      type: packForm.type,
      size_oz: parseFloat(packForm.size_oz),
      cost_cad: parseFloat(packForm.cost_cad),
      current_stock: parseInt(packForm.current_stock),
      reorder_threshold: parseInt(packForm.reorder_threshold),
    }])
    setShowModal(false)
    setPackForm({ item_no: '', name: '', type: 'bottle', size_oz: '', cost_cad: '', current_stock: '', reorder_threshold: '' })
    fetchAll()
  }

  const filteredRaw = rawMaterials.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()) || r.item_no?.toLowerCase().includes(search.toLowerCase()))
  const filteredPack = packaging.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.item_no?.toLowerCase().includes(search.toLowerCase()))
  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()))

  const tabs = [
    { key: 'raw', label: 'Raw Materials' },
    { key: 'packaging', label: 'Packaging' },
    { key: 'finished', label: 'Finished Goods' },
  ] as const

  return (
    <MainLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {tabs.map((t, i) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', background: tab === t.key ? '#2563eb' : '#fff', color: tab === t.key ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '14px', fontWeight: '500', borderRadius: i === 0 ? '8px 0 0 8px' : i === tabs.length - 1 ? '0 8px 8px 0' : '0', borderLeft: i > 0 ? 'none' : '1px solid #e2e8f0' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px' }}>
            <Search size={16} color='#94a3b8' />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '200px' }} />
          </div>
          {tab !== 'finished' && (
            <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
              <Plus size={16} /> Add Item
            </button>
          )}
        </div>
      </div>

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
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
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
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
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
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
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

      {showModal && tab !== 'finished' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add {tab === 'raw' ? 'Raw Material' : 'Packaging Item'}</h2>
            {tab === 'raw' ? (
              <>
                {[
                  { label: 'Item #', key: 'item_no', placeholder: 'EE-R001' },
                  { label: 'Name', key: 'name', placeholder: 'Black Castor Oil - Organic' },
                  { label: 'Cost per ml (CAD)', key: 'cost_per_unit_cad', placeholder: '0.0140' },
                  { label: 'Current Stock (ml)', key: 'current_stock', placeholder: '200000' },
                  { label: 'Reorder Threshold (ml)', key: 'reorder_threshold', placeholder: '10000' },
                ].map(field => (
                  <div key={field.key} style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>{field.label}</label>
                    <input value={rawForm[field.key as keyof typeof rawForm]} onChange={e => setRawForm({ ...rawForm, [field.key]: e.target.value })} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                  </div>
                ))}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Unit</label>
                  <select value={rawForm.unit} onChange={e => setRawForm({ ...rawForm, unit: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                    <option value='ml'>ml</option>
                    <option value='g'>g</option>
                    <option value='kg'>kg</option>
                    <option value='L'>L</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                {[
                  { label: 'Item #', key: 'item_no', placeholder: 'EE-P001' },
                  { label: 'Name', key: 'name', placeholder: '2oz Amber Boston Bottle' },
                  { label: 'Size (oz)', key: 'size_oz', placeholder: '2' },
                  { label: 'Cost (CAD)', key: 'cost_cad', placeholder: '0.28' },
                  { label: 'Current Stock (qty)', key: 'current_stock', placeholder: '1000' },
                  { label: 'Reorder Threshold (qty)', key: 'reorder_threshold', placeholder: '200' },
                ].map(field => (
                  <div key={field.key} style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>{field.label}</label>
                    <input value={packForm[field.key as keyof typeof packForm]} onChange={e => setPackForm({ ...packForm, [field.key]: e.target.value })} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                  </div>
                ))}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Type</label>
                  <select value={packForm.type} onChange={e => setPackForm({ ...packForm, type: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                    <option value='bottle'>Bottle</option>
                    <option value='dropper'>Dropper</option>
                    <option value='cap'>Cap</option>
                    <option value='box'>Box</option>
                    <option value='shrink_band'>Shrink Band</option>
                    <option value='label'>Label</option>
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
    </MainLayout>
  )
}
