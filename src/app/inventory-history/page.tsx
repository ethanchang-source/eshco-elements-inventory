'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { getTodayToronto, torontoDateOnly } from '@/lib/dateUtils'
import { Archive, Camera, Calendar, Trash2 } from 'lucide-react'

interface Snapshot {
  id: string
  snapshot_date: string
  item_type: string
  item_id: string
  item_no: string
  name: string
  quantity_in_stock: number
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
  useEffect(() => { document.title = 'Inventory History | ESHCO ELEMENTS' }, [])
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
      .order('item_no')
    setSnapshots(data || [])
    setLoading(false)
  }, [])

  const fetchCompare = useCallback(async (date: string) => {
    setCompareLoading(true)
    const { data } = await supabase
      .from('inventory_snapshots')
      .select('*')
      .eq('snapshot_date', date)
      .order('item_no')
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

    const [{ data: rawData, error: rawErr }, { data: packData, error: packErr }] = await Promise.all([
      supabase.from('raw_materials').select('id, item_no, name, current_stock'),
      supabase.from('packaging').select('id, item_no, name, current_stock'),
    ])

    if (rawErr || packErr || !rawData || !packData) {
      setTakeMsg('Failed to fetch items')
      setTakeMsgOk(false)
      setTaking(false)
      return
    }

    const rows = [
      ...rawData.map((r: any) => ({
        snapshot_date:     today,
        item_type:         'raw_material',
        item_id:           r.id,
        item_no:           r.item_no,
        name:              r.name,
        quantity_in_stock: r.current_stock ?? 0,
      })),
      ...packData.map((p: any) => ({
        snapshot_date:     today,
        item_type:         'packaging',
        item_id:           p.id,
        item_no:           p.item_no,
        name:              p.name,
        quantity_in_stock: p.current_stock ?? 0,
      })),
    ]

    const { error: insertErr } = await supabase.from('inventory_snapshots').insert(rows)
    if (insertErr) {
      setTakeMsg(`Failed: ${insertErr.message}`)
      setTakeMsgOk(false)
    } else {
      setTakeMsg(`Snapshot saved — ${rows.length} items`)
      setTakeMsgOk(true)
      if (selectedDate === today) fetchSnapshots(today)
      fetchDates()
    }
    setTimeout(() => setTakeMsg(''), 4000)
    setTaking(false)
  }

  async function handleDeleteSnapshot(date: string) {
    if (!confirm(`Are you sure you want to delete the snapshot for ${date}?`)) return
    await supabase.from('inventory_snapshots').delete().eq('snapshot_date', date)
    if (selectedDate === date) setSnapshots([])
    if (compareDate === date) setCompareSnaps([])
    fetchDates()
  }

  const compareMap = new Map(compareSnaps.map(s => [s.item_no, s]))

  const allItemNos = compareDate
    ? Array.from(new Set([...snapshots.map(s => s.item_no), ...compareSnaps.map(s => s.item_no)])).sort()
    : []

  const totalStock = snapshots.reduce((s, p) => s + (p.quantity_in_stock || 0), 0)

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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={thBase}>Item No</th>
                    <th style={thBase}>Item Description</th>
                    <th style={thBase}>Type</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Stock ({selectedDate})</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Stock ({compareDate})</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Δ Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {compareLoading ? (
                    <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Loading comparison…</td></tr>
                  ) : allItemNos.map((itemNo, idx) => {
                    const a = snapshots.find(s => s.item_no === itemNo)
                    const b = compareMap.get(itemNo)
                    const stockA = a?.quantity_in_stock ?? 0
                    const stockB = b?.quantity_in_stock ?? 0
                    const dStock = stockA - stockB
                    const name   = a?.name ?? b?.name ?? itemNo
                    const type   = a?.item_type ?? b?.item_type ?? ''
                    const stockColor = dStock > 0 ? '#16a34a' : dStock < 0 ? '#dc2626' : '#94a3b8'
                    return (
                      <tr key={itemNo} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...tdBase, fontWeight: '500', fontFamily: 'monospace', fontSize: '12px' }}>{itemNo}</td>
                        <td style={{ ...tdBase, color: '#374151' }}>{name}</td>
                        <td style={{ ...tdBase }}>
                          <span style={{ background: type === 'raw_material' ? '#eff6ff' : '#f5f3ff', color: type === 'raw_material' ? '#2563eb' : '#7c3aed', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }}>
                            {type === 'raw_material' ? 'Raw' : 'Pkg'}
                          </span>
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right' }}>{stockA.toLocaleString()}</td>
                        <td style={{ ...tdBase, textAlign: 'right', color: '#64748b' }}>{stockB.toLocaleString()}</td>
                        <td style={{ ...tdBase, textAlign: 'right', fontWeight: '600', color: stockColor }}>
                          {dStock > 0 ? `+${dStock.toLocaleString()}` : dStock.toLocaleString()}
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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '440px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={thBase}>Item No</th>
                    <th style={thBase}>Item Description</th>
                    <th style={thBase}>Type</th>
                    <th style={{ ...thBase, textAlign: 'right' }}>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s, idx) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...tdBase, fontWeight: '500', fontFamily: 'monospace', fontSize: '12px' }}>{s.item_no}</td>
                      <td style={{ ...tdBase, color: '#374151' }}>{s.name}</td>
                      <td style={{ ...tdBase }}>
                        <span style={{ background: s.item_type === 'raw_material' ? '#eff6ff' : '#f5f3ff', color: s.item_type === 'raw_material' ? '#2563eb' : '#7c3aed', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }}>
                          {s.item_type === 'raw_material' ? 'Raw' : 'Pkg'}
                        </span>
                      </td>
                      <td style={{ ...tdBase, textAlign: 'right', fontWeight: '500' }}>{(s.quantity_in_stock || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <td colSpan={3} style={{ ...tdBase, fontWeight: '700', color: '#374151' }}>
                      Total ({snapshots.length} items)
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: '700' }}>{totalStock.toLocaleString()}</td>
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
                <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', background: selectedDate === date ? '#eff6ff' : 'transparent' }}>
                  <button
                    onClick={() => setSelectedDate(date)}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: '6px', border: 'none',
                      cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                      fontWeight: selectedDate === date ? '600' : '400',
                      background: 'transparent',
                      color: selectedDate === date ? '#2563eb' : '#374151',
                    }}
                  >
                    {torontoDateOnly(date + 'T12:00:00')}
                  </button>
                  <button
                    onClick={() => handleDeleteSnapshot(date)}
                    title={`Delete snapshot for ${date}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '4px', marginRight: '4px', border: 'none', borderRadius: '4px',
                      background: 'transparent', color: '#fca5a5', cursor: 'pointer',
                      flexShrink: 0, lineHeight: 1,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#dc2626' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </MainLayout>
  )
}
