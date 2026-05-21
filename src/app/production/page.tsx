'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { getLocalDateString } from '@/lib/utils'
import { Factory, Plus, AlertTriangle, Trash2 } from 'lucide-react'

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  current_stock: number
}

interface ProductionOrder {
  id: string
  product_id: string
  qty_produced: number
  produced_at: string
  notes: string
  products?: { sku: string; name: string; size_oz: number }
}

export default function Production() {
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState({ product_id: '', qty_produced: '', produced_at: getLocalDateString(), notes: '' })
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [bomPreview, setBomPreview] = useState<any[]>([])
  const [deleteOrder, setDeleteOrder] = useState<ProductionOrder | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchAll() }, [selectedYear])

  async function fetchAll() {
    const [o, p] = await Promise.all([
      supabase.from('production_orders').select('*, products(sku, name, size_oz)').gte('produced_at', `${selectedYear}-01-01`).lte('produced_at', `${selectedYear}-12-31`).order('produced_at', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).order('sku'),
    ])
    setOrders(o.data || [])
    setProducts(p.data || [])
    setLoading(false)
  }

  async function fetchBomPreview(productId: string, qty: number) {
    const { data } = await supabase
      .from('bom')
      .select('*, raw_materials(item_no, name, unit, current_stock), packaging(item_no, name, current_stock)')
      .eq('product_id', productId)
    if (data && qty > 0) {
      setBomPreview(data.map(item => ({
        ...item,
        total_needed: item.qty_per_unit * qty,
        available: item.component_type === 'raw_material' ? item.raw_materials?.current_stock : item.packaging?.current_stock,
        name: item.component_type === 'raw_material' ? item.raw_materials?.name : item.packaging?.name,
        item_no: item.component_type === 'raw_material' ? item.raw_materials?.item_no : item.packaging?.item_no,
        unit: item.component_type === 'raw_material' ? item.raw_materials?.unit : 'ea',
      })))
    } else {
      setBomPreview([])
    }
  }

  async function handleProductChange(productId: string) {
    const product = products.find(p => p.id === productId) || null
    setSelectedProduct(product)
    setForm(prev => ({ ...prev, product_id: productId }))
    if (productId && form.qty_produced) {
      fetchBomPreview(productId, parseInt(form.qty_produced))
    }
  }

  async function handleQtyChange(qty: string) {
    setForm(prev => ({ ...prev, qty_produced: qty }))
    if (form.product_id && qty) {
      fetchBomPreview(form.product_id, parseInt(qty))
    }
  }

  async function handleSubmit() {
    const hasShortage = bomPreview.some(item => item.total_needed > item.available)
    if (hasShortage) {
      if (!confirm('Warning: Some materials are insufficient. Proceed anyway?')) return
    }
    await supabase.from('production_orders').insert([{
      product_id: form.product_id,
      qty_produced: parseInt(form.qty_produced),
      produced_at: form.produced_at,
      notes: form.notes,
    }])
    setShowModal(false)
    setForm({ product_id: '', qty_produced: '', produced_at: getLocalDateString(), notes: '' })
    setBomPreview([])
    setSelectedProduct(null)
    fetchAll()
  }

  async function handleDelete() {
    if (!deleteOrder) return
    setDeleting(true)
    try {
      const { data: bomItems } = await supabase
        .from('bom')
        .select('component_type, raw_material_id, packaging_id, qty_per_unit')
        .eq('product_id', deleteOrder.product_id)

      if (bomItems) {
        for (const item of bomItems) {
          const delta = item.qty_per_unit * deleteOrder.qty_produced
          if (item.component_type === 'raw_material' && item.raw_material_id) {
            const { data: rm } = await supabase.from('raw_materials').select('current_stock').eq('id', item.raw_material_id).single()
            if (rm) await supabase.from('raw_materials').update({ current_stock: rm.current_stock + delta }).eq('id', item.raw_material_id)
          } else if (item.component_type === 'packaging' && item.packaging_id) {
            const { data: pkg } = await supabase.from('packaging').select('current_stock').eq('id', item.packaging_id).single()
            if (pkg) await supabase.from('packaging').update({ current_stock: pkg.current_stock + delta }).eq('id', item.packaging_id)
          }
        }
      }

      const { data: prod } = await supabase.from('products').select('current_stock').eq('id', deleteOrder.product_id).single()
      if (prod) await supabase.from('products').update({ current_stock: prod.current_stock - deleteOrder.qty_produced }).eq('id', deleteOrder.product_id)

      await supabase.from('production_orders').delete().eq('id', deleteOrder.id)
      setDeleteOrder(null)
      fetchAll()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <MainLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#374151', outline: 'none', background: '#fff' }}
        >
          {Array.from({ length: 21 }, (_, i) => 2020 + i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={16} /> New Production
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Date', 'SKU', 'Product', 'Size', 'Qty Produced', 'Notes', ''].map((h, i) => (
                <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                <Factory size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                No production orders yet
              </td></tr>
            ) : orders.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{o.produced_at.slice(0, 10)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{o.products?.sku}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{o.products?.name}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{o.products?.size_oz} oz</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#16a34a' }}>{o.qty_produced?.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#94a3b8' }}>{o.notes}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => setDeleteOrder(o)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '8px' }}>
                <AlertTriangle size={20} color='#dc2626' />
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Delete Production Order</h2>
            </div>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
              Deleting this production order will reverse inventory changes. Continue?
            </p>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '13px', color: '#374151' }}>
              <div><strong>{deleteOrder.products?.sku}</strong> — {deleteOrder.products?.name}</div>
              <div style={{ color: '#64748b', marginTop: '4px' }}>Qty: {deleteOrder.qty_produced?.toLocaleString()} units · {deleteOrder.produced_at.slice(0, 10)}</div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteOrder(null)} disabled={deleting} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>New Production Order</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Product</label>
              <select value={form.product_id} onChange={e => handleProductChange(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                <option value=''>Select product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Qty to Produce</label>
                <input value={form.qty_produced} onChange={e => handleQtyChange(e.target.value)} placeholder='100' style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Production Date</label>
                <input type='date' value={form.produced_at} onChange={e => setForm({ ...form, produced_at: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder='Batch notes...' style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
            </div>

            {bomPreview.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>Materials Required (BOM Preview)</div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        {['Item', 'Required', 'Available', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bomPreview.map(item => {
                        const ok = item.available >= item.total_needed
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#1e293b' }}>{item.name}</td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>{item.total_needed.toLocaleString()} {item.unit}</td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>{item.available?.toLocaleString()} {item.unit}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {ok ? (
                                <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>OK</span>
                              ) : (
                                <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                                  <AlertTriangle size={10} /> Insufficient
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowModal(false); setBomPreview([]) }} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Confirm Production</button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
