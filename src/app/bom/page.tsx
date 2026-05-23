'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { FlaskConical, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  price_whs_cad?: number
  msrp_cad?: number
  unit_cost_cad?: number
}

interface RawMaterial {
  id: string
  item_no: string
  name: string
  unit: string
}

interface Packaging {
  id: string
  item_no: string
  name: string
  type: string
}

interface BomItem {
  id: string
  product_id: string
  component_type: string
  raw_material_id: string | null
  packaging_id: string | null
  qty_per_unit: number
  unit: string
  notes: string
  raw_materials?: { item_no: string; name: string; unit: string; avg_cost_cad?: number; cost_per_unit_cad?: number }
  packaging?: { item_no: string; name: string; type: string; avg_cost_cad?: number; cost_cad?: number }
}

function getItemUnitCost(item: BomItem): number {
  if (item.component_type === 'raw_material') {
    const avg = item.raw_materials?.avg_cost_cad
    const base = item.raw_materials?.cost_per_unit_cad ?? 0
    if (avg && avg > 0 && Math.abs(avg - base) / (base || 1) < 5) return avg
    return base
  }
  return item.packaging?.avg_cost_cad ?? item.packaging?.cost_cad ?? 0
}

export default function BomPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [packagingItems, setPackagingItems] = useState<Packaging[]>([])
  const [bomItems, setBomItems] = useState<{ [productId: string]: BomItem[] }>({})
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [form, setForm] = useState({
    component_type: 'raw_material',
    raw_material_id: '',
    packaging_id: '',
    qty_per_unit: '',
    unit: 'ml',
    notes: '',
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [p, r, pk] = await Promise.all([
      supabase.from('products').select('id, sku, name, size_oz, price_whs_cad, msrp_cad, unit_cost_cad').eq('is_active', true).order('sku'),
      supabase.from('raw_materials').select('id, item_no, name, unit, avg_cost_cad, cost_per_unit_cad').order('item_no'),
      supabase.from('packaging').select('id, item_no, name, type, avg_cost_cad, cost_cad').order('item_no'),
    ])
    setProducts(p.data || [])
    setRawMaterials(r.data || [])
    setPackagingItems(pk.data || [])
    setLoading(false)
  }

  async function fetchBomForProduct(productId: string) {
    const { data } = await supabase
      .from('bom')
      .select('*, raw_materials(item_no, name, unit, avg_cost_cad, cost_per_unit_cad), packaging(item_no, name, type, avg_cost_cad, cost_cad)')
      .eq('product_id', productId)
    setBomItems(prev => ({ ...prev, [productId]: data || [] }))
  }

  function toggleProduct(productId: string) {
    if (expandedProduct === productId) {
      setExpandedProduct(null)
    } else {
      setExpandedProduct(productId)
      fetchBomForProduct(productId)
    }
  }

  function openAddModal(product: Product) {
    setSelectedProduct(product)
    setForm({ component_type: 'raw_material', raw_material_id: '', packaging_id: '', qty_per_unit: '', unit: 'ml', notes: '' })
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!selectedProduct) return
    await supabase.from('bom').insert([{
      product_id: selectedProduct.id,
      component_type: form.component_type,
      raw_material_id: form.component_type === 'raw_material' ? form.raw_material_id : null,
      packaging_id: form.component_type === 'packaging' ? form.packaging_id : null,
      qty_per_unit: parseFloat(form.qty_per_unit),
      unit: form.unit,
      notes: form.notes,
    }])
    setShowModal(false)
    fetchBomForProduct(selectedProduct.id)
  }

  async function handleDelete(bomId: string, productId: string) {
    if (!confirm('Delete this BOM item?')) return
    await supabase.from('bom').delete().eq('id', bomId)
    fetchBomForProduct(productId)
  }

  return (
    <MainLayout>
      <div style={{ marginBottom: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#1d4ed8' }}>
        💡 Click on a product to view or edit its Bill of Materials. Each BOM defines what raw materials and packaging are consumed when producing 1 unit.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading...</div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <FlaskConical size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No products yet. Add products first.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {products.map(product => {
            const items = bomItems[product.id] || []
            const totalMfgCost = items.reduce((sum, item) => sum + item.qty_per_unit * getItemUnitCost(item), 0)
            const whsPrice = product.price_whs_cad ?? 0
            const msrp = product.msrp_cad ?? 0
            const whs20off = whsPrice * 0.8
            const whsMargin = whsPrice > 0 ? ((whsPrice - totalMfgCost) / whsPrice) * 100 : null
            const msrpMargin = msrp > 0 ? ((msrp - totalMfgCost) / msrp) * 100 : null
            const whs20offMargin = whs20off > 0 ? ((whs20off - totalMfgCost) / whs20off) * 100 : null

            return (
              <div key={product.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {/* Product Row */}
                <div
                  onClick={() => toggleProduct(product.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', background: expandedProduct === product.id ? '#f8fafc' : '#fff' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FlaskConical size={18} color='#2563eb' />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{product.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{product.sku} · {product.size_oz} oz</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {expandedProduct === product.id && (
                      <button
                        onClick={e => { e.stopPropagation(); openAddModal(product) }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                      >
                        <Plus size={14} /> Add Component
                      </button>
                    )}
                    {expandedProduct === product.id ? <ChevronUp size={18} color='#64748b' /> : <ChevronDown size={18} color='#64748b' />}
                  </div>
                </div>

                {/* BOM Items */}
                {expandedProduct === product.id && (
                  <div style={{ borderTop: '1px solid #e2e8f0' }}>
                    {!bomItems[product.id] ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
                    ) : bomItems[product.id].length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        No components yet. Click "Add Component" to define this product's BOM.
                      </div>
                    ) : (
                      <>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc' }}>
                                {['Type', 'Item #', 'Name', 'Qty per Unit', 'Unit', 'Unit Cost', 'Line Cost', 'Notes', ''].map(h => (
                                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {bomItems[product.id].map(item => {
                                const unitCost = getItemUnitCost(item)
                                const lineCost = item.qty_per_unit * unitCost
                                return (
                                  <tr key={item.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '10px 16px' }}>
                                      <span style={{ background: item.component_type === 'raw_material' ? '#f0fdf4' : '#eff6ff', color: item.component_type === 'raw_material' ? '#16a34a' : '#2563eb', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
                                        {item.component_type === 'raw_material' ? 'Raw Material' : 'Packaging'}
                                      </span>
                                    </td>
                                    <td style={{ padding: '10px 16px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                                      {item.component_type === 'raw_material' ? item.raw_materials?.item_no : item.packaging?.item_no}
                                    </td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#1e293b' }}>
                                      {item.component_type === 'raw_material' ? item.raw_materials?.name : item.packaging?.name}
                                    </td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{item.qty_per_unit}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#64748b' }}>{item.unit}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>${unitCost.toFixed(5)}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#1e293b', fontFamily: 'monospace', fontWeight: '600' }}>${lineCost.toFixed(5)}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#94a3b8' }}>{item.notes}</td>
                                    <td style={{ padding: '10px 16px' }}>
                                      <button onClick={() => handleDelete(item.id, product.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Cost Summary */}
                        <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Cost Summary</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Total MFG Cost</div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>${totalMfgCost.toFixed(5)}</div>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>WHS Price</div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>{whsPrice > 0 ? `$${whsPrice.toFixed(2)}` : '—'}</div>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>MSRP</div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>{msrp > 0 ? `$${msrp.toFixed(2)}` : '—'}</div>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>WHS Margin %</div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: whsMargin !== null && whsMargin >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'monospace' }}>
                                {whsMargin !== null ? `${whsMargin.toFixed(1)}%` : '—'}
                              </div>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>MSRP Margin %</div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: msrpMargin !== null && msrpMargin >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'monospace' }}>
                                {msrpMargin !== null ? `${msrpMargin.toFixed(1)}%` : '—'}
                              </div>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>WHS 20% Off</div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>{whs20off > 0 ? `$${whs20off.toFixed(2)}` : '—'}</div>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>WHS 20% Off Margin %</div>
                              <div style={{ fontSize: '15px', fontWeight: '700', color: whs20offMargin !== null && whs20offMargin >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'monospace' }}>
                                {whs20offMargin !== null ? `${whs20offMargin.toFixed(1)}%` : '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '480px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Add BOM Component</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>{selectedProduct.name} ({selectedProduct.sku})</p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Component Type</label>
              <select value={form.component_type} onChange={e => setForm({ ...form, component_type: e.target.value, raw_material_id: '', packaging_id: '', unit: e.target.value === 'raw_material' ? 'ml' : 'ea' })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                <option value='raw_material'>Raw Material</option>
                <option value='packaging'>Packaging</option>
              </select>
            </div>

            {form.component_type === 'raw_material' ? (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Raw Material</label>
                <select value={form.raw_material_id} onChange={e => setForm({ ...form, raw_material_id: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                  <option value=''>Select raw material...</option>
                  {rawMaterials.map(r => (
                    <option key={r.id} value={r.id}>{r.item_no} - {r.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Packaging Item</label>
                <select value={form.packaging_id} onChange={e => setForm({ ...form, packaging_id: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                  <option value=''>Select packaging...</option>
                  {packagingItems.map(p => (
                    <option key={p.id} value={p.id}>{p.item_no} - {p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Qty per Unit</label>
                <input value={form.qty_per_unit} onChange={e => setForm({ ...form, qty_per_unit: e.target.value })} placeholder={form.component_type === 'raw_material' ? '120' : '1'} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Unit</label>
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}>
                  {form.component_type === 'raw_material' ? (
                    <>
                      <option value='ml'>ml</option>
                      <option value='g'>g</option>
                      <option value='L'>L</option>
                    </>
                  ) : (
                    <option value='ea'>ea</option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder='e.g. 95% fill ratio' style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSubmit} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Save Component</button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
