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

const ID_FIELDS = ['invoice_no', 'memo_no', 'company_name', 'sku', 'name', 'description']

function getIdentifier(entry: ActivityEntry): string {
  const d = entry.new_data || entry.old_data
  if (!d) return entry.record_id.slice(0, 8)
  for (const f of ID_FIELDS) {
    if (d[f]) return String(d[f])
  }
  return entry.record_id.slice(0, 8)
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
      const {
        id: _id, created_at: _ca, updated_at: _ua, deleted_at: _da,
        customers: _c, suppliers: _s, raw_materials: _r, packaging: _p,
        ...payload
      } = entry.old_data
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
    if (filterTable  && e.table_name !== filterTable)       return false
    if (filterAction && e.action     !== filterAction)       return false
    if (dateFrom && e.created_at < dateFrom)                 return false
    if (dateTo   && e.created_at > dateTo + 'T23:59:59')    return false
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

          <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ ...sel, color: dateFrom ? '#1e293b' : '#94a3b8' }} />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>–</span>
          <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ ...sel, color: dateTo ? '#1e293b' : '#94a3b8' }} />

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
            Supabase SQL Editor에서 실행하세요:{' '}
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
                {['Date & Time', 'Table', 'Action', 'Identifier', 'Restore'].map(h => (
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
                  <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#374151', fontWeight: '500' }}>
                      {TABLE_LABELS[entry.table_name] || entry.table_name}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ background: ac.bg, color: ac.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#1e293b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getIdentifier(entry)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
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
