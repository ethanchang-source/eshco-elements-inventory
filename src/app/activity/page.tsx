'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { toTorontoTime } from '@/lib/dateUtils'
import { History, RotateCcw, X } from 'lucide-react'

interface ActivityEntry {
  id: string
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data: Record<string, any> | null
  new_data: Record<string, any> | null
  created_at: string
}

const TABLE_LABELS: Record<string, string> = {
  invoices:        'Invoices',
  credit_memos:    'Credit Memos',
  customers:       'Customers',
  suppliers:       'Suppliers',
  products:        'Products',
  purchase_orders: 'Purchase Orders',
  expenses:        'Expenses',
  raw_materials:   'Raw Materials',
  packaging:       'Packaging',
}

const FIELD_LABELS: Record<string, string> = {
  current_stock:  'Stock Quantity',
  unit_cost_cad:  'MFG Cost (CAD)',
  price_whs_cad:  'WHS Price (CAD)',
  invoice_no:     'Invoice No.',
  total_cad:      'Total (CAD)',
  company_name:   'Company',
  issued_at:      'Issue Date',
  status:         'Status',
  qty_ordered:    'Qty Ordered',
  cost_total_cad: 'Total Cost (CAD)',
  memo_no:        'Memo No.',
  sku:            'SKU',
  name:           'Name',
  description:    'Description',
  amount:         'Amount',
  category:       'Category',
  supplier:       'Supplier',
}

const TABLE_KEY_FIELDS: Record<string, string[]> = {
  products:        ['sku', 'name', 'current_stock', 'unit_cost_cad', 'price_whs_cad'],
  invoices:        ['invoice_no', 'company_name', 'total_cad', 'status'],
  credit_memos:    ['memo_no', 'company_name', 'total_cad'],
  purchase_orders: ['supplier', 'qty_ordered', 'cost_total_cad'],
  expenses:        ['description', 'amount', 'category'],
}

const ACTION_STYLE: Record<string, { bg: string; color: string }> = {
  INSERT: { bg: '#f0fdf4', color: '#16a34a' },
  UPDATE: { bg: '#eff6ff', color: '#2563eb' },
  DELETE: { bg: '#fef2f2', color: '#dc2626' },
}

const SKIP_FIELDS = new Set(['id', 'created_at', 'updated_at', 'deleted_at'])

const ID_FIELDS = ['invoice_no', 'memo_no', 'company_name', 'sku', 'name', 'description']

