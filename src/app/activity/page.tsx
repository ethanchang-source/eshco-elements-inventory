'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { History, RotateCcw } from 'lucide-react'

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

const ACTION_STYLE: Record<string, { bg: string; color: string }> = {
  INSERT: { bg: '#f0fdf4', color: '#16a34a' },
  UPDATE: { bg: '#eff6ff', color: '#2563eb' },
  DELETE: { bg: '#fef2f2', color: '#dc2626' },
}

function getIdentifier(entry: ActivityEntry): string {
  const d = entry.new_data || entry.old_data
  if (!d) return entry.record_id.slice(0, 8)
  switch (entry.table_name) {
    case 'invoices':        return d.invoice_no   || entry.record_id.slice(0, 8)
    case 'credit_memos':    return d.memo_no       || entry.record_id.slice(0, 8)
    case 'customers':       return d.company_name  || entry.record_id.slice(0, 8)
    case 'products':        return d.sku           || entry.record_id.slice(0, 8)
    case 'expenses':        return d.description   || d.payee || d.category || entry.record_id.slice(0, 8)
    case 'purchase_orders': return entry.record_id.slice(0, 8)
    case 'suppliers':       return d.name          || entry.record_id.slice(0, 8)
    default:                return d.name || d.item_no || entry.record_id.slice(0, 8)
  }
}

function getChangeSummary(entry: ActivityEntry): string {
  if (entry.action === 'INSERT') {
    return 'New record created'
  }
  if (entry.action === 'DELETE') {
    return 'Record deleted'
  }
  // UPDATE: diff old vs new
  if (!entry.old_data || !entry.new_data) return '–'
  const skip = new Set(['updated_at', 'created_at'])
  const changes: string[] = []
  for (const key of Object.keys(entry.new_data)) {
    if (skip.has(key)) continue
    const oldVal = entry.old_data[key]
    const newVal = entry.new_data[key]
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push(`${key}: ${String(oldVal ?? '–')} → ${String(newVal ?? '–')}`)
    }
  }
  return changes.length > 0 ? changes.join(', ') : 'No change'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

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

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    setFetchError('')
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    console.log('activity_log count:', data?.length, 'error:', error)

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
      const { id: _id, created_at: _ca, deleted_at: _da, updated_at: _ua,
              customers: _c, suppliers: _s, raw_materials: _r, packaging: _p,
              ...payload } = entry.old_data
      const { error } = await supabase.from(entry.table_name).insert([payload])
      if (error) throw error
      setRestoreMsg('Restored successfully')
      setTimeout(() => setRestoreMsg(''), 3000)
      fetchLogs()
    } catch (err: any) {
      setRestoreMsg(`Restore failed: ${err.message || String(err)}`)
    }
    setRestoring(null)
  }

  const allTables = Array.from(new Set(entries.map(e => e.table_name))).sort()

  const filtered = entries.filter(e => {
    if (filterTable  && e.table_name !== filterTable)  return false
    if (filterAction && e.action     !== filterAction)  return false
    if (dateFrom && e.created_at < dateFrom)            return false
    if (dateTo   && e.created_at > dateTo + 'T23:59:59') return false
    return true
  })

  const hasFilter = filterTable || filterAction || dateFrom || dateTo

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
    fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer',
  }

  return (
    <MainLayout>
      <style>{`
        .act-table th, .act-table td { padding: 10px 14px; }
        @media (max-width: 640px) {
          .act-col-changes { display: none; }
        }
      `}</style>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Table filter */}
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)} style={selectStyle}>
            <option value=''>All Tables</option>
            {allTables.map(t => <option key={t} value={t}>{TABLE_LABELS[t] || t}</option>)}
          </select>

          {/* Action filter */}
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selectStyle}>
            <option value=''>All Actions</option>
            <option value='INSERT'>Insert</option>
            <option value='UPDATE'>Update</option>
            <option value='DELETE'>Delete</option>
          </select>

          {/* Date range */}
          <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ ...selectStyle, color: dateFrom ? '#1e293b' : '#94a3b8' }} />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>–</span>
          <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ ...selectStyle, color: dateTo ? '#1e293b' : '#94a3b8' }} />

          {hasFilter && (
            <button onClick={() => { setFilterTable(''); setFilterAction(''); setDateFrom(''); setDateTo('') }}
              style={{ ...selectStyle, background: '#f1f5f9', color: '#64748b' }}>
              Clear
            </button>
          )}

          <button onClick={fetchLogs}
            style={{ ...selectStyle, color: '#374151' }}>
            Refresh
          </button>
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

      {/* Error banner */}
      {fetchError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', fontSize: '13px', color: '#dc2626' }}>
          <strong>Error loading activity log:</strong> {fetchError}
          <br />
          <span style={{ color: '#7f1d1d', fontSize: '12px' }}>
            Run in Supabase SQL Editor:{' '}
            <code style={{ background: '#fee2e2', padding: '1px 6px', borderRadius: '4px' }}>
              ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
            </code>
          </span>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading…</div>
      ) : filtered.length === 0 && !fetchError ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <History size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No activity found
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table className='act-table' style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Date & Time', 'Table', 'Action', 'Identifier', 'Changes', 'Restore'].map(h => (
                  <th key={h} className={h === 'Changes' ? 'act-col-changes' : ''}
                    style={{ textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => {
                const ac = ACTION_STYLE[entry.action] || ACTION_STYLE.UPDATE
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td style={{ fontSize: '12px', color: '#374151', fontWeight: '500' }}>
                      {TABLE_LABELS[entry.table_name] || entry.table_name}
                    </td>
                    <td>
                      <span style={{ background: ac.bg, color: ac.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#1e293b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getIdentifier(entry)}
                    </td>
                    <td className='act-col-changes' style={{ fontSize: '11px', color: '#64748b', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getChangeSummary(entry)}
                    </td>
                    <td>
                      {entry.action === 'DELETE' && entry.old_data && (
                        <button
                          onClick={() => handleRestore(entry)}
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
    </MainLayout>
  )
}
