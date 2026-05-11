'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
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

interface CustomerSalesRow {
  customer_id: string
  company_name: string
  invoice_count: number
  subtotal: number
  hst: number
  total: number
}

interface GroupedCustomerRow {
  key: string
  display_name: string
  invoice_count: number
  subtotal: number
  hst: number
  total: number
  is_group: boolean
  locations?: CustomerSalesRow[]
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

  const [csYear, setCsYear] = useState(new Date().getFullYear())
  const [csStatus, setCsStatus] = useState<'all' | 'paid' | 'sent'>('all')
  const [customerSales, setCustomerSales] = useState<GroupedCustomerRow[]>([])
  const [csLoading, setCsLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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

  const fetchCustomerSales = useCallback(async () => {
    setCsLoading(true)
    let query = supabase
      .from('invoices')
      .select('customer_id, subtotal_cad, tax_amount_cad, total_cad, status, customers(company_name)')
      .gte('issued_at', `${csYear}-01-01`)
      .lte('issued_at', `${csYear}-12-31`)
    if (csStatus !== 'all') query = query.eq('status', csStatus)
    const { data } = await query

    const map: Record<string, CustomerSalesRow> = {}
    for (const inv of data || []) {
      const id = inv.customer_id
      const name = (inv.customers as any)?.company_name || 'Unknown'
      if (!map[id]) map[id] = { customer_id: id, company_name: name, invoice_count: 0, subtotal: 0, hst: 0, total: 0 }
      map[id].invoice_count++
      map[id].subtotal += inv.subtotal_cad || 0
      map[id].hst += inv.tax_amount_cad || 0
      map[id].total += inv.total_cad || 0
    }

    const rows = Object.values(map)
    const heraRows = rows.filter(r => r.company_name.startsWith('HERA BEAUTY')).sort((a, b) => b.total - a.total)
    const nonHeraRows = rows.filter(r => !r.company_name.startsWith('HERA BEAUTY'))

    const grouped: GroupedCustomerRow[] = nonHeraRows.map(r => ({
      key: r.customer_id, display_name: r.company_name,
      invoice_count: r.invoice_count, subtotal: r.subtotal, hst: r.hst, total: r.total,
      is_group: false,
    }))

    if (heraRows.length > 0) {
      grouped.push({
        key: 'HERA_BEAUTY_GROUP',
        display_name: 'HERA BEAUTY (All Locations)',
        invoice_count: heraRows.reduce((s, r) => s + r.invoice_count, 0),
        subtotal: heraRows.reduce((s, r) => s + r.subtotal, 0),
        hst: heraRows.reduce((s, r) => s + r.hst, 0),
        total: heraRows.reduce((s, r) => s + r.total, 0),
        is_group: true,
        locations: heraRows,
      })
    }

    grouped.sort((a, b) => b.total - a.total)
    setCustomerSales(grouped)
    setCsLoading(false)
  }, [csYear, csStatus])

  useEffect(() => { fetchCustomerSales() }, [fetchCustomerSales])

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
          { label: 'Total Revenue', value: `$${formatCurrency(stats.total_revenue)}`, sub: 'CAD (excl. tax)', icon: DollarSign, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Paid', value: `$${formatCurrency(stats.paid_revenue)}`, sub: 'Collected', icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Unpaid', value: `$${formatCurrency(stats.unpaid_revenue)}`, sub: 'Outstanding', icon: ShoppingCart, color: '#d97706', bg: '#fffbeb' },
          { label: 'Invoices', value: stats.total_invoices.toString(), sub: `Avg $${formatCurrency(stats.avg_order_value)}`, icon: BarChart3, color: '#7c3aed', bg: '#f5f3ff' },
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
                    <div style={{ fontSize: '12px', fontWeight: '500', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sku}{p.name ? ` - ${p.name.replace(/^I AM PURE /i, '')}` : ''}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.total_qty} units</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', flexShrink: 0 }}>${formatCurrency(p.total_revenue)}</div>
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
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: m.revenue > 0 ? '600' : '400', color: m.revenue > 0 ? '#1e293b' : '#94a3b8' }}>{m.revenue > 0 ? `$${formatCurrency(m.revenue)}` : '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.invoice_count > 0 ? `$${formatCurrency(m.revenue / m.invoice_count)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Customer Sales Breakdown */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: '16px' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Customer Sales {csYear}</h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[2024, 2025, 2026].map(y => (
              <button key={y} onClick={() => setCsYear(y)} style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: csYear === y ? '#2563eb' : '#fff', color: csYear === y ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                {y}
              </button>
            ))}
            <select value={csStatus} onChange={e => setCsStatus(e.target.value as 'all' | 'paid' | 'sent')} style={{ height: '30px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0 10px', fontSize: '12px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none', marginLeft: '4px' }}>
              <option value='all'>All Status</option>
              <option value='paid'>Paid</option>
              <option value='sent'>Sent</option>
            </select>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Customer</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Invoices</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Subtotal</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>HST</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Total</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>% of Total</th>
              <th style={{ width: '36px' }} />
            </tr>
          </thead>
          <tbody>
            {csLoading ? (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : customerSales.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No sales data for {csYear}</td></tr>
            ) : (() => {
              const grandTotal = customerSales.reduce((s, r) => s + r.total, 0)
              return customerSales.flatMap(row => {
                const pct = grandTotal > 0 ? row.total / grandTotal * 100 : 0
                const isExpanded = expandedGroups.has(row.key)
                const mainRow = (
                  <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9', background: row.is_group ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: row.is_group ? '600' : '400', color: '#1e293b' }}>{row.display_name}</td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#64748b' }}>{row.invoice_count}</td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: '#374151' }}>${formatCurrency(row.subtotal)}</td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: '#64748b' }}>${formatCurrency(row.hst)}</td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>${formatCurrency(row.total)}</td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: '#64748b' }}>{pct.toFixed(1)}%</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {row.is_group && (
                        <button
                          onClick={() => setExpandedGroups(prev => {
                            const next = new Set(prev)
                            if (next.has(row.key)) next.delete(row.key); else next.add(row.key)
                            return next
                          })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', fontSize: '11px', lineHeight: 1 }}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
                if (!row.is_group || !isExpanded || !row.locations) return [mainRow]
                const subRows = row.locations.map(loc => (
                  <tr key={loc.customer_id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                    <td style={{ padding: '8px 16px 8px 32px', fontSize: '12px', color: '#64748b' }}>↳ {loc.company_name}</td>
                    <td style={{ padding: '8px 16px', fontSize: '12px', color: '#94a3b8' }}>{loc.invoice_count}</td>
                    <td style={{ padding: '8px 16px', fontSize: '12px', textAlign: 'right', color: '#94a3b8' }}>${formatCurrency(loc.subtotal)}</td>
                    <td style={{ padding: '8px 16px', fontSize: '12px', textAlign: 'right', color: '#94a3b8' }}>${formatCurrency(loc.hst)}</td>
                    <td style={{ padding: '8px 16px', fontSize: '12px', textAlign: 'right', color: '#64748b' }}>${formatCurrency(loc.total)}</td>
                    <td style={{ padding: '8px 16px', fontSize: '12px', textAlign: 'right', color: '#94a3b8' }}>{grandTotal > 0 ? (loc.total / grandTotal * 100).toFixed(1) : '0.0'}%</td>
                    <td />
                  </tr>
                ))
                return [mainRow, ...subRows]
              })
            })()}
          </tbody>
          {!csLoading && customerSales.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                  Total ({customerSales.length} customers)
                </td>
                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                  {customerSales.reduce((s, r) => s + r.invoice_count, 0)}
                </td>
                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>
                  ${formatCurrency(customerSales.reduce((s, r) => s + r.subtotal, 0))}
                </td>
                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>
                  ${formatCurrency(customerSales.reduce((s, r) => s + r.hst, 0))}
                </td>
                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '700', color: '#1e293b', textAlign: 'right' }}>
                  ${formatCurrency(customerSales.reduce((s, r) => s + r.total, 0))}
                </td>
                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b', textAlign: 'right' }}>100%</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </MainLayout>
  )
}
