'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, TrendingUp, DollarSign, Package, ShoppingCart, X, Download, Factory } from 'lucide-react'
import * as XLSX from 'xlsx'

interface MonthlySales {
  month: string
  revenue: number
  invoice_count: number
  total_qty: number
}

interface QuarterlySales {
  label: string
  months: string
  revenue: number
  invoice_count: number
  total_qty: number
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
  total_qty: number
  top_products: TopProduct[]
}

interface GroupedCustomerRow {
  key: string
  display_name: string
  invoice_count: number
  subtotal: number
  hst: number
  total: number
  total_qty: number
  is_group: boolean
  locations?: CustomerSalesRow[]
  top_products: TopProduct[]
}

interface MonthlyProduction {
  month: string
  units: number
  runs: number
}

interface ProductionByProduct {
  product_id: string
  sku: string
  name: string
  total_units: number
  runs: number
  avg_batch: number
}

const QUARTERS = [
  { label: 'Q1', months: 'Jan–Mar', indices: [0, 1, 2] },
  { label: 'Q2', months: 'Apr–Jun', indices: [3, 4, 5] },
  { label: 'Q3', months: 'Jul–Sep', indices: [6, 7, 8] },
  { label: 'Q4', months: 'Oct–Dec', indices: [9, 10, 11] },
]

