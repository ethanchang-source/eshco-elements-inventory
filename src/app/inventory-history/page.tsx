'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { getTodayToronto, torontoDateOnly } from '@/lib/dateUtils'
import { Archive, Camera, Calendar } from 'lucide-react'

interface Snapshot {
  id: string
  snapshot_date: string
  product_id: string
  sku: string
  product_name: string
  current_stock: number
  unit_cost_cad: number
  price_whs_cad: number
  snapshot_type: string
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const YEARS = [2024, 2025, 2026, 2027]

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts    = value ? value.split('-') : ['', '', '']
  const selYear  = parts[0] ? parseInt(parts[0]) : 0
  const selMonth = parts[1] ? parseInt(parts[1]) : 0
  const selDay   = parts[2] ? parseInt(parts[2]) : 0
  const maxDay   = selYear && selMonth ? new Date(selYear, selMonth, 0).getDate() : 31

  function emit(y: number, m: number, d: number) {
    if (!y || !m || !d) { onChange(''); return }
    const max = new Date(y, m, 0).getDate()
    onChange(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, max)).padStart(2, '0')}`)
  }

  const s: React.CSSProperties = {
    padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '8px',
    fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      <select value={selMonth} onChange={e => emit(selYear, parseInt(e.target.value), selDay)} style={s}>
        <option value={0}>Month</option>
        {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
      </select>
      <select value={selDay} onChange={e => emit(selYear, selMonth, parseInt(e.target.value))} style={s}>
        <option value={0}>Day</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select value={selYear} onChange={e => emit(parseInt(e.target.value), selMonth, selDay)} style={s}>
        <option value={0}>Year</option>
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}

export default function InventoryHistory() {
  const [selectedDate, setSelectedDate]     = useState(getTodayToronto())
  const [compareDate, setCompareDate]       = useState('')
  const [snapshots, setSnapshots]           = useState<Snapshot[]>([])
  const [compareSnaps, setCompareSnaps]     = useState<Snapshot[]>([])
  const [snapshotDates, setSnapshotDates]   = useState<string[]>([])
  const [loading, setLoading]               = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)
  const [taking, setTaking]                 = useState(false)
  const [takeMsg, setTakeMsg]               = useState('')
  const [takeMsgOk, setTakeMsgOk]           = useState(true)

  const fetchSnapshots = useCallback(async (date: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_snapshots')
      .select('*')
      .eq('snapshot_date', date)
      .order('sku')
    setSnapshots(data || [])
    setLoading(false)
  }, [])

  const fetchCompare = useCallback(async (date: string) => {
    setCompareLoading(true)
    const { data } = await supabase
      .from('inventory_snapshots')
      .select('*')
      .eq('snapshot_date', date)
      .order('sku')
    setCompareSnaps(data || [])
    setCompareLoading(false)
  }, [])

  const fetchDates = useCallback(async () => {
    const { data } = await supabase
      .from('inventory_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
    if (data) {
      const unique = Array.from(new Set(data.map((r: any) => r.snapshot_date as string)))
      setSnapshotDates(unique)
    }
  }, [])

  useEffect(() => {
    fetchSnapshots(selectedDate)
    fetchDates()
  }, [selectedDate, fetchSnapshots, fetchDates])

  useEffect(() => {
    if (compareDate) fetchCompare(compareDate)
    else setCompareSnaps([])
  }, [compareDate, fetchCompare])

  async function handleTakeSnapshot() {
    setTaking(true)
    setTakeMsg('')
    const today = getTodayToronto()

    await supabase.from('inventory_snapshots').delete().eq('snapshot_date', today)

    const { data: products, error } = await supabase
      .from('products')
      .select('id, sku, name, current_stock, unit_cost_cad, price_whs_cad')
      .eq('is_active', true)

    if (error || !products) {
      setTakeMsg('Failed to fetch products')
      setTakeMsgOk(false)
      setTaking(false)
      return
    }

    const rows = products.map((p: any) => ({
      snapshot_date: today,
      product_id:    p.id,
      sku:           p.sku,
      product_name:  p.name,
      current_stock: p.current_stock ?? 0,
      unit_cost_cad: p.unit_cost_cad ?? 0,
      price_whs_cad: p.price_whs_cad ?? 0,
      snapshot_type: 'manual',
    }))

    const { error: insertErr } = await supabase.from('inventory_snapshots').insert(rows)
    if (insertErr) {
      setTakeMsg(`Failed: ${insertErr.message}`)
      setTakeMsgOk(false)
    } else {
      setTakeMsg(`Snapshot saved — ${rows.length} products`)
      setTakeMsgOk(true)
      if (selectedDate === today) fetchSnapshots(today)
      fetchDates()
    }
    setTimeout(() => setTakeMsg(''), 4000)
    setTaking(false)
  }

  const compareMap = new Map(compareSnaps.map(s => [s.sku, s]))

  const allSkus = compareDate
    ? Array.from(new Set([...snapshots.map(s => s.sku), ...compareSnaps.map(s => s.sku)])).sort()
    : []

  const totals = {
    stock: snapshots.reduce((s, p) => s + (p.current_stock || 0), 0),
    value: snapshots.reduce((s, p) => s + (p.current_stock || 0) * (p.unit_cost_cad || 0), 0),
    whs:   snapshots.reduce((s, p) => s + (p.current_stock || 0) * (p.price_whs_cad || 0), 0),
  }

  const sel: React.CSSProperties = {
    padding: '7px 11px', border: '1px solid #e2e8f0', borderRadius: '8px',
    fontSize: '13px', outline: 'none', background: '#fff',
  }
  const thBase: React.CSSProperties = {
    padding: '10px 14px', fontSize: '11px', fontWeight: '600',
    color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap',
    background: '#f8fafc', textAlign: 'left',
  }
  const tdBase: React.CSSProperties = {
    padding: '10px 14px', fontSize: '13px', color: '#1e293b',
  }

  return (
    <MainLayout>
      {/* Info banner */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 16px', marginBottom: '20px', fontSize: '13px', color: '#1d4ed8' }}>
        Snapshots are saved manually. Click "Take Snapshot" to save today's inventory.
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={15} color='#64748b' />
          <DatePicker value={selectedDate} onChange={v => { if (v) setSelectedDate(v) }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Compare with:</span>
          <DatePicker value={compareDate} onChange={setCompareDate} />
          {compareDate && (
            <button
              onClick={() => setCompareDate('')}
              style={{ ...sel, background: '#f1f5f9', color: '#64748b', cursor: 'pointer', border: '1px solid #e2e8f0' }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {takeMsg && (
            <span style={{ fontSize: '13px', fontWeight: '500', color: takeMsgOk ? '#16a34a' : '#dc2626' }}>
              {takeMsg}
            </span>
          )}
          <button
            onClick={handleTakeSnapshot}
            disabled={taking}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', background: taking ? '#94a3b8' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: '500', cursor: taking ? 'not-allowed' : 'pointer',
            }}
          >
            <Camera size={14} />
            {taking ? 'Saving…' : 'Take Snapshot'}
          </button>
        </div>
      </div>

      {/* Grid: table + history sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '16px', alignItems: 'start' }}>

        {/* Main table */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              Loading…
            </div>
          ) : snapshots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <Archive size={32} color='#cbd5e1' style={{ display: 'block', margin: '0 auto 12px' }} />
              No snapshot for this date
            </div>
          ) : compareDate ? (
            /* Comparison view */
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '750px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={thBase}>SKU</th>
                    <th style={thBase}>Product</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Stock ({selectedDate})</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Stock ({compareDate})</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Δ Stock</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Value ({selectedDate})</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Value ({compareDate})</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Δ Value</th>
                  </tr>
                </thead>
                <tbody>
                  {compareLoading ? (
                    <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Loading comparison…</td></tr>
                  ) : allSkus.map((sku, idx) => {
                    const a = snapshots.find(s => s.sku === sku)
                    const b = compareMap.get(sku)
                    const stockA = a?.current_stock ?? 0
                    const stockB = b?.current_stock ?? 0
                    const costA  = a?.unit_cost_cad ?? b?.unit_cost_cad ?? 0
                    const costB  = b?.unit_cost_cad ?? a?.unit_cost_cad ?? 0
                    const valA   = stockA * costA
                    const valB   = stockB * costB
                    const dStock = stockA - stockB
                    const dVal   = valA - valB
                    const name   = a?.product_name ?? b?.product_name ?? sku
                    const stockColor = dStock > 0 ? '#16a34a' : dStock < 0 ? '#dc2626' : '#94a3b8'
                    const valColor   = dVal > 0 ? '#16a34a' : dVal < 0 ? '#dc2626' : '#94a3b8'
                    return (
                      <tr key={sku} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...tdBase, fontWeight: '500', fontFamily: 'monospace', fontSize: '12px' }}>{sku}</td>
                        <td style={{ ...tdBase, color: '#374151' }}>{name}</td>
                        <td style={{ ...tdBase, textAlign: 'right' }}>{stockA.toLocaleString()}</td>
                        <td style={{ ...tdBase, textAlign: 'right', color: '#64748b' }}>{stockB.toLocaleString()}</td>
                        <td style={{ ...tdBase, textAlign: 'right', fontWeight: '600', color: stockColor }}>
                          {dStock > 0 ? `+${dStock.toLocaleString()}` : dStock.toLocaleString()}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right' }}>${formatCurrency(valA)}</td>
                        <td style={{ ...tdBase, textAlign: 'right', color: '#64748b' }}>${formatCurrency(valB)}</td>
                        <td style={{ ...tdBase, textAlign: 'right', fontWeight: '600', color: valColor }}>
                          {dVal >= 0 ? '+' : ''}${formatCurrency(dVal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Single-date view */
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={thBase}>SKU</th>
                    <th style={thBase}>Product</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Stock</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>MFG Cost</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>WHS Price</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Total Value</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>WHS Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s, idx) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...tdBase, fontWeight: '500', fontFamily: 'monospace', fontSize: '12px' }}>{s.sku}</td>
                      <td style={{ ...tdBase, color: '#374151' }}>{s.product_name}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{(s.current_stock || 0).toLocaleString()}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#64748b' }}>${formatCurrency(s.unit_cost_cad)}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#64748b' }}>${formatCurrency(s.price_whs_cad)}</td>
                      <td style={{ ...tdBase, textAlign: 'right', fontWeight: '500' }}>
                        ${formatCurrency((s.current_stock || 0) * (s.unit_cost_cad || 0))}
                      </td>
                      <td style={{ ...tdBase, textAlign: 'right', fontWeight: '500', color: '#16a34a' }}>
                        ${formatCurrency((s.current_stock || 0) * (s.price_whs_cad || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <td colSpan={2} style={{ ...tdBase, fontWeight: '700', color: '#374151' }}>
                      Total ({snapshots.length} products)
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: '700' }}>{totals.stock.toLocaleString()}</td>
                    <td colSpan={2} />
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: '700' }}>${formatCurrency(totals.value)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>${formatCurrency(totals.whs)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* History sidebar */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Archive size={14} color='#64748b' />
            History
          </div>
          {snapshotDates.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No snapshots yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {snapshotDates.map(date => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    padding: '6px 10px', borderRadius: '6px', border: 'none',
                    cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                    fontWeight: selectedDate === date ? '600' : '400',
                    background: selectedDate === date ? '#eff6ff' : 'transparent',
                    color: selectedDate === date ? '#2563eb' : '#374151',
                  }}
                >
                  {torontoDateOnly(date + 'T12:00:00')}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </MainLayout>
  )
}
