'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Package, FileText, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react'

interface LowStockProduct {
  id: string
  sku: string
  name: string
  current_stock: number
  reorder_threshold: number
}

interface RecentInvoice {
  id: string
  invoice_no: string
  customers?: { company_name: string }
  issued_at: string
  total_cad: number
  status: string
}

const COLLAPSE_LIMIT = 5

export default function Dashboard() {
  const [stats, setStats] = useState({ materials: 0, invoices: 0 })
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([])
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showAllLowStock, setShowAllLowStock] = useState(false)
  const [showAllInvoices, setShowAllInvoices] = useState(false)

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [
      { data: rawMaterials },
      { data: packaging },
      { data: invoicesThisMonth },
      { data: allActiveProducts },
      { data: recentInvData },
    ] = await Promise.all([
      supabase.from('raw_materials').select('id'),
      supabase.from('packaging').select('id'),
      supabase.from('invoices').select('id').gte('issued_at', monthStart),
      supabase.from('products').select('id, sku, name, current_stock, reorder_threshold').eq('is_active', true).gt('reorder_threshold', 0).order('current_stock'),
      supabase.from('invoices').select('id, invoice_no, issued_at, total_cad, status, customers(company_name)').order('invoice_no', { ascending: false }).limit(50),
    ])

    const lowStockItems = (allActiveProducts || []).filter(p => p.reorder_threshold != null && p.reorder_threshold > 0 && p.current_stock <= p.reorder_threshold)

    setStats({
      materials: (rawMaterials?.length ?? 0) + (packaging?.length ?? 0),
      invoices: invoicesThisMonth?.length ?? 0,
    })
    setLowStock(lowStockItems)
    setRecentInvoices(recentInvData || [])
    setLastUpdated(new Date())
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchDashboardData()

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => fetchDashboardData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_materials' }, () => fetchDashboardData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packaging' }, () => fetchDashboardData(true))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchDashboardData])

  const statCards = [
    { title: 'Total Raw Materials + Packaging Items', value: stats.materials, subtitle: 'Active items', icon: Package, color: '#2563eb', bg: '#eff6ff' },
    { title: 'Invoices', value: stats.invoices, subtitle: 'This month', icon: FileText, color: '#7c3aed', bg: '#f5f3ff' },
  ]

  const statusColor: { [key: string]: string } = {
    draft: '#64748b',
    sent: '#2563eb',
    paid: '#16a34a',
  }

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 768px) {
          .dash-two-col { grid-template-columns: 1fr !important; }
          .dash-stat-cards { grid-template-columns: 1fr 1fr !important; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastUpdated && (
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Updated {lastUpdated.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: refreshing ? 'not-allowed' : 'pointer', fontSize: '13px', color: '#64748b' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>
      <div className="dash-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title} style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={24} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{loading ? '—' : card.value}</div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>{card.title}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{card.subtitle}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="dash-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <AlertTriangle size={18} color='#d97706' />
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Low Stock Alerts</h2>
            {lowStock.length > 0 && (
              <span style={{ background: '#fef3c7', color: '#d97706', borderRadius: '20px', padding: '2px 8px', fontSize: '12px', fontWeight: '600' }}>{lowStock.length}</span>
            )}
          </div>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
          ) : lowStock.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>
              <AlertTriangle size={32} color='#e2e8f0' />
              <p style={{ marginTop: '8px' }}>All products are well-stocked</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(showAllLowStock ? lowStock : lowStock.slice(0, COLLAPSE_LIMIT)).map(p => {
                const isOut = p.current_stock === 0
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: isOut ? '#fef2f2' : '#fffbeb', borderRadius: '8px', border: `1px solid ${isOut ? '#fecaca' : '#fde68a'}` }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.sku}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: isOut ? '#dc2626' : '#d97706' }}>Stock: {p.current_stock} units ({Math.floor(p.current_stock / 36)} boxes)</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Replenish At: {p.reorder_threshold} units ({Math.floor(p.reorder_threshold / 36)} boxes)</div>
                    </div>
                  </div>
                )
              })}
              {lowStock.length > COLLAPSE_LIMIT && (
                <button
                  onClick={() => setShowAllLowStock(v => !v)}
                  style={{ marginTop: '4px', background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: '500', cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
                >
                  {showAllLowStock ? 'Show less' : `Show all (${lowStock.length - COLLAPSE_LIMIT} more)`}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={18} color='#2563eb' />
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Recent Invoices</h2>
            {recentInvoices.length > 0 && (
              <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: '20px', padding: '2px 8px', fontSize: '12px', fontWeight: '600' }}>{recentInvoices.length}</span>
            )}
          </div>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
          ) : recentInvoices.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>
              <FileText size={32} color='#e2e8f0' />
              <p style={{ marginTop: '8px' }}>No invoices yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(showAllInvoices ? recentInvoices : recentInvoices.slice(0, COLLAPSE_LIMIT)).map(inv => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{inv.invoice_no}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{(inv.customers as any)?.company_name} · {new Date(inv.issued_at).toLocaleDateString('en-CA')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>${formatCurrency(inv.total_cad)}</div>
                    <div style={{ fontSize: '11px', color: statusColor[inv.status] || '#64748b', fontWeight: '500', textTransform: 'capitalize' }}>{inv.status}</div>
                  </div>
                </div>
              ))}
              {recentInvoices.length > COLLAPSE_LIMIT && (
                <button
                  onClick={() => setShowAllInvoices(v => !v)}
                  style={{ marginTop: '4px', background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: '500', cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
                >
                  {showAllInvoices ? 'Show less' : `Show all (${recentInvoices.length - COLLAPSE_LIMIT} more)`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: '+ New Invoice', color: '#16a34a', href: '/invoices' },
            { label: '+ Receive Stock', color: '#d97706', href: '/inventory' },
            { label: '+ Add Product', color: '#7c3aed', href: '/products' },
          ].map((action) => (
            <a key={action.label} href={action.href} style={{ background: action.color, color: '#fff', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
              {action.label}
            </a>
          ))}
        </div>
      </div>
    </MainLayout>
  )
}
