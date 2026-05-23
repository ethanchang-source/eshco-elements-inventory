'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { TrendingUp, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getLocalDateString } from '@/lib/utils'

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  price_whs_cad: number
  msrp_cad: number
  unit_cost_cad: number
  is_active: boolean
}

interface BomItem {
  product_id: string
  component_type: string
  qty_per_unit: number
  unit: string
  raw_materials?: { avg_cost_cad?: number; cost_per_unit_cad?: number; name: string; item_no: string }
  packaging?: { avg_cost_cad?: number; cost_cad?: number; name: string; item_no: string; type: string }
}

interface MarginRow {
  product_id: string
  sku: string
  name: string
  size_oz: number
  is_active: boolean
  price_whs_cad: number
  msrp_cad: number
  mfg_cost: number
  has_bom: boolean
  whs_margin_dollar: number
  whs_margin_pct: number
  msrp_margin_dollar: number
  msrp_margin_pct: number
  whs_20off_price: number
  whs_20off_margin_pct: number
}

function marginBg(pct: number): string {
  if (pct >= 60) return '#dcfce7'
  if (pct >= 50) return '#dbeafe'
  if (pct >= 40) return '#fef9c3'
  return '#fee2e2'
}

function marginFg(pct: number): string {
  if (pct >= 60) return '#15803d'
  if (pct >= 50) return '#1d4ed8'
  if (pct >= 40) return '#854d0e'
  return '#b91c1c'
}

const fmt2 = (n: number) => n.toFixed(2)
const fmtPct = (n: number) => n.toFixed(1) + '%'

