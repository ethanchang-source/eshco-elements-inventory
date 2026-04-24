'use client'

import MainLayout from '@/components/layout/MainLayout'
import { Package, FlaskConical, Factory, FileText, AlertTriangle, TrendingUp } from 'lucide-react'

const statCards = [
  { title: 'Total Products', value: '20', subtitle: 'Active SKUs', icon: Package, color: '#2563eb', bg: '#eff6ff' },
  { title: 'Raw Materials', value: '8', subtitle: 'In inventory', icon: FlaskConical, color: '#16a34a', bg: '#f0fdf4' },
  { title: 'Production', value: '0', subtitle: 'This month', icon: Factory, color: '#d97706', bg: '#fffbeb' },
  { title: 'Invoices', value: '0', subtitle: 'This month', icon: FileText, color: '#7c3aed', bg: '#f5f3ff' },
]

export default function Dashboard() {
  return (
    <MainLayout>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title} style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={24} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{card.value}</div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>{card.title}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{card.subtitle}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <AlertTriangle size={18} color='#d97706' />
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Low Stock Alerts</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>
            <AlertTriangle size={32} color='#e2e8f0' />
            <p style={{ marginTop: '8px' }}>No low stock alerts</p>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={18} color='#2563eb' />
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Recent Invoices</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>
            <FileText size={32} color='#e2e8f0' />
            <p style={{ marginTop: '8px' }}>No invoices yet</p>
          </div>
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
