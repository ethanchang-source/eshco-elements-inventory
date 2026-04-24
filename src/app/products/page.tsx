'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Package, Plus, Search } from 'lucide-react'

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  barcode_upc: string
  unit_cost_cad: number
  msrp_cad: number
  price_whs_cad: number
  current_stock: number
  reorder_threshold: number
  is_active: boolean
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ sku: '', name: '', size_oz: '', barcode_upc: '', unit_cost_cad: '', msrp_cad: '', price_whs_cad: '', reorder_threshold: '' })

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('sku')
    setProducts(data || [])
    setLoading(false)
  }

  async function handleSubmit() {
    await supabase.from('products').insert([{
      sku: form.sku,
      name: form.name,
      size_oz: parseFloat(form.size_oz),
      barcode_upc: form.barcode_upc,
      unit_cost_cad: parseFloat(form.unit_cost_cad),
      msrp_cad: parseFloat(form.msrp_cad),
      price_whs_cad: parseFloat(form.price_whs_cad),
      reorder_threshold: parseInt(form.reorder_threshold),
    }])
    setShowModal(false)
    setForm({ sku: '', name: '', size_oz: '', barcode_upc: '', unit_cost_cad: '', msrp_cad: '', price_whs_cad: '', reorder_threshold: '' })
    fetchProducts()
  }

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <MainLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search products...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['SKU', 'Name', 'Size', 'Barcode', 'Unit Cost', 'MSRP', 'WHS Price', 'Stock', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                  <Package size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
                  No products yet
                </td>
              </tr>
            ) : filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#2563eb' }}>{p.sku}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{p.name}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{p.size_oz} oz</td>
                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{p.barcode_upc}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${p.unit_cost_cad?.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${p.msrp_cad?.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>${p.price_whs_cad?.toFixed(2)}</td>
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

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add New Product</h2>
            {[
              { label: 'SKU', key: 'sku', placeholder: 'IAP013' },
              { label: 'Product Name', key: 'name', placeholder: 'JBCO 2oz' },
              { label: 'Size (oz)', key: 'size_oz', placeholder: '2' },
              { label: 'Barcode UPC', key: 'barcode_upc', placeholder: '628176712130' },
              { label: 'Unit Cost (CAD)', key: 'unit_cost_cad', placeholder: '0.00' },
              { label: 'MSRP (CAD)', key: 'msrp_cad', placeholder: '0.00' },
              { label: 'WHS Price (CAD)', key: 'price_whs_cad', placeholder: '0.00' },
              { label: 'Reorder Threshold', key: 'reorder_threshold', placeholder: '100' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>{field.label}</label>
                <input
                  value={form[field.key as keyof typeof form]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Product</button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
