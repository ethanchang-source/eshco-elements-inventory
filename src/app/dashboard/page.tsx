'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Package, FlaskConical, Factory, FileText, AlertTriangle, TrendingUp } from 'lucide-react'

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

export default function Dashboard() {
  const [stats, setStats] = useState({ products: 0, rawMaterials: 0, production: 0, invoices: 0 })
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([])
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDashboardData() }, [])

  async function fetchDashboardData() {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [
      { count: productCount },
      { count: rawMaterialCount },
      { data: productionData },
      { count: invoiceCount },
      { data: allActiveProducts },
      { data: recentInvData },
    ] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('raw_materials').select('*', { count: 'exact', head: true }),
      supabase.from('production_orders').select('qty_produced').gte('produced_at', monthStart),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).gte('issued_at', monthStart),
      supabase.from('products').select('id, sku, name, current_stock, reorder_threshold').eq('is_active', true).order('current_stock'),
      supabase.from('invoices').select('id, invoice_no, issued_at, total_cad, status, customers(company_name)').order('created_at', { ascending: false }).limit(5),
    ])

    const productionQty = (productionData || []).reduce((sum, o) => sum + (o.qty_produced || 0), 0)
    const lowStockItems = (allActiveProducts || []).filter(p => p.current_stock <= p.reorder_threshold)

    setStats({
      products: productCount || 0,
      rawMaterials: rawMaterialCount || 0,
      production: productionQty,
      invoices: invoiceCount || 0,
    })
    setLowStock(lowStockItems)
    setRecentInvoices(recentInvData || [])
    setLoading(false)
  }

  const statCards = [
    { title: 'Total Products', value: stats.products, subtitle: 'Active SKUs', icon: Package, color: '#2563eb', bg: '#eff6ff' },
    { title: 'Raw Materials', value: stats.rawMaterials, subtitle: 'In inventory', icon: FlaskConical, color: '#16a34a', bg: '#f0fdf4' },
    { title: 'Production', value: stats.production, subtitle: 'This month (units)', icon: Factory, color: '#d97706', bg: '#fffbeb' },
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
      `}</style>
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
              {lowStock.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.sku}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#dc2626' }}>{p.current_stock}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>min {p.reorder_threshold}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={18} color='#2563eb' />
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Recent Invoices</h2>
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
              {recentInvoices.map(inv => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{inv.invoice_no}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{(inv.customers as any)?.company_name} · {new Date(inv.issued_at).toLocaleDateString('en-CA')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>${inv.total_cad?.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: statusColor[inv.status] || '#64748b', fontWeight: '500', textTransform: 'capitalize' }}>{inv.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: '+ New Production', color: '#2563eb', href: '/production' },
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