function getIdentifier(entry: ActivityEntry): string {
  const d = entry.new_data || entry.old_data
  if (!d) return entry.record_id.slice(0, 8)
  for (const f of ID_FIELDS) {
    if (d[f]) return String(d[f])
  }
  return entry.record_id.slice(0, 8)
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function getChangedFields(entry: ActivityEntry): string[] {
  if (entry.action !== 'UPDATE' || !entry.old_data || !entry.new_data) return []
  return Object.keys(entry.new_data).filter(
    k => !SKIP_FIELDS.has(k) &&
         JSON.stringify(entry.old_data![k]) !== JSON.stringify(entry.new_data![k])
  )
}

function getChangeSummary(entry: ActivityEntry): string {
  const identifier = getIdentifier(entry)
  if (entry.action === 'INSERT') return `${identifier} created`
  if (entry.action === 'DELETE') return `${identifier} deleted`

  const old = entry.old_data
  const neu = entry.new_data
  if (!old || !neu) return identifier

  const changed = getChangedFields(entry)
  if (changed.length === 0) return identifier

  if (entry.table_name === 'products') {
    const sku = neu.sku || old.sku || identifier
    if (changed.includes('current_stock'))
      return `${sku} stock ${old.current_stock} → ${neu.current_stock}`
  }
  if (entry.table_name === 'invoices') {
    const inv = neu.invoice_no || old.invoice_no || identifier
    if (changed.includes('status'))
      return `${inv} status ${old.status} → ${neu.status}`
  }

  const f = changed[0]
  return `${identifier} ${FIELD_LABELS[f] || f}: ${formatVal(old[f])} → ${formatVal(neu[f])}`
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({
  entry,
  onClose,
  onRestore,
  restoring,
}: {
  entry: ActivityEntry
  onClose: () => void
  onRestore: (e: ActivityEntry) => void
  restoring: string | null
}) {
  const ac = ACTION_STYLE[entry.action] || ACTION_STYLE.UPDATE
  const identifier = getIdentifier(entry)
  const changedFields = getChangedFields(entry)

  const displayData = entry.action === 'DELETE' ? entry.old_data : entry.new_data
  const keyFields = TABLE_KEY_FIELDS[entry.table_name]
  const displayFields: string[] = keyFields
    ? keyFields.filter(f => displayData && displayData[f] !== undefined && displayData[f] !== null)
    : displayData
      ? Object.keys(displayData).filter(k => !SKIP_FIELDS.has(k))
      : []

  const cell: React.CSSProperties = {
    padding: '9px 16px', fontSize: '13px', borderBottom: '1px solid #f1f5f9',
  }
  const thCell: React.CSSProperties = {
    ...cell, fontWeight: '600', fontSize: '11px', color: '#64748b', textTransform: 'uppercase',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          width: '100%', maxWidth: '600px', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>
              {TABLE_LABELS[entry.table_name] || entry.table_name}
            </span>
            <span style={{
              background: ac.bg, color: ac.color,
              padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
            }}>
              {entry.action}
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              {toTorontoTime(entry.created_at)}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', lineHeight: 1 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Identifier row */}
        <div style={{
          padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          fontSize: '12px', color: '#64748b',
        }}>
          <strong style={{ color: '#475569' }}>Identifier:</strong>&nbsp;{identifier}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* UPDATE – changed fields only */}
          {entry.action === 'UPDATE' && (
            changedFields.length === 0 ? (
              <div style={{ padding: '28px 20px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
                No field changes detected.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thCell}>Field</th>
                    <th style={thCell}>Before</th>
                    <th style={thCell}>After</th>
                  </tr>
                </thead>
                <tbody>
                  {changedFields.map(f => (
                    <tr key={f} style={{ background: '#fffbeb' }}>
                      <td style={{ ...cell, color: '#374151', fontWeight: '500' }}>
                        {FIELD_LABELS[f] || f}
                      </td>
                      <td style={{ ...cell, color: '#dc2626' }}>
                        {formatVal(entry.old_data![f])}
                      </td>
                      <td style={{ ...cell, color: '#16a34a', fontWeight: '500' }}>
                        {formatVal(entry.new_data![f])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* INSERT – new data */}
          {entry.action === 'INSERT' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f0fdf4' }}>
                  <th style={thCell}>Field</th>
                  <th style={thCell}>Value</th>
                </tr>
              </thead>
              <tbody>
                {displayFields.map(f => (
                  <tr key={f}>
                    <td style={{ ...cell, color: '#374151', fontWeight: '500' }}>
                      {FIELD_LABELS[f] || f}
                    </td>
                    <td style={{ ...cell, color: '#1e293b' }}>
                      {formatVal(displayData![f])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* DELETE – old data + restore */}
          {entry.action === 'DELETE' && (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fef2f2' }}>
                    <th style={thCell}>Field</th>
                    <th style={thCell}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {displayFields.map(f => (
                    <tr key={f} style={{ background: '#fff5f5' }}>
                      <td style={{ ...cell, color: '#374151', fontWeight: '500' }}>
                        {FIELD_LABELS[f] || f}
                      </td>
                      <td style={{ ...cell, color: '#dc2626' }}>
                        {formatVal(displayData![f])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entry.old_data && (
                <div style={{ padding: '14px 20px', borderTop: '1px solid #fecaca' }}>
                  <button
                    onClick={() => onRestore(entry)}
                    disabled={restoring === entry.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: restoring === entry.id ? '#f1f5f9' : '#eff6ff',
                      color:      restoring === entry.id ? '#94a3b8' : '#2563eb',
                      border: '1px solid #bfdbfe', borderRadius: '8px',
                      padding: '8px 18px', fontSize: '13px', fontWeight: '600',
                      cursor: restoring === entry.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <RotateCcw size={14} />
                    {restoring === entry.id ? 'Restoring…' : 'Restore Record'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DatePicker ────────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const YEARS = [2024, 2025, 2026, 2027]

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts   = value ? value.split('-') : ['', '', '']
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
    padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: '8px',
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActivityLog() {
  const [entries, setEntries]           = useState<ActivityEntry[]>([])
  const [loading, setLoading]           = useState(true)
  const [fetchError, setFetchError]     = useState('')
  const [filterTable, setFilterTable]   = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [restoring, setRestoring]       = useState<string | null>(null)
  const [restoreMsg, setRestoreMsg]     = useState('')
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null)

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    setFetchError('')
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    console.log('activity_log result:', data?.length, error)

    if (error) {
      setFetchError(error.message || 'Failed to load activity log')
      setEntries([])
    } else {
      setEntries(data || [])
    }
    setLoading(false)
  }

  async function handleRestore(entry: ActivityEntry) {
    if (!entry.old_data) return
    setRestoring(entry.id)
    setRestoreMsg('')
    try {
      if (entry.table_name === 'invoices') {
        const { created_at: _ca, updated_at: _ua, deleted_at: _da,
          customers: _c, suppliers: _s, raw_materials: _r, packaging: _p,
          ...invoicePayload } = entry.old_data
        const { error: invErr } = await supabase.from('invoices').insert([invoicePayload])
        if (invErr) throw invErr

        const deletedAt = entry.created_at
        const { data: itemLogs } = await supabase
          .from('activity_log')
          .select('*')
          .eq('table_name', 'invoice_items')
          .eq('action', 'DELETE')
          .gte('created_at', new Date(new Date(deletedAt).getTime() - 2000).toISOString())
          .lte('created_at', new Date(new Date(deletedAt).getTime() + 2000).toISOString())

        if (itemLogs && itemLogs.length > 0) {
          const items = itemLogs.map((il: any) => {
            const { created_at: _ca, ...itemPayload } = il.old_data
            return itemPayload
          })
          const { error: itemsErr } = await supabase.from('invoice_items').insert(items)
          if (itemsErr) throw itemsErr
        }
      } else if (entry.table_name === 'credit_memos') {
        const { created_at: _ca, updated_at: _ua, deleted_at: _da,
          customers: _c, suppliers: _s, raw_materials: _r, packaging: _p,
          ...memoPayload } = entry.old_data
        const { error: memoErr } = await supabase.from('credit_memos').insert([memoPayload])
        if (memoErr) throw memoErr

        const deletedAt = entry.created_at
        const { data: itemLogs } = await supabase
          .from('activity_log')
          .select('*')
          .eq('table_name', 'credit_memo_items')
          .eq('action', 'DELETE')
          .gte('created_at', new Date(new Date(deletedAt).getTime() - 2000).toISOString())
          .lte('created_at', new Date(new Date(deletedAt).getTime() + 2000).toISOString())

        if (itemLogs && itemLogs.length > 0) {
          const items = itemLogs.map((il: any) => {
            const { created_at: _ca, ...itemPayload } = il.old_data
            return itemPayload
          })
          const { error: itemsErr } = await supabase.from('credit_memo_items').insert(items)
          if (itemsErr) throw itemsErr
        }
      } else {
        const {
          id: _id, created_at: _ca, updated_at: _ua, deleted_at: _da,
          customers: _c, suppliers: _s, raw_materials: _r, packaging: _p,
          ...payload
        } = entry.old_data
        const { error } = await supabase.from(entry.table_name).insert([payload])
        if (error) throw error
      }

      setRestoreMsg('Restored successfully')
      setSelectedEntry(null)
      setTimeout(() => setRestoreMsg(''), 3000)
      fetchLogs()
    } catch (err: any) {
      setRestoreMsg(`Restore failed: ${err.message || String(err)}`)
    }
    setRestoring(null)
  }

  const allTables = Array.from(new Set(entries.map(e => e.table_name))).sort()

  const filtered = entries.filter(e => {
    if (filterTable  && e.table_name !== filterTable)    return false
    if (filterAction && e.action     !== filterAction)    return false
    if (dateFrom && e.created_at < dateFrom)              return false
    if (dateTo   && e.created_at > dateTo + 'T23:59:59') return false
    return true
  })

  const hasFilter = filterTable || filterAction || dateFrom || dateTo

  const sel: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
    fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer',
  }

  return (
    <MainLayout>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)} style={sel}>
            <option value=''>All Tables</option>
            {allTables.map(t => <option key={t} value={t}>{TABLE_LABELS[t] || t}</option>)}
          </select>

          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={sel}>
            <option value=''>All Actions</option>
            <option value='INSERT'>Insert</option>
            <option value='UPDATE'>Update</option>
            <option value='DELETE'>Delete</option>
          </select>

          <DatePicker value={dateFrom} onChange={setDateFrom} />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>–</span>
          <DatePicker value={dateTo} onChange={setDateTo} />

          {hasFilter && (
            <button onClick={() => { setFilterTable(''); setFilterAction(''); setDateFrom(''); setDateTo('') }}
              style={{ ...sel, background: '#f1f5f9', color: '#64748b' }}>
              Clear
            </button>
          )}
          <button onClick={fetchLogs} style={{ ...sel, color: '#374151' }}>Refresh</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {restoreMsg && (
            <span style={{ fontSize: '13px', fontWeight: '500', color: restoreMsg.startsWith('Restore failed') ? '#dc2626' : '#16a34a' }}>
              {restoreMsg}
            </span>
          )}
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>{filtered.length} entries</span>
        </div>
      </div>

      {/* RLS error banner */}
      {fetchError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', fontSize: '13px', color: '#dc2626' }}>
          <strong>Error loading activity log:</strong> {fetchError}
          <div style={{ color: '#7f1d1d', fontSize: '12px', marginTop: '6px' }}>
            Run this in the Supabase SQL Editor:{' '}
            <code style={{ background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
              ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
            </code>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <History size={32} color='#cbd5e1' style={{ display: 'block', margin: '0 auto 12px' }} />
          {fetchError ? 'Could not load records' : 'No activity records found'}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Date & Time', 'Table', 'Action', 'Summary', 'Restore'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => {
                const ac = ACTION_STYLE[entry.action] || ACTION_STYLE.UPDATE
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#fff' : '#fafafa',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}
                  >
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {toTorontoTime(entry.created_at)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#374151', fontWeight: '500' }}>
                      {TABLE_LABELS[entry.table_name] || entry.table_name}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ background: ac.bg, color: ac.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#1e293b', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getChangeSummary(entry)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {entry.action === 'DELETE' && entry.old_data && (
                        <button
                          onClick={e => { e.stopPropagation(); handleRestore(entry) }}
                          disabled={restoring === entry.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: restoring === entry.id ? '#f1f5f9' : '#eff6ff',
                            color:      restoring === entry.id ? '#94a3b8' : '#2563eb',
                            border: '1px solid #bfdbfe', borderRadius: '6px',
                            padding: '4px 10px', fontSize: '12px', fontWeight: '500',
                            cursor: restoring === entry.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <RotateCcw size={12} />
                          {restoring === entry.id ? '…' : 'Restore'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEntry && (
        <DetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onRestore={handleRestore}
          restoring={restoring}
        />
      )}
    </MainLayout>
  )
}
