'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { BarChart3, TrendingUp, DollarSign, Package, ShoppingCart } from 'lucide-react'

interface MonthlySales {
  month: string
  revenue: number
  invoice_count: number
}

interface TopProduct {
  sku: string
  name: string
  total_qty: number
  total_revenue: number
}

export default function Reports() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total_revenue: 0,
    total_invoices: 0,
    total_units_sold: 0,
    avg_order_value: 0,
    paid_revenue: 0,
    unpaid_revenue: 0,
  })
  const [monthlySales, setMonthlySales] = useState<MonthlySales[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    const { data: invoices } = await supabase
      .from('invoices')
      .select('*, invoice_items(qty, unit_price_cad, line_total_cad, product_id, products(sku, name))')
      .gte('issued_at', startDate)
      .lte('issued_at', endDate)

    if (invoices) {
      const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.subtotal_cad || 0), 0)
      const paidRevenue = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.subtotal_cad || 0), 0)
      const unpaidRevenue = invoices.filter(inv => inv.status !== 'paid').reduce((sum, inv) => sum + (inv.subtotal_cad || 0), 0)
      const totalUnits = invoices.flatMap(inv => inv.invoice_items || []).reduce((sum: number, item: {qty?: number}) => sum + (item.qty || 0), 0)

      setStats({
        total_revenue: totalRevenue,
        total_invoices: invoices.length,
        total_units_sold: totalUnits,
        avg_order_value: invoices.length > 0 ? totalRevenue / invoices.length : 0,
        paid_revenue: paidRevenue,
        unpaid_revenue: unpaidRevenue,
      })

      const monthlyMap: { [key: string]: MonthlySales } = {}
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      monthNames.forEach((m, i) => {
        monthlyMap[String(i + 1).padStart(2, '0')] = { month: m, revenue: 0, invoice_count: 0 }
      })
      invoices.forEach(inv => {
        const month = inv.issued_at.substring(5, 7)
        if (monthlyMap[month]) {
          monthlyMap[month].revenue += inv.subtotal_cad || 0
          monthlyMap[month].invoice_count += 1
        }
      })
      setMonthlySales(Object.values(monthlyMap))

      const productMap: { [key: string]: TopProduct } = {}
      invoices.flatMap(inv => inv.invoice_items || []).forEach((item: {product_id?: string, qty?: number, line_total_cad?: number, products?: {sku?: string, name?: string}}) => {
        if (!item.product_id) return
        const key = item.product_id
        if (!productMap[key]) {
          productMap[key] = { sku: item.products?.sku || '', name: item.products?.name || '', total_qty: 0, total_revenue: 0 }
        }
        productMap[key].total_qty += item.qty || 0
        productMap[key].total_revenue += item.line_total_cad || 0
      })
      setTopProducts(Object.values(productMap).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10))
    }
    setLoading(false)
  }, [year])

  useEffect(() => { fetchReports() }, [fetchReports])

  const maxRevenue = Math.max(...monthlySales.map(m => m.revenue), 1)

  return (
    <MainLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[2024, 2025, 2026].map(y => (
            <button key={y} onClick={() => setYear(y)} style={{ padding: '6px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: year === y ? '#2563eb' : '#fff', color: year === y ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Revenue', value: `$${stats.total_revenue.toFixed(2)}`, sub: 'CAD (excl. tax)', icon: DollarSign, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Paid', value: `$${stats.paid_revenue.toFixed(2)}`, sub: 'Collected', icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Unpaid', value: `$${stats.unpaid_revenue.toFixed(2)}`, sub: 'Outstanding', icon: ShoppingCart, color: '#d97706', bg: '#fffbeb' },
          { label: 'Invoices', value: stats.total_invoices.toString(), sub: `Avg $${stats.avg_order_value.toFixed(2)}`, icon: BarChart3, color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Units Sold', value: stats.total_units_sold.toLocaleString(), sub: 'Total units', icon: Package, color: '#0891b2', bg: '#ecfeff' },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>{card.value}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{card.label}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{card.sub}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Monthly Revenue {year}</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px' }}>
              {monthlySales.map(m => (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '500' }}>
                    {m.revenue > 0 ? `$${(m.revenue / 1000).toFixed(1)}k` : ''}
                  </div>
                  <div style={{ width: '100%', height: `${Math.max((m.revenue / maxRevenue) * 120, m.revenue > 0 ? 4 : 0)}px`, background: m.revenue > 0 ? '#2563eb' : '#e2e8f0', borderRadius: '4px 4px 0 0', minHeight: '2px' }} />
                  <div style={{ fontSize: '9px', color: '#94a3b8' }}>{m.month}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Top Products by Revenue</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div>
          ) : topProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>No sales data yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topProducts.map((p, i) => (
                <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: i < 3 ? '#eff6ff' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600', color: i < 3 ? '#2563eb' : '#94a3b8', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: '500', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sku}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.total_qty} units</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', flexShrink: 0 }}>${p.total_revenue.toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b' }}>Monthly Breakdown {year}</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Month', 'Invoices', 'Revenue (CAD)', 'Avg Order Value'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlySales.map(m => (
              <tr key={m.month} style={{ borderBottom: '1px solid #f1f5f9', background: m.revenue > 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{m.month} {year}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.invoice_count}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: m.revenue > 0 ? '600' : '400', color: m.revenue > 0 ? '#1e293b' : '#94a3b8' }}>{m.revenue > 0 ? `$${m.revenue.toFixed(2)}` : '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.invoice_count > 0 ? `$${(m.revenue / m.invoice_count).toFixed(2)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  )
}