export default function MarginPage() {
  const [rows, setRows] = useState<MarginRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeOnly, setActiveOnly] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [{ data: products }, { data: bomItems }] = await Promise.all([
      supabase
        .from('products')
        .select('id, sku, name, size_oz, price_whs_cad, msrp_cad, unit_cost_cad, is_active')
        .order('sku'),
      supabase
        .from('bom')
        .select(`
          product_id, component_type, qty_per_unit, unit,
          raw_materials(avg_cost_cad, cost_per_unit_cad, name, item_no),
          packaging(avg_cost_cad, cost_cad, name, item_no, type)
        `),
    ])

    const bomByProduct: { [id: string]: BomItem[] } = {}
    for (const item of (bomItems as BomItem[]) || []) {
      if (!bomByProduct[item.product_id]) bomByProduct[item.product_id] = []
      bomByProduct[item.product_id].push(item)
    }

    const computed: MarginRow[] = ((products as Product[]) || []).map((p) => {
      const bom = bomByProduct[p.id] || []
      const has_bom = bom.length > 0

      const mfg_cost = has_bom
        ? bom.reduce((sum, item) => {
            const unitCost = (() => {
              if (item.component_type === 'raw_material') {
                const avg = item.raw_materials?.avg_cost_cad
                const base = item.raw_materials?.cost_per_unit_cad ?? 0
                if (avg && avg > 0 && Math.abs(avg - base) / (base || 1) < 5) return avg
                return base
              }
              return item.packaging?.avg_cost_cad ?? item.packaging?.cost_cad ?? 0
            })()
            return sum + unitCost * item.qty_per_unit
          }, 0)
        : (p.unit_cost_cad ?? 0)

      const whs = p.price_whs_cad ?? 0
      const msrp = p.msrp_cad ?? 0
      const whs_20off = whs * 0.8

      return {
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        size_oz: p.size_oz,
        is_active: p.is_active,
        price_whs_cad: whs,
        msrp_cad: msrp,
        mfg_cost,
        has_bom,
        whs_margin_dollar: whs - mfg_cost,
        whs_margin_pct: whs > 0 ? ((whs - mfg_cost) / whs) * 100 : 0,
        msrp_margin_dollar: msrp - mfg_cost,
        msrp_margin_pct: msrp > 0 ? ((msrp - mfg_cost) / msrp) * 100 : 0,
        whs_20off_price: whs_20off,
        whs_20off_margin_pct: whs_20off > 0 ? ((whs_20off - mfg_cost) / whs_20off) * 100 : 0,
      }
    })

    setRows(computed)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const visibleRows = activeOnly ? rows.filter((r) => r.is_active) : rows

  const avgWhsMargin =
    visibleRows.length > 0
      ? visibleRows.reduce((s, r) => s + r.whs_margin_pct, 0) / visibleRows.length
      : 0
  const avgMsrpMargin =
    visibleRows.length > 0
      ? visibleRows.reduce((s, r) => s + r.msrp_margin_pct, 0) / visibleRows.length
      : 0
  const highestRow = visibleRows.length > 0
    ? visibleRows.reduce((a, b) => (a.whs_margin_pct >= b.whs_margin_pct ? a : b))
    : null
  const lowestRow = visibleRows.length > 0
    ? visibleRows.reduce((a, b) => (a.whs_margin_pct <= b.whs_margin_pct ? a : b))
    : null

  function handleExport() {
    const wsData = [
      [
        'SKU', 'Product Name', 'Size (oz)',
        'WHS Price', 'MSRP',
        'MFG Cost', 'BOM Based',
        'WHS Margin $', 'WHS Margin %',
        'MSRP Margin $', 'MSRP Margin %',
        'WHS 20% Off Price', 'WHS 20% Off Margin %',
      ],
      ...visibleRows.map((r) => [
        r.sku,
        r.name,
        r.size_oz,
        r.price_whs_cad,
        r.msrp_cad,
        +r.mfg_cost.toFixed(4),
        r.has_bom ? 'Yes' : 'No (unit_cost)',
        +r.whs_margin_dollar.toFixed(2),
        +(r.whs_margin_pct / 100).toFixed(4),
        +r.msrp_margin_dollar.toFixed(2),
        +(r.msrp_margin_pct / 100).toFixed(4),
        +r.whs_20off_price.toFixed(2),
        +(r.whs_20off_margin_pct / 100).toFixed(4),
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const pctColIndices = [8, 10, 12]
    visibleRows.forEach((_, rowIdx) => {
      pctColIndices.forEach((col) => {
        const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: col })
        if (ws[ref]) ws[ref].z = '0.0%'
      })
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Margin Analysis')
    XLSX.writeFile(wb, `margin_analysis_${getLocalDateString()}.xlsx`)
  }

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600,
    color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc',
  }
  const td: React.CSSProperties = {
    padding: '10px 12px', fontSize: '13px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
  }

  function PctBadge({ pct }: { pct: number }) {
    return (
      <span style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: '12px',
        fontWeight: 600, fontSize: '12px',
        background: marginBg(pct), color: marginFg(pct),
      }}>
        {fmtPct(pct)}
      </span>
    )
  }

  return (
    <MainLayout>
      <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <TrendingUp size={28} color="#2563eb" />
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Margin Analysis</h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>BOM-based manufacturing cost &amp; pricing margins</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setActiveOnly(!activeOnly)}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                background: activeOnly ? '#2563eb' : '#fff',
                color: activeOnly ? '#fff' : '#374151',
                border: activeOnly ? '1px solid #2563eb' : '1px solid #d1d5db',
              }}
            >
              {activeOnly ? 'Active Only' : 'All Products'}
            </button>
            <button
              onClick={handleExport}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 16px', background: '#16a34a', color: '#fff',
                border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Download size={15} /> Export Excel
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {!loading && visibleRows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Avg WHS Margin</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: marginFg(avgWhsMargin) }}>
                {fmtPct(avgWhsMargin)}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{visibleRows.length} products</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Avg MSRP Margin</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: marginFg(avgMsrpMargin) }}>
                {fmtPct(avgMsrpMargin)}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>based on MSRP price</div>
            </div>
            {highestRow && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px' }}>
                <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '6px' }}>Highest WHS Margin</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#15803d' }}>{highestRow.sku}</div>
                <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>{highestRow.name}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#15803d', marginTop: '6px' }}>
                  {fmtPct(highestRow.whs_margin_pct)}
                </div>
              </div>
            )}
            {lowestRow && (
              <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: '12px', padding: '20px' }}>
                <div style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '6px' }}>Lowest WHS Margin</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#b91c1c' }}>{lowestRow.sku}</div>
                <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>{lowestRow.name}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#b91c1c', marginTop: '6px' }}>
                  {fmtPct(lowestRow.whs_margin_pct)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', overflowX: 'auto', width: '100%' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading margin data...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>SKU</th>
                    <th style={th}>Product Name</th>
                    <th style={{ ...th, textAlign: 'right' }}>Size</th>
                    <th style={{ ...th, textAlign: 'right' }}>WHS Price</th>
                    <th style={{ ...th, textAlign: 'right' }}>MSRP</th>
                    <th style={{ ...th, textAlign: 'right' }}>MFG Cost</th>
                    <th style={{ ...th, textAlign: 'right' }}>WHS Margin $</th>
                    <th style={{ ...th, textAlign: 'center' }}>WHS Margin %</th>
                    <th style={{ ...th, textAlign: 'right' }}>MSRP Margin $</th>
                    <th style={{ ...th, textAlign: 'center' }}>MSRP Margin %</th>
                    <th style={{ ...th, textAlign: 'right' }}>WHS 20% Off</th>
                    <th style={{ ...th, textAlign: 'center' }}>WHS 20% Off %</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
                        No products found.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((r) => (
                      <tr
                        key={r.product_id}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                      >
                        <td style={{ ...td, fontWeight: 600, color: '#2563eb' }}>{r.sku}</td>
                        <td style={td}>
                          {r.name}
                          {!r.has_bom && (
                            <span style={{ marginLeft: '6px', fontSize: '10px', background: '#fef9c3', color: '#854d0e', padding: '1px 5px', borderRadius: '4px' }}>
                              unit cost
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: '#475569' }}>{r.size_oz} oz</td>
                        <td style={{ ...td, textAlign: 'right' }}>${fmt2(r.price_whs_cad)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>${fmt2(r.msrp_cad)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#475569', fontFamily: 'monospace' }}>${r.mfg_cost.toFixed(4)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>${fmt2(r.whs_margin_dollar)}</td>
                        <td style={{ ...td, textAlign: 'center' }}><PctBadge pct={r.whs_margin_pct} /></td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>${fmt2(r.msrp_margin_dollar)}</td>
                        <td style={{ ...td, textAlign: 'center' }}><PctBadge pct={r.msrp_margin_pct} /></td>
                        <td style={{ ...td, textAlign: 'right' }}>${fmt2(r.whs_20off_price)}</td>
                        <td style={{ ...td, textAlign: 'center' }}><PctBadge pct={r.whs_20off_margin_pct} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { bg: '#dcfce7', fg: '#15803d', label: '≥ 60%' },
            { bg: '#dbeafe', fg: '#1d4ed8', label: '50–59%' },
            { bg: '#fef9c3', fg: '#854d0e', label: '40–49%' },
            { bg: '#fee2e2', fg: '#b91c1c', label: '< 40%' },
          ].map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
              <span style={{ display: 'inline-block', width: '32px', height: '18px', borderRadius: '9px', background: l.bg, border: `1px solid ${l.fg}40` }} />
              {l.label}
            </div>
          ))}
          <div style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
            Margins calculated on selling price
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
