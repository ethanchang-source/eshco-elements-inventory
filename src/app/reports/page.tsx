'use client'

import { useEffect, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, TrendingUp, DollarSign, Package, ShoppingCart, X } from 'lucide-react'

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

interface ProductMarginRow {
  product_id: string
  sku: string
  name: string
  total_qty: number
  total_revenue: number
  avg_selling_price: number
  unit_cost: number
  total_cost: number
  gross_profit: number
  margin_pct: number
}

async function resolveItems(items: any[]): Promise<Map<string, { item_no: string; name: string; unit_cost: number }>> {
  const rawIds  = [...new Set(items.filter((i: any) => i.item_type === 'raw_material' && i.item_id).map((i: any) => i.item_id as string))]
  const packIds = [...new Set(items.filter((i: any) => i.item_type === 'packaging'    && i.item_id).map((i: any) => i.item_id as string))]
  const map = new Map<string, { item_no: string; name: string; unit_cost: number }>()
  const promises: Promise<void>[] = []
  if (rawIds.length > 0) promises.push(
    supabase.from('raw_materials').select('id, item_no, name, cost_per_unit_cad').in('id', rawIds)
      .then(({ data }) => { for (const r of data || []) map.set(r.id, { item_no: r.item_no || '', name: r.name || '', unit_cost: r.cost_per_unit_cad || 0 }) })
  )
  if (packIds.length > 0) promises.push(
    supabase.from('packaging').select('id, item_no, name, cost_cad').in('id', packIds)
      .then(({ data }) => { for (const p of data || []) map.set(p.id, { item_no: p.item_no || '', name: p.name || '', unit_cost: p.cost_cad || 0 }) })
  )
  await Promise.all(promises)
  return map
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
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total_revenue: 0, total_invoices: 0, total_units_sold: 0,
    avg_order_value: 0, paid_revenue: 0, unpaid_revenue: 0,
  })
  const [monthlySales, setMonthlySales]     = useState<MonthlySales[]>([])
  const [quarterlySales, setQuarterlySales] = useState<QuarterlySales[]>([])
  const [topProducts, setTopProducts]       = useState<TopProduct[]>([])

  const [csStatus, setCsStatus]   = useState<'all' | 'paid' | 'sent'>('all')
  const [customerSales, setCustomerSales] = useState<GroupedCustomerRow[]>([])
  const [csLoading, setCsLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [drillDown, setDrillDown] = useState<GroupedCustomerRow | null>(null)

  const [taxLoading, setTaxLoading] = useState(true)
  const [taxStats, setTaxStats] = useState({ collected: 0, paid: 0 })

  const [marginLoading, setMarginLoading] = useState(false)
  const [productMargins, setProductMargins] = useState<ProductMarginRow[]>([])
  const [grossSummary, setGrossSummary] = useState({ total_revenue: 0, total_cogs: 0, gross_profit: 0, gross_margin_pct: 0, total_expenses: 0, net_profit: 0 })

  const [expenseCatLoading, setExpenseCatLoading] = useState(false)
  const [expenseCatData, setExpenseCatData] = useState<{ category: string; months: number[]; total: number }[]>([])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*, invoice_items(qty, unit_price_cad, line_total_cad, item_id, item_type)')
      .gte('issued_at', `${selectedYear}-01-01`)
      .lte('issued_at', `${selectedYear}-12-31`)

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

      const itemMap = await resolveItems(allItems.filter((it: any) => it.item_id))
      const pmap: Record<string, TopProduct> = {}
      allItems.forEach((it: any) => {
        if (!it.item_id) return
        const info = itemMap.get(it.item_id)
        if (!pmap[it.item_id]) pmap[it.item_id] = { sku: info?.item_no || '', name: info?.name || '', total_qty: 0, total_revenue: 0 }
        pmap[it.item_id].total_qty     += it.qty || 0
        pmap[it.item_id].total_revenue += it.line_total_cad || 0
      })
      setTopProducts(Object.values(pmap).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10))
    }
    setLoading(false)
  }, [selectedYear])

  useEffect(() => { fetchReports() }, [fetchReports])

  const fetchCustomerSales = useCallback(async () => {
    setCsLoading(true)
    let query = supabase
      .from('invoices')
      .select('customer_id, subtotal_cad, tax_amount_cad, total_cad, status, customers(company_name), invoice_items(qty, line_total_cad, item_id, item_type)')
      .gte('issued_at', `${selectedYear}-01-01`)
      .lte('issued_at', `${selectedYear}-12-31`)
    if (csStatus !== 'all') query = query.eq('status', csStatus)
    const { data } = await query

    const allItemsCs = (data || []).flatMap((inv: any) => inv.invoice_items || []).filter((it: any) => it.item_id)
    const itemMapCs = await resolveItems(allItemsCs)

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
        const info = itemMapCs.get(it.item_id)
        const pKey = it.item_id || 'unknown'
        if (!bmap[id]._pmap[pKey]) bmap[id]._pmap[pKey] = { sku: info?.item_no || '', name: info?.name || '', total_qty: 0, total_revenue: 0 }
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
  }, [selectedYear, csStatus])

  useEffect(() => { fetchCustomerSales() }, [fetchCustomerSales])

  const fetchTaxData = useCallback(async () => {
    setTaxLoading(true)
    const [{ data: invData }, { data: cmData }, { data: expData }] = await Promise.all([
      supabase.from('invoices').select('tax_amount_cad').gte('issued_at', `${selectedYear}-01-01`).lte('issued_at', `${selectedYear}-12-31`),
      supabase.from('credit_memos').select('tax_amount_cad').gte('issued_at', `${selectedYear}-01-01`).lte('issued_at', `${selectedYear}-12-31`),
      supabase.from('expenses').select('sales_tax').gte('expense_date', `${selectedYear}-01-01`).lte('expense_date', `${selectedYear}-12-31`),
    ])
    const invTax = (invData || []).reduce((s, r) => s + (r.tax_amount_cad || 0), 0)
    const cmTax  = (cmData  || []).reduce((s, r) => s + (r.tax_amount_cad || 0), 0)
    const expTax = (expData || []).reduce((s, r) => s + (r.sales_tax || 0), 0)
    setTaxStats({ collected: invTax - cmTax, paid: expTax })
    setTaxLoading(false)
  }, [selectedYear])

  useEffect(() => { fetchTaxData() }, [fetchTaxData])

  const fetchMarginData = useCallback(async () => {
    setMarginLoading(true)
    const [{ data: items }, { data: expData }] = await Promise.all([
      supabase
        .from('invoice_items')
        .select('qty, unit_price_cad, line_total_cad, item_id, item_type, invoices!inner(issued_at, status)')
        .gte('invoices.issued_at', `${selectedYear}-01-01`)
        .lte('invoices.issued_at', `${selectedYear}-12-31`)
        .neq('invoices.status', 'draft'),
      supabase
        .from('expenses')
        .select('total_amount')
        .gte('expense_date', `${selectedYear}-01-01`)
        .lte('expense_date', `${selectedYear}-12-31`),
    ])

    const itemMapM = await resolveItems((items || []).filter((it: any) => it.item_id))

    const pmap: Record<string, ProductMarginRow> = {}
    for (const it of (items || []) as any[]) {
      if (!it.item_id) continue
      const info = itemMapM.get(it.item_id)
      if (!pmap[it.item_id]) {
        pmap[it.item_id] = {
          product_id: it.item_id,
          sku: info?.item_no || '',
          name: info?.name || '',
          total_qty: 0,
          total_revenue: 0,
          avg_selling_price: 0,
          unit_cost: info?.unit_cost || 0,
          total_cost: 0,
          gross_profit: 0,
          margin_pct: 0,
        }
      }
      pmap[it.item_id].total_qty += it.qty || 0
      pmap[it.item_id].total_revenue += it.line_total_cad || 0
    }

    const rows: ProductMarginRow[] = Object.values(pmap).map(r => {
      const avgSelling = r.total_qty > 0 ? r.total_revenue / r.total_qty : 0
      const totalCost = r.unit_cost * r.total_qty
      const grossProfit = r.total_revenue - totalCost
      const marginPct = r.total_revenue > 0 ? (grossProfit / r.total_revenue) * 100 : 0
      return { ...r, avg_selling_price: avgSelling, total_cost: totalCost, gross_profit: grossProfit, margin_pct: marginPct }
    }).sort((a, b) => a.sku.localeCompare(b.sku))

    setProductMargins(rows)

    const totalRevenue = rows.reduce((s, r) => s + r.total_revenue, 0)
    const totalCogs = rows.reduce((s, r) => s + r.total_cost, 0)
    const grossProfit = totalRevenue - totalCogs
    const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    const totalExpenses = (expData || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0)
    const netProfit = grossProfit - totalExpenses
    setGrossSummary({ total_revenue: totalRevenue, total_cogs: totalCogs, gross_profit: grossProfit, gross_margin_pct: grossMarginPct, total_expenses: totalExpenses, net_profit: netProfit })

    setMarginLoading(false)
  }, [selectedYear])

  useEffect(() => { fetchMarginData() }, [fetchMarginData])

  const fetchExpensesByCategory = useCallback(async () => {
    setExpenseCatLoading(true)
    const { data } = await supabase
      .from('expenses')
      .select('expense_date, category, total_amount')
      .gte('expense_date', `${selectedYear}-01-01`)
      .lte('expense_date', `${selectedYear}-12-31`)
    const map: Record<string, number[]> = {}
    for (const row of data || []) {
      const cat = row.category || '(No Category)'
      const mo = parseInt((row.expense_date || '').slice(5, 7)) - 1
      if (!map[cat]) map[cat] = Array(12).fill(0)
      map[cat][mo] += row.total_amount || 0
    }
    const rows = Object.entries(map)
      .map(([category, months]) => ({ category, months, total: months.reduce((s, v) => s + v, 0) }))
      .sort((a, b) => a.category.localeCompare(b.category))
    setExpenseCatData(rows)
    setExpenseCatLoading(false)
  }, [selectedYear])

  useEffect(() => { fetchExpensesByCategory() }, [fetchExpensesByCategory])

  const maxRevenue  = Math.max(...monthlySales.map(m => m.revenue), 1)
  const maxQRevenue = Math.max(...quarterlySales.map(q => q.revenue), 1)

  async function handleAnnualReport() {
    const PptxGenJS = (await import('pptxgenjs')).default
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'

    const GREEN = '2d5a27'
    const WHITE = 'FFFFFF'
    const DARK  = '1e293b'
    const GRAY  = '64748b'
    const LGRAY = 'f1f5f9'

    // Load logo as base64
    let logoData = ''
    try {
      const res = await fetch('/logo.png')
      const blob = await res.blob()
      logoData = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
    } catch { /* skip logo if unavailable */ }

    // ─── Slide 1: Cover ───
    const s1 = pptx.addSlide()
    s1.addText('', { x: 0, y: 0, w: '100%', h: 2.4, fill: { color: GREEN } })
    if (logoData) s1.addImage({ data: logoData, x: 0.5, y: 0.35, h: 1.6, w: 1.6 })
    s1.addText('iampure Beauty Inc.', { x: 0.5, y: 2.8, w: 12.3, fontSize: 26, fontFace: 'Arial', bold: true, color: DARK })
    s1.addText(`Annual Report ${selectedYear}`, { x: 0.5, y: 3.5, w: 12.3, fontSize: 44, fontFace: 'Arial', bold: true, color: GREEN })
    s1.addText('Confidential — Internal Use Only', { x: 0.5, y: 6.6, w: 12.3, fontSize: 11, fontFace: 'Arial', color: GRAY, italic: true })

    // ─── Slide 2: Revenue Summary ───
    const s2 = pptx.addSlide()
    s2.addText('', { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: GREEN } })
    s2.addText(`Revenue Summary — ${selectedYear}`, { x: 0.4, y: 0.18, w: 12.3, fontSize: 24, fontFace: 'Arial', bold: true, color: WHITE })
    const kpis = [
      { label: 'Total Revenue',  value: `$${formatCurrency(stats.total_revenue)} CAD` },
      { label: 'Paid Revenue',   value: `$${formatCurrency(stats.paid_revenue)} CAD` },
      { label: 'Unpaid Revenue', value: `$${formatCurrency(stats.unpaid_revenue)} CAD` },
      { label: 'Total Invoices', value: stats.total_invoices.toString() },
      { label: 'Avg Order Value',value: `$${formatCurrency(stats.avg_order_value)} CAD` },
      { label: 'Units Sold',     value: stats.total_units_sold.toLocaleString() },
    ]
    kpis.forEach((kpi, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const x = 0.4 + col * 4.2
      const y = 1.3 + row * 2.3
      s2.addText('', { x, y, w: 3.9, h: 1.9, fill: { color: LGRAY }, line: { color: 'e2e8f0', pt: 1 } })
      s2.addText(kpi.value, { x, y: y + 0.3, w: 3.9, fontSize: 22, fontFace: 'Arial', bold: true, color: GREEN, align: 'center' })
      s2.addText(kpi.label, { x, y: y + 1.2, w: 3.9, fontSize: 13, fontFace: 'Arial', color: GRAY, align: 'center' })
    })

    // ─── Slide 3: Monthly Revenue ───
    const s3 = pptx.addSlide()
    s3.addText('', { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: GREEN } })
    s3.addText(`Monthly Revenue — ${selectedYear}`, { x: 0.4, y: 0.18, w: 12.3, fontSize: 24, fontFace: 'Arial', bold: true, color: WHITE })
    const hdrOpts = { bold: true, color: WHITE, fill: { color: GREEN }, fontSize: 12, fontFace: 'Arial' }
    const monthRows = [
      [{ text: 'Month', options: hdrOpts }, { text: 'Revenue (CAD)', options: hdrOpts }, { text: 'Invoices', options: hdrOpts }, { text: 'Units', options: hdrOpts }],
      ...monthlySales.map((m, i) => {
        const bg = { color: i % 2 === 0 ? WHITE : LGRAY }
        return [
          { text: m.month, options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: `$${formatCurrency(m.revenue)}`, options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: m.invoice_count.toString(), options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: m.total_qty.toString(), options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
        ]
      }),
    ]
    s3.addTable(monthRows as any, { x: 0.4, y: 1.2, w: 12.4, rowH: 0.38, border: { color: 'e2e8f0', pt: 1 } })

    // ─── Slide 4: Quarterly Revenue ───
    const s4 = pptx.addSlide()
    s4.addText('', { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: GREEN } })
    s4.addText(`Quarterly Revenue — ${selectedYear}`, { x: 0.4, y: 0.18, w: 12.3, fontSize: 24, fontFace: 'Arial', bold: true, color: WHITE })
    const qRows = [
      [{ text: 'Quarter', options: hdrOpts }, { text: 'Period', options: hdrOpts }, { text: 'Revenue (CAD)', options: hdrOpts }, { text: 'Invoices', options: hdrOpts }, { text: 'Units Sold', options: hdrOpts }],
      ...quarterlySales.map((q, i) => {
        const bg = { color: i % 2 === 0 ? WHITE : LGRAY }
        return [
          { text: q.label, options: { fontSize: 16, fontFace: 'Arial', bold: true, color: GREEN, fill: bg } },
          { text: q.months, options: { fontSize: 16, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: `$${formatCurrency(q.revenue)}`, options: { fontSize: 16, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: q.invoice_count.toString(), options: { fontSize: 16, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: q.total_qty.toString(), options: { fontSize: 16, fontFace: 'Arial', color: DARK, fill: bg } },
        ]
      }),
    ]
    s4.addTable(qRows as any, { x: 0.4, y: 1.8, w: 12.4, rowH: 0.9, border: { color: 'e2e8f0', pt: 1 } })

    // ─── Slide 5: Top Products ───
    const s5 = pptx.addSlide()
    s5.addText('', { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: GREEN } })
    s5.addText(`Top Products — ${selectedYear}`, { x: 0.4, y: 0.18, w: 12.3, fontSize: 24, fontFace: 'Arial', bold: true, color: WHITE })
    const top10 = topProducts.slice(0, 10)
    const topProdRows = [
      [{ text: '#', options: hdrOpts }, { text: 'SKU', options: hdrOpts }, { text: 'Product', options: hdrOpts }, { text: 'Units Sold', options: hdrOpts }, { text: 'Revenue (CAD)', options: hdrOpts }],
      ...top10.map((p, i) => {
        const bg = { color: i % 2 === 0 ? WHITE : LGRAY }
        return [
          { text: (i + 1).toString(), options: { fontSize: 12, fontFace: 'Arial', color: GRAY, fill: bg } },
          { text: p.sku, options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: p.name, options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: p.total_qty.toLocaleString(), options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: `$${formatCurrency(p.total_revenue)}`, options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
        ]
      }),
    ]
    s5.addTable(topProdRows as any, { x: 0.4, y: 1.2, w: 12.4, rowH: 0.38, border: { color: 'e2e8f0', pt: 1 } })

    // ─── Slide 6: Customer Overview ───
    const s7 = pptx.addSlide()
    s7.addText('', { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: GREEN } })
    s7.addText(`Customer Overview — ${selectedYear}`, { x: 0.4, y: 0.18, w: 12.3, fontSize: 24, fontFace: 'Arial', bold: true, color: WHITE })
    const topCusts = customerSales.filter(c => c.total > 0).slice(0, 12)
    const custRows = [
      [{ text: 'Customer', options: hdrOpts }, { text: 'Invoices', options: hdrOpts }, { text: 'Units', options: hdrOpts }, { text: 'Revenue (CAD)', options: hdrOpts }],
      ...topCusts.map((c, i) => {
        const bg = { color: i % 2 === 0 ? WHITE : LGRAY }
        return [
          { text: c.display_name, options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: c.invoice_count.toString(), options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: c.total_qty.toLocaleString(), options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
          { text: `$${formatCurrency(c.total)}`, options: { fontSize: 12, fontFace: 'Arial', color: DARK, fill: bg } },
        ]
      }),
    ]
    s7.addTable(custRows as any, { x: 0.4, y: 1.2, w: 12.4, rowH: 0.38, border: { color: 'e2e8f0', pt: 1 } })

    await pptx.writeFile({ fileName: `iampure_annual_report_${selectedYear}.pptx` })
  }

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .reports-half-grid { grid-template-columns: 1fr !important; }
          .reports-quarter-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
      {/* Year selector + Export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>Year</label>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            style={{ height: '36px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', fontSize: '14px', fontWeight: '600', color: '#1e293b', background: '#fff', cursor: 'pointer', outline: 'none' }}
          >
            {Array.from({ length: 11 }, (_, i) => 2020 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button onClick={handleAnnualReport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2d5a27', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
          Export Annual Report (PPT)
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

      {/* Gross Profit Summary + Net Profit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {marginLoading ? (
          <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading profit summary...</div>
        ) : (
          <>
            {[
              { label: 'Total Revenue', value: `$${formatCurrency(grossSummary.total_revenue)}`, sub: `${selectedYear} invoiced`, bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
              { label: 'Total COGS', value: `$${formatCurrency(grossSummary.total_cogs)}`, sub: 'Cost of goods sold', bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
              { label: 'Gross Profit', value: `$${formatCurrency(grossSummary.gross_profit)}`, sub: 'Revenue − COGS', bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
              { label: 'Gross Margin %', value: `${grossSummary.gross_margin_pct.toFixed(1)}%`, sub: 'Gross profit / Revenue', bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
            ].map(card => (
              <div key={card.label} style={{ background: card.bg, borderRadius: '12px', padding: '16px 20px', border: `1px solid ${card.border}` }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: card.color, marginBottom: '4px' }}>{card.value}</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: card.color }}>{card.label}</div>
                <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '2px' }}>{card.sub}</div>
              </div>
            ))}
            <div style={{ background: grossSummary.net_profit >= 0 ? '#eff6ff' : '#fef2f2', borderRadius: '12px', padding: '16px 20px', border: `1px solid ${grossSummary.net_profit >= 0 ? '#bfdbfe' : '#fecaca'}` }}>
              <div style={{ fontSize: '20px', fontWeight: '700', color: grossSummary.net_profit >= 0 ? '#1d4ed8' : '#dc2626', marginBottom: '4px' }}>${formatCurrency(grossSummary.net_profit)}</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: grossSummary.net_profit >= 0 ? '#1e40af' : '#b91c1c' }}>Est. Net Profit</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Gross Profit − Expenses (${formatCurrency(grossSummary.total_expenses)})</div>
            </div>
          </>
        )}
      </div>

      {/* Expenses by Category */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Expenses by Category</h3>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>({selectedYear})</span>
        </div>
        {expenseCatLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
        ) : expenseCatData.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No expense data for {selectedYear}</div>
        ) : (() => {
          const monthlyTotals = Array(12).fill(0) as number[]
          expenseCatData.forEach(r => r.months.forEach((v, i) => { monthlyTotals[i] += v }))
          const grandTotal = monthlyTotals.reduce((s, v) => s + v, 0)
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          return (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#fff' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', position: 'sticky', left: 0, background: '#1e293b', zIndex: 2, whiteSpace: 'nowrap' }}>Category</th>
                    {monthNames.map(m => (
                      <th key={m} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>{m}</th>
                    ))}
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseCatData.map((row, idx) => (
                    <tr key={row.category} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '8px 14px', fontWeight: '600', color: '#1e293b', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#f8fafc', zIndex: 1, whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0' }}>{row.category}</td>
                      {row.months.map((v, i) => (
                        <td key={i} style={{ padding: '8px', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap' }}>{v > 0 ? `$${formatCurrency(v)}` : ''}</td>
                      ))}
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap' }}>{row.total > 0 ? `$${formatCurrency(row.total)}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#dbeafe', color: '#1e40af', fontWeight: '700' }}>
                    <td style={{ padding: '10px 14px', fontWeight: '700', position: 'sticky', left: 0, background: '#dbeafe', zIndex: 1, borderRight: '1px solid #bfdbfe' }}>TOTAL</td>
                    {monthlyTotals.map((v, i) => (
                      <td key={i} style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{v > 0 ? `$${formatCurrency(v)}` : ''}</td>
                    ))}
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>${formatCurrency(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })()}
      </div>

      {/* Tax Summary */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Tax Summary</h3>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{selectedYear}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {taxLoading ? (
            <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
          ) : (
            <>
              <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '18px 20px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#16a34a', marginBottom: '4px' }}>${formatCurrency(taxStats.collected)}</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#15803d' }}>Tax Collected (Net)</div>
                <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '2px' }}>Invoices - Credit Memos</div>
              </div>
              <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '18px 20px', border: '1px solid #fed7aa' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#c2410c', marginBottom: '4px' }}>${formatCurrency(taxStats.paid)}</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#ea580c' }}>Tax Paid (Expenses)</div>
                <div style={{ fontSize: '11px', color: '#fb923c', marginTop: '2px' }}>From expense records</div>
              </div>
              <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#1d4ed8', marginBottom: '4px' }}>${formatCurrency(taxStats.collected - taxStats.paid)}</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e40af' }}>Estimated Tax Owing</div>
                <div style={{ fontSize: '11px', color: '#60a5fa', marginTop: '2px' }}>Collected - Paid</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Monthly chart + Top Products */}
      <div className="reports-half-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Monthly Revenue {selectedYear}</h3>
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
                    <div style={{ fontSize: '12px', fontWeight: '500', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sku}{p.name ? ` - ${p.name.replace(/^ESHCO ELEMENTS /i, '')}` : ''}</div>
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
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Quarterly Revenue {selectedYear}</h3>
        {loading ? <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>Loading...</div> : (
          <div className="reports-quarter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
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
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b' }}>Monthly Breakdown {selectedYear}</h3>
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
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{m.month} {selectedYear}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.invoice_count || '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.total_qty > 0 ? m.total_qty.toLocaleString() : '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: m.revenue > 0 ? '600' : '400', color: m.revenue > 0 ? '#1e293b' : '#94a3b8' }}>{m.revenue > 0 ? `$${formatCurrency(m.revenue)}` : '-'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{m.invoice_count > 0 ? `$${formatCurrency(m.revenue / m.invoice_count)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Product Margin Analysis */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Product Margin Analysis {selectedYear}</h3>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Based on unit_cost_cad × units sold vs. actual revenue</div>
        </div>
        {marginLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
        ) : productMargins.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No sales data for {selectedYear}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['SKU', 'Product Name', 'Units Sold', 'Avg Selling Price', 'Unit Cost', 'Total Revenue', 'Total Cost', 'Gross Profit', 'Margin %'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'SKU' || h === 'Product Name' ? 'left' : 'right', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productMargins.map((r, i) => {
                  const marginColor = r.margin_pct >= 50 ? '#16a34a' : r.margin_pct >= 30 ? '#2563eb' : '#d97706'
                  const marginBg   = r.margin_pct >= 50 ? '#f0fdf4' : r.margin_pct >= 30 ? '#eff6ff' : '#fffbeb'
                  return (
                    <tr key={r.product_id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 14px', fontWeight: '600', color: '#374151', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{r.sku || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', color: '#1e293b', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', color: '#64748b' }}>{r.total_qty.toLocaleString()}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>${formatCurrency(r.avg_selling_price)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>${formatCurrency(r.unit_cost)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#1e293b', fontFamily: 'monospace' }}>${formatCurrency(r.total_revenue)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>${formatCurrency(r.total_cost)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: r.gross_profit >= 0 ? '#1e293b' : '#dc2626', fontFamily: 'monospace' }}>${formatCurrency(r.gross_profit)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <span style={{ background: marginBg, color: marginColor, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', fontFamily: 'monospace' }}>
                          {r.margin_pct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={2} style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Total ({productMargins.length} products)</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>{productMargins.reduce((s, r) => s + r.total_qty, 0).toLocaleString()}</td>
                  <td colSpan={2} />
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>${formatCurrency(grossSummary.total_revenue)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#374151', fontFamily: 'monospace' }}>${formatCurrency(grossSummary.total_cogs)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>${formatCurrency(grossSummary.gross_profit)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', fontFamily: 'monospace' }}>
                      {grossSummary.gross_margin_pct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Customer Sales */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Customer Sales {selectedYear}</h3>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Click a customer name to view product breakdown</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select value={csStatus} onChange={e => setCsStatus(e.target.value as any)} style={{ height: '30px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0 10px', fontSize: '12px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none' }}>
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
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No sales data for {selectedYear}</td></tr>
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

      {/* Customer drill-down modal */}
      {drillDown && (
        <div onClick={() => setDrillDown(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{drillDown.display_name}</h2>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  {drillDown.invoice_count} invoices · {drillDown.total_qty.toLocaleString()} units · ${formatCurrency(drillDown.total)} total ({selectedYear})
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
                        {p.name?.replace(/^ESHCO ELEMENTS /i, '') || '—'}
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