function qoqChange(curr: number, prev: number): { text: string; up: boolean } | null {
  if (prev === 0) return null
  const pct = (curr - prev) / prev * 100
  return { text: (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(1) + '%', up: pct >= 0 }
}

export default function Reports() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total_revenue: 0, total_invoices: 0, total_units_sold: 0,
    avg_order_value: 0, paid_revenue: 0, unpaid_revenue: 0,
  })
  const [monthlySales, setMonthlySales]     = useState<MonthlySales[]>([])
  const [quarterlySales, setQuarterlySales] = useState<QuarterlySales[]>([])
  const [topProducts, setTopProducts]       = useState<TopProduct[]>([])

  const [csYear, setCsYear]       = useState(new Date().getFullYear())
  const [csStatus, setCsStatus]   = useState<'all' | 'paid' | 'sent'>('all')
  const [customerSales, setCustomerSales] = useState<GroupedCustomerRow[]>([])
  const [csLoading, setCsLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [drillDown, setDrillDown] = useState<GroupedCustomerRow | null>(null)

  const [prodYear, setProdYear] = useState(new Date().getFullYear())
  const [prodLoading, setProdLoading] = useState(false)
  const [prodStats, setProdStats] = useState({ total_units: 0, total_runs: 0, avg_batch: 0, most_produced: '—' })
  const [monthlyProduction, setMonthlyProduction] = useState<MonthlyProduction[]>([])
  const [prodByProduct, setProdByProduct] = useState<ProductionByProduct[]>([])
  const [quarterlyProduction, setQuarterlyProduction] = useState<{ label: string; months: string; units: number; runs: number }[]>([])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*, invoice_items(qty, unit_price_cad, line_total_cad, product_id, products(sku, name))')
      .gte('issued_at', `${year}-01-01`)
      .lte('issued_at', `${year}-12-31`)

    if (invoices) {
      const allItems = invoices.flatMap(inv => inv.invoice_items || []) as any[]
      const totalRevenue  = invoices.reduce((s, inv) => s + (inv.subtotal_cad || 0), 0)
      const paidRevenue   = invoices.filter(inv => inv.status === 'paid').reduce((s, inv) => s + (inv.subtotal_cad || 0), 0)
      const unpaidRevenue = invoices.filter(inv => inv.status !== 'paid').reduce((s, inv) => s + (inv.subtotal_cad || 0), 0)
      const totalUnits    = allItems.reduce((s, it) => s + (it.qty || 0), 0)
      setStats({
        total_revenue: totalRevenue, total_invoices: invoices.length, total_units_sold: totalUnits,
        avg_order_value: invoices.length > 0 ? totalRevenue / invoices.length : 0,
        paid_revenue: paidRevenue, unpaid_revenue: unpaidRevenue,
      })

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const mmap: Record<string, MonthlySales> = {}
      monthNames.forEach((m, i) => { mmap[String(i+1).padStart(2,'0')] = { month: m, revenue: 0, invoice_count: 0, total_qty: 0 } })
      invoices.forEach(inv => {
        const mo = inv.issued_at.substring(5, 7)
        if (mmap[mo]) {
          mmap[mo].revenue      += inv.subtotal_cad || 0
          mmap[mo].invoice_count += 1
          mmap[mo].total_qty    += (inv.invoice_items || []).reduce((s: number, it: any) => s + (it.qty || 0), 0)
        }
      })
      const monthly = monthNames.map((m, i) => mmap[String(i+1).padStart(2,'0')])
      setMonthlySales(monthly)

      setQuarterlySales(QUARTERS.map(q => ({
        label: q.label, months: q.months,
        revenue:       q.indices.reduce((s, i) => s + monthly[i].revenue, 0),
        invoice_count: q.indices.reduce((s, i) => s + monthly[i].invoice_count, 0),
        total_qty:     q.indices.reduce((s, i) => s + monthly[i].total_qty, 0),
      })))

      const pmap: Record<string, TopProduct> = {}
      allItems.forEach((it: any) => {
        if (!it.product_id) return
        if (!pmap[it.product_id]) pmap[it.product_id] = { sku: it.products?.sku || '', name: it.products?.name || '', total_qty: 0, total_revenue: 0 }
        pmap[it.product_id].total_qty     += it.qty || 0
        pmap[it.product_id].total_revenue += it.line_total_cad || 0
      })
      setTopProducts(Object.values(pmap).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10))
    }
    setLoading(false)
  }, [year])

  useEffect(() => { fetchReports() }, [fetchReports])

  const fetchCustomerSales = useCallback(async () => {
    setCsLoading(true)
    let query = supabase
      .from('invoices')
      .select('customer_id, subtotal_cad, tax_amount_cad, total_cad, status, customers(company_name), invoice_items(qty, line_total_cad, products(sku, name))')
      .gte('issued_at', `${csYear}-01-01`)
      .lte('issued_at', `${csYear}-12-31`)
    if (csStatus !== 'all') query = query.eq('status', csStatus)
    const { data } = await query

    type Builder = Omit<CustomerSalesRow, 'top_products'> & { _pmap: Record<string, TopProduct> }
    const bmap: Record<string, Builder> = {}
    for (const inv of data || []) {
      const id   = inv.customer_id
      const name = (inv.customers as any)?.company_name || 'Unknown'
      if (!bmap[id]) bmap[id] = { customer_id: id, company_name: name, invoice_count: 0, subtotal: 0, hst: 0, total: 0, total_qty: 0, _pmap: {} }
      bmap[id].invoice_count++
      bmap[id].subtotal += inv.subtotal_cad || 0
      bmap[id].hst      += inv.tax_amount_cad || 0
      bmap[id].total    += inv.total_cad || 0
      for (const it of (inv.invoice_items || []) as any[]) {
        bmap[id].total_qty += it.qty || 0
        const pKey = it.products?.sku || it.product_id || 'unknown'
        if (!bmap[id]._pmap[pKey]) bmap[id]._pmap[pKey] = { sku: it.products?.sku || '', name: it.products?.name || '', total_qty: 0, total_revenue: 0 }
        bmap[id]._pmap[pKey].total_qty     += it.qty || 0
        bmap[id]._pmap[pKey].total_revenue += it.line_total_cad || 0
      }
    }

    const rows: CustomerSalesRow[] = Object.values(bmap).map(b => {
      const { _pmap, ...rest } = b
      return { ...rest, top_products: Object.values(_pmap).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10) }
    })

    const heraRows    = rows.filter(r => r.company_name.startsWith('HERA BEAUTY')).sort((a, b) => b.total - a.total)
    const nonHeraRows = rows.filter(r => !r.company_name.startsWith('HERA BEAUTY'))

    const grouped: GroupedCustomerRow[] = nonHeraRows.map(r => ({
      key: r.customer_id, display_name: r.company_name,
      invoice_count: r.invoice_count, subtotal: r.subtotal, hst: r.hst, total: r.total,
      total_qty: r.total_qty, is_group: false, top_products: r.top_products,
    }))

    if (heraRows.length > 0) {
      const heraPmap: Record<string, TopProduct> = {}
      heraRows.forEach(r => r.top_products.forEach(p => {
        if (!heraPmap[p.sku]) heraPmap[p.sku] = { ...p }
        else { heraPmap[p.sku].total_qty += p.total_qty; heraPmap[p.sku].total_revenue += p.total_revenue }
      }))
      grouped.push({
        key: 'HERA_BEAUTY_GROUP', display_name: 'HERA BEAUTY (All Locations)',
        invoice_count: heraRows.reduce((s, r) => s + r.invoice_count, 0),
        subtotal:      heraRows.reduce((s, r) => s + r.subtotal, 0),
        hst:           heraRows.reduce((s, r) => s + r.hst, 0),
        total:         heraRows.reduce((s, r) => s + r.total, 0),
        total_qty:     heraRows.reduce((s, r) => s + r.total_qty, 0),
        is_group: true, locations: heraRows,
        top_products: Object.values(heraPmap).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10),
      })
    }

    grouped.sort((a, b) => b.total - a.total)
    setCustomerSales(grouped)
    setCsLoading(false)
  }, [csYear, csStatus])

  useEffect(() => { fetchCustomerSales() }, [fetchCustomerSales])

  const fetchProductionData = useCallback(async () => {
    setProdLoading(true)
    const { data } = await supabase
      .from('production_orders')
      .select('*, products(sku, name)')
      .gte('production_date', `${prodYear}-01-01`)
      .lte('production_date', `${prodYear}-12-31`)
      .eq('status', 'completed')

    if (data && data.length > 0) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const mProdMap: Record<string, { units: number; runs: number }> = {}
      monthNames.forEach((_, i) => { mProdMap[String(i+1).padStart(2,'0')] = { units: 0, runs: 0 } })

      const pmap: Record<string, { sku: string; name: string; total: number; runs: number }> = {}
      for (const o of data as any[]) {
        const mo = (o.production_date || '').substring(5, 7)
        if (mProdMap[mo]) {
          mProdMap[mo].units += o.quantity || 0
          mProdMap[mo].runs  += 1
        }
        if (o.product_id) {
          if (!pmap[o.product_id]) pmap[o.product_id] = { sku: o.products?.sku || '', name: o.products?.name || '', total: 0, runs: 0 }
          pmap[o.product_id].total += o.quantity || 0
          pmap[o.product_id].runs  += 1
        }
      }

      const monthly: MonthlyProduction[] = monthNames.map((m, i) => ({
        month: m,
        units: mProdMap[String(i+1).padStart(2,'0')].units,
        runs:  mProdMap[String(i+1).padStart(2,'0')].runs,
      }))
      setMonthlyProduction(monthly)

      const totalUnits = (data as any[]).reduce((s, o) => s + (o.quantity || 0), 0)
      const totalRuns  = data.length
      const mostProduced = Object.values(pmap).sort((a, b) => b.total - a.total)[0]
      setProdStats({
        total_units:   totalUnits,
        total_runs:    totalRuns,
        avg_batch:     totalRuns > 0 ? Math.round(totalUnits / totalRuns) : 0,
        most_produced: mostProduced ? `${mostProduced.sku} (${mostProduced.total.toLocaleString()} units)` : '—',
      })

      setProdByProduct(
        Object.entries(pmap).map(([id, p]) => ({
          product_id: id,
          sku: p.sku,
          name: p.name,
          total_units: p.total,
          runs: p.runs,
          avg_batch: p.runs > 0 ? Math.round(p.total / p.runs) : 0,
        })).sort((a, b) => b.total_units - a.total_units).slice(0, 10)
      )

      setQuarterlyProduction(QUARTERS.map(q => ({
        label: q.label, months: q.months,
        units: q.indices.reduce((s, i) => s + monthly[i].units, 0),
        runs:  q.indices.reduce((s, i) => s + monthly[i].runs, 0),
      })))
    } else {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      setMonthlyProduction(monthNames.map(m => ({ month: m, units: 0, runs: 0 })))
      setProdStats({ total_units: 0, total_runs: 0, avg_batch: 0, most_produced: '—' })
      setProdByProduct([])
      setQuarterlyProduction(QUARTERS.map(q => ({ label: q.label, months: q.months, units: 0, runs: 0 })))
    }
    setProdLoading(false)
  }, [prodYear])

  useEffect(() => { fetchProductionData() }, [fetchProductionData])

  const maxRevenue      = Math.max(...monthlySales.map(m => m.revenue), 1)
  const maxQRevenue     = Math.max(...quarterlySales.map(q => q.revenue), 1)
  const maxProdMonthly  = Math.max(...monthlyProduction.map(m => m.units), 1)
  const maxQProdUnits   = Math.max(...quarterlyProduction.map(q => q.units), 1)

  const yearBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', border: '1px solid #e2e8f0', borderRadius: '6px',
    background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#64748b',
    cursor: 'pointer', fontSize: '13px', fontWeight: '500',
  })

  async function handleRevenueExport() {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number, customers(company_name), issued_at, subtotal_cad, tax_amount_cad, total_cad, currency, status')
      .gte('issued_at', `${year}-01-01`)
      .lte('issued_at', `${year}-12-31`)
      .order('issued_at', { ascending: true })
    const rows = (data || []).map((inv: any) => ({
      'Invoice No': inv.invoice_number,
      'Customer': inv.customers?.company_name || '',
      'Date': inv.issued_at,
      'Subtotal': inv.subtotal_cad || 0,
      'Tax': inv.tax_amount_cad || 0,
      'Total': inv.total_cad || 0,
      'Currency': inv.currency || 'CAD',
      'Status': inv.status || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Revenue ${year}`)
    XLSX.writeFile(wb, `revenue_${year}.xlsx`)
  }

  return (
    <MainLayout>
      {/* Year selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[2024, 2025, 2026].map(y => (
            <button key={y} onClick={() => setYear(y)} style={yearBtnStyle(year === y)}>{y}</button>
          ))}
        </div>
        <button onClick={handleRevenueExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
          <Download size={14} /> Export Revenue Report
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Revenue', value: `$${formatCurrency(stats.total_revenue)}`, sub: 'CAD (excl. tax)', icon: DollarSign, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Paid',          value: `$${formatCurrency(stats.paid_revenue)}`,   sub: 'Collected',      icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Unpaid',        value: `$${formatCurrency(stats.unpaid_revenue)}`, sub: 'Outstanding',    icon: ShoppingCart, color: '#d97706', bg: '#fffbeb' },
          { label: 'Invoices',      value: stats.total_invoices.toString(),            sub: `Avg $${formatCurrency(stats.avg_order_value)}`, icon: BarChart3, color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Units Sold',    value: stats.total_units_sold.toLocaleString(),    sub: 'Total units',    icon: Package,    color: '#0891b2', bg: '#ecfeff' },
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

      {/* Monthly chart + Top Products */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Monthly Revenue {year}</h3>
          {loading ? <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px' }}>
              {monthlySales.map(m => (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '500' }}>{m.revenue > 0 ? `$${(m.revenue/1000).toFixed(1)}k` : ''}</div>
                  <div style={{ width: '100%', height: `${Math.max((m.revenue/maxRevenue)*120, m.revenue>0?4:0)}px`, background: m.revenue>0?'#2563eb':'#e2e8f0', borderRadius: '4px 4px 0 0', minHeight: '2px' }} />
                  <div style={{ fontSize: '9px', color: '#94a3b8' }}>{m.month}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Top Products by Revenue</h3>
          {loading ? <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div>
          : topProducts.length === 0 ? <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>No sales data yet</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topProducts.map((p, i) => (
                <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: i<3?'#eff6ff':'#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600', color: i<3?'#2563eb':'#94a3b8', flexShrink: 0 }}>{i+1}</div>
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

      {/* Quarterly Revenue Breakdown */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Quarterly Revenue {year}</h3>
        {loading ? <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>Loading...</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {quarterlySales.map((q, qi) => {
              const prev   = qi > 0 ? quarterlySales[qi - 1] : null
              const change = prev ? qoqChange(q.revenue, prev.revenue) : null
              return (
                <div key={q.label} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{q.label}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{q.months}</div>
                    </div>
                    {change && (
                      <span style={{ fontSize: '11px', fontWeight: '600', color: change.up ? '#16a34a' : '#dc2626', background: change.up ? '#f0fdf4' : '#fef2f2', padding: '2px 7px', borderRadius: '20px' }}>
                        {change.text}
                      </span>
                    )}
                  </div>
                  <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', marginBottom: '12px' }}>
                    <div style={{ height: '100%', width: `${maxQRevenue > 0 ? (q.revenue / maxQRevenue) * 100 : 0}%`, background: q.revenue > 0 ? '#2563eb' : 'transparent', borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: q.revenue > 0 ? '#1e293b' : '#cbd5e1', marginBottom: '6px' }}>
                    {q.revenue > 0 ? `$${formatCurrency(q.revenue)}` : '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{q.invoice_count} invoices</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{q.total_qty.toLocaleString()} units</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Monthly Breakdown Table */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b' }}>Monthly Breakdown {year}</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Month', 'Invoices', 'Units', 'Revenue (CAD)', 'Avg Order Value'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlySales.map(m => (
              <tr key={m.month} style={{ borderBottom: '1px solid #f1f5f9', background: m.revenue > 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{m.month} {year}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.invoice_count || '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.total_qty > 0 ? m.total_qty.toLocaleString() : '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: m.revenue > 0 ? '600' : '400', color: m.revenue > 0 ? '#1e293b' : '#94a3b8' }}>{m.revenue > 0 ? `$${formatCurrency(m.revenue)}` : '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.invoice_count > 0 ? `$${formatCurrency(m.revenue / m.invoice_count)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Customer Sales */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Customer Sales {csYear}</h3>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Click a customer name to view product breakdown</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[2024, 2025, 2026].map(y => (
              <button key={y} onClick={() => setCsYear(y)} style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: csYear === y ? '#2563eb' : '#fff', color: csYear === y ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>{y}</button>
            ))}
            <select value={csStatus} onChange={e => setCsStatus(e.target.value as any)} style={{ height: '30px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0 10px', fontSize: '12px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none', marginLeft: '4px' }}>
              <option value='all'>All Status</option>
              <option value='paid'>Paid</option>
              <option value='sent'>Sent</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Customer', 'Invoices', 'Units', 'Subtotal', 'HST', 'Total', '% of Total', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Customer' || h === 'Invoices' || h === '' ? 'left' : 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csLoading ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
              ) : customerSales.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No sales data for {csYear}</td></tr>
              ) : (() => {
                const grandTotal = customerSales.reduce((s, r) => s + r.total, 0)
                return customerSales.flatMap(row => {
                  const pct        = grandTotal > 0 ? row.total / grandTotal * 100 : 0
                  const isExpanded = expandedGroups.has(row.key)
                  const mainRow = (
                    <tr key={row.key}
                      onClick={() => setDrillDown(row)}
                      style={{ borderBottom: '1px solid #f1f5f9', background: row.is_group ? '#f8fafc' : '#fff', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0f7ff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = row.is_group ? '#f8fafc' : '#fff' }}
                    >
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: row.is_group ? '600' : '400', color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationStyle: 'dotted' }}>
                        {row.display_name}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: '#64748b' }}>{row.invoice_count}</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: '#64748b' }}>{row.total_qty.toLocaleString()}</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: '#374151' }}>${formatCurrency(row.subtotal)}</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: '#64748b' }}>${formatCurrency(row.hst)}</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>${formatCurrency(row.total)}</td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: '#64748b' }}>{pct.toFixed(1)}%</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }} onClick={e => { if (row.is_group) e.stopPropagation() }}>
                        {row.is_group && (
                          <button
                            onClick={e => { e.stopPropagation(); setExpandedGroups(prev => { const n = new Set(prev); if (n.has(row.key)) n.delete(row.key); else n.add(row.key); return n }) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', fontSize: '11px' }}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                  if (!row.is_group || !isExpanded || !row.locations) return [mainRow]
                  const subRows = row.locations.map(loc => (
                    <tr key={loc.customer_id}
                      onClick={() => setDrillDown({ key: loc.customer_id, display_name: loc.company_name, invoice_count: loc.invoice_count, subtotal: loc.subtotal, hst: loc.hst, total: loc.total, total_qty: loc.total_qty, is_group: false, top_products: loc.top_products })}
                      style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0f7ff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                    >
                      <td style={{ padding: '8px 16px 8px 32px', fontSize: '12px', color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationStyle: 'dotted' }}>↳ {loc.company_name}</td>
                      <td style={{ padding: '8px 16px', fontSize: '12px', color: '#94a3b8' }}>{loc.invoice_count}</td>
                      <td style={{ padding: '8px 16px', fontSize: '12px', textAlign: 'right', color: '#94a3b8' }}>{loc.total_qty.toLocaleString()}</td>
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
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Total ({customerSales.length} customers)</td>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>{customerSales.reduce((s, r) => s + r.invoice_count, 0)}</td>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b', textAlign: 'right' }}>{customerSales.reduce((s, r) => s + r.total_qty, 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>${formatCurrency(customerSales.reduce((s, r) => s + r.subtotal, 0))}</td>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>${formatCurrency(customerSales.reduce((s, r) => s + r.hst, 0))}</td>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '700', color: '#1e293b', textAlign: 'right' }}>${formatCurrency(customerSales.reduce((s, r) => s + r.total, 0))}</td>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b', textAlign: 'right' }}>100%</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Production Report ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '32px 0 20px', paddingTop: '8px', borderTop: '2px solid #e2e8f0' }}>
        <Factory size={18} color='#d97706' />
        <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Production Report</h2>
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
          {[2024, 2025, 2026].map(y => (
            <button key={y} onClick={() => setProdYear(y)} style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: prodYear === y ? '#d97706' : '#fff', color: prodYear === y ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>{y}</button>
          ))}
        </div>
      </div>

      {/* Section 1: Yearly Production Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Units Produced', value: prodStats.total_units.toLocaleString(), sub: `Completed orders · ${prodYear}` },
          { label: 'Production Runs',      value: prodStats.total_runs.toString(),        sub: 'Total orders completed' },
          { label: 'Avg Batch Size',       value: prodStats.avg_batch.toLocaleString(),   sub: 'Units per run' },
          { label: 'Most Produced',        value: prodStats.most_produced,                sub: 'Top product by volume', wide: true },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0' }}>
            {prodLoading ? (
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
            ) : (
              <>
                <div style={{ fontSize: card.wide ? '14px' : '22px', fontWeight: '700', color: '#1e293b', marginBottom: '4px', wordBreak: 'break-word' }}>{card.value}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{card.label}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{card.sub}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Section 2 + 3: Monthly Chart + Production by Product */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Section 2: Monthly Production Chart */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Monthly Production {prodYear}</h3>
          {prodLoading ? <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px' }}>
              {monthlyProduction.map(m => (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '500' }}>
                    {m.units > 0 ? m.units.toLocaleString() : ''}
                  </div>
                  <div style={{ width: '100%', height: `${Math.max((m.units / maxProdMonthly) * 120, m.units > 0 ? 4 : 0)}px`, background: m.units > 0 ? '#d97706' : '#e2e8f0', borderRadius: '4px 4px 0 0', minHeight: '2px' }} />
                  <div style={{ fontSize: '9px', color: '#94a3b8' }}>{m.month}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3: Production by Product */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Production by Product (Top 10)</h3>
          {prodLoading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div>
          ) : prodByProduct.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>No production data for {prodYear}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['SKU', 'Product', 'Total Units', 'Runs', 'Avg Batch'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'SKU' || h === 'Product' ? 'left' : 'right', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prodByProduct.map((p, i) => (
                    <tr key={p.product_id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 10px', fontWeight: '600', color: '#374151', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{p.sku || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name?.replace(/^I AM PURE /i, '') || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>{p.total_units.toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>{p.runs}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>{p.avg_batch.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Quarterly Production */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Quarterly Production {prodYear}</h3>
        {prodLoading ? <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>Loading...</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {quarterlyProduction.map((q, qi) => {
              const prev   = qi > 0 ? quarterlyProduction[qi - 1] : null
              const change = prev ? qoqChange(q.units, prev.units) : null
              return (
                <div key={q.label} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{q.label}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{q.months}</div>
                    </div>
                    {change && (
                      <span style={{ fontSize: '11px', fontWeight: '600', color: change.up ? '#16a34a' : '#dc2626', background: change.up ? '#f0fdf4' : '#fef2f2', padding: '2px 7px', borderRadius: '20px' }}>
                        {change.text}
                      </span>
                    )}
                  </div>
                  <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', marginBottom: '12px' }}>
                    <div style={{ height: '100%', width: `${maxQProdUnits > 0 ? (q.units / maxQProdUnits) * 100 : 0}%`, background: q.units > 0 ? '#d97706' : 'transparent', borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: q.units > 0 ? '#1e293b' : '#cbd5e1', marginBottom: '6px' }}>
                    {q.units > 0 ? q.units.toLocaleString() : '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{q.units > 0 ? 'units produced' : 'No data'}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{q.runs > 0 ? `${q.runs} run${q.runs > 1 ? 's' : ''}` : ''}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Customer drill-down modal */}
      {drillDown && (
        <div onClick={() => setDrillDown(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{drillDown.display_name}</h2>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  {drillDown.invoice_count} invoices · {drillDown.total_qty.toLocaleString()} units · ${formatCurrency(drillDown.total)} total ({csYear})
                </div>
              </div>
              <button onClick={() => setDrillDown(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
              Top Products Sold (Top {Math.min(drillDown.top_products.length, 10)})
            </div>

            {drillDown.top_products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>No product data</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>#</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>SKU</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Product</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Units</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.top_products.map((p, i) => (
                    <tr key={p.sku || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 12px', color: i < 3 ? '#2563eb' : '#94a3b8', fontWeight: '600', fontSize: '12px' }}>{i + 1}</td>
                      <td style={{ padding: '9px 12px', color: '#374151', fontWeight: '500', fontFamily: 'monospace', fontSize: '12px' }}>{p.sku || '—'}</td>
                      <td style={{ padding: '9px 12px', color: '#64748b', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name?.replace(/^I AM PURE /i, '') || '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#374151', fontWeight: '500' }}>{p.total_qty.toLocaleString()}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>${formatCurrency(p.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  )
}
