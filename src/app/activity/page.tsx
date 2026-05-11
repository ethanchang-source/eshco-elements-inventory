'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'
import { History, RotateCcw } from 'lucide-react'

interface ActivityEntry {
  id: string
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data: any
  new_data: any
  created_at: string
}

const SOFT_DELETE_TABLES = ['invoices', 'customers', 'suppliers', 'products', 'purchase_orders', 'expenses', 'credit_memos']

const TABLE_LABELS: Record<string, string> = {
  invoices: 'Invoice',
  customers: 'Customer',
  suppliers: 'Supplier',
  products: 'Product',
  purchase_orders: 'Purchase Order',
  expenses: 'Expense',
  credit_memos: 'Credit Memo',
  raw_materials: 'Raw Material',
  packaging: 'Packaging',
}

function getRecordLabel(entry: ActivityEntry): string {
  const data = entry.old_data || entry.new_data
  if (!data) return entry.record_id.slice(0, 8)
  return (
    data.invoice_no || data.memo_no || data.po_number ||
    data.company_name || data.name || data.sku ||
    data.payee || entry.record_id.slice(0, 8)
  )
}

const ACTION_STYLE: Record<string, { bg: string; color: string }> = {
  DELETE: { bg: '#fef2f2', color: '#dc2626' },
  INSERT: { bg: '#f0fdf4', color: '#16a34a' },
  UPDATE: { bg: '#eff6ff', color: '#2563eb' },
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTable, setFilterTable] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreMsg, setRestoreMsg] = useState('')

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setEntries(data || [])
    setLoading(false)
  }

  async function handleRestore(entry: ActivityEntry) {
    setRestoring(entry.id)
    setRestoreMsg('')
    try {
      if (entry.action === 'DELETE') {
        if (SOFT_DELETE_TABLES.includes(entry.table_name)) {
          await supabase.from(entry.table_name).update({ deleted_at: null }).eq('id', entry.record_id)
        } else {
          await supabase.from(entry.table_name).upsert([{ ...entry.old_data }])
        }
      } else if (entry.action === 'UPDATE' && entry.old_data) {
        await supabase.from(entry.table_name).update(entry.old_data).eq('id', entry.record_id)
      }
      await logActivity(supabase, entry.table_name, entry.record_id, 'UPDATE',
        entry.new_data ?? entry.old_data, entry.old_data)
      setRestoreMsg(`Restored: ${getRecordLabel(entry)}`)
      fetchLogs()
    } catch (err) {
      console.error('restore error:', err)
      setRestoreMsg('Restore failed')
    }
    setRestoring(null)
  }

  const allTables = Array.from(new Set(entries.map(e => e.table_name))).sort()

  const filtered = entries.filter(e => {
    if (filterTable && e.table_name !== filterTable) return false
    if (filterAction && e.action !== filterAction) return false
    return true
  })

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .activity-table th:nth-child(4), .activity-table td:nth-child(4) { display: none; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff' }}>
            <option value=''>All Tables</option>
            {allTables.map(t => <option key={t} value={t}>{TABLE_LABELS[t] || t}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff' }}>
            <option value=''>All Actions</option>
            <option value='INSERT'>Insert</option>
            <option value='UPDATE'>Update</option>
            <option value='DELETE'>Delete</option>
          </select>
          <button onClick={fetchLogs} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
            Refresh
          </button>
        </div>
        <div style={{ display: 'flex', align: 'center', gap: '12px' }}>
          {restoreMsg && (
            <span style={{ fontSize: '13px', color: restoreMsg.startsWith('Restore failed') ? '#dc2626' : '#16a34a', fontWeight: '500' }}>{restoreMsg}</span>
          )}
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>{filtered.length} entries</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <History size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No activity yet
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table className="activity-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Date & Time', 'Table', 'Action', 'Record', 'Restore'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => {
                const ac = ACTION_STYLE[entry.action] || ACTION_STYLE.UPDATE
                const canRestore = entry.action === 'DELETE' || (entry.action === 'UPDATE' && !!entry.old_data)
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(entry.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#374151', fontWeight: '500' }}>
                      {TABLE_LABELS[entry.table_name] || entry.table_name}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ background: ac.bg, color: ac.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#1e293b', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getRecordLabel(entry)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {canRestore && (
                        <button
                          onClick={() => handleRestore(entry)}
                          disabled={restoring === entry.id}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: restoring === entry.id ? '#f1f5f9' : '#eff6ff', color: restoring === entry.id ? '#94a3b8' : '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '500', cursor: restoring === entry.id ? 'not-allowed' : 'pointer' }}
                        >
                          <RotateCcw size={12} />
                          {restoring === entry.id ? '...' : 'Restore'}
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
