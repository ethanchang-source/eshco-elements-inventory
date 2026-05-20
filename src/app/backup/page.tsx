'use client'

import { useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Database, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const TODAY = new Date().toISOString().slice(0, 10)

const fmtDate = (v: any) => (v ? String(v).slice(0, 10) : '')
const fmtNum = (v: any) => (v !== null && v !== undefined && v !== '' ? Number(v).toFixed(2) : '')

function sumIdx(rows: any[][], idx: number): number {
  return rows.reduce((s, r) => s + (Number(r[idx]) || 0), 0)
}

function makeAOASheet(headers: string[], dataRows: any[][], totalRow?: any[]) {
  const aoa: any[][] = [headers, ...dataRows]
  if (totalRow) aoa.push([], totalRow)
  return XLSX.utils.aoa_to_sheet(aoa)
}

async function fetchAll() {
  const [
    { data: invoicesRaw },
    { data: invoiceItemsRaw },
    { data: creditMemosRaw },
    { data: creditMemoItemsRaw },
    { data: customersRaw },
    { data: suppliersRaw },
    { data: rawMaterialsRaw },
    { data: packagingRaw },
    { data: expensesRaw },
    { data: purchaseOrdersRaw },
    { data: productionRaw, error: productionErr },
  ] = await Promise.all([
    supabase.from('invoices').select(`
      invoice_no, issued_at, status, currency,
      subtotal_cad, tax_amount_cad, total_cad,
      payment_date, delivery_date,
      customers (company_name)
    `).order('issued_at', { ascending: true }),
    supabase.from('invoice_items').select(`
      qty, unit_price_cad, line_total_cad,
      invoices (invoice_no),
      products (sku, name)
    `).order('id', { ascending: true }),
    supabase.from('credit_memos').select(`
      memo_no, issued_at, status,
      subtotal_cad, tax_amount_cad, total_cad, applied_date,
      customers (company_name)
    `).order('issued_at', { ascending: true }),
    supabase.from('credit_memo_items').select(`
      qty, unit_price_cad, line_total_cad,
      credit_memos (memo_no),
      products (sku, name)
    `).order('id', { ascending: true }),
    supabase.from('customers').select(`
      company_name,
      warehouse_address, city, province, postal_code,
      ship_to_address, ship_to_city, ship_to_province, ship_to_postal_code,
      bill_to_same_as_ship_to,
      contact_name, contact_email, contact_phone,
      payment_terms, currency, notes
    `).order('company_name', { ascending: true }),
    supabase.from('suppliers').select(`
      name, contact_name, contact_email, contact_phone, country, ship_to_address
    `).order('name', { ascending: true }),
    supabase.from('raw_materials').select(`
      item_no, name, unit, current_stock, cost_per_unit_cad, avg_cost_cad,
      reorder_threshold, max_capacity
    `).order('item_no', { ascending: true }),
    supabase.from('packaging').select(`
      item_no, name, type, current_stock, cost_cad, avg_cost_cad,
      reorder_threshold, max_capacity
    `).order('item_no', { ascending: true }),
    supabase.from('expenses').select(`
      expense_date, category, type, payee, description,
      amount_before_tax, sales_tax, total_amount, payment_method, currency
    `).order('expense_date', { ascending: true }),
    supabase.from('purchase_orders').select(`
      po_number, status, ordered_at, received_at,
      qty_ordered, qty_received, cost_total_cad, shipping_cad, notes,
      suppliers (name)
    `).order('ordered_at', { ascending: true }),
    supabase.from('production_orders').select(`
      produced_at, qty_produced, notes,
      products (sku, name)
    `).order('produced_at', { ascending: false }),
  ])

  console.log('production fetch:', productionRaw?.length, productionErr)

  return {
    invoices: invoicesRaw || [],
    invoiceItems: invoiceItemsRaw || [],
    creditMemos: creditMemosRaw || [],
    creditMemoItems: creditMemoItemsRaw || [],
    customers: customersRaw || [],
    suppliers: suppliersRaw || [],
    rawMaterials: rawMaterialsRaw || [],
    packaging: packagingRaw || [],
    expenses: expensesRaw || [],
    purchaseOrders: purchaseOrdersRaw || [],
    production: productionRaw || [],
  }
}

export default function BackupPage() {
  const [loading, setLoading] = useState(false)
  const [exportingKey, setExportingKey] = useState<string | null>(null)

  async function handleFullBackup() {
    setLoading(true)
    try {
      const { data: products } = await supabase
        .from('products')
        .select('sku, name, size_oz, barcode_upc, barcode_itf14, unit_cost_cad, price_whs_cad, msrp_cad, price_dist_cad, current_stock, reorder_threshold, is_active')
        .order('sku')

      console.log('=== BACKUP DEBUG ===')
      console.log('products count:', products?.length)
      console.log('first product:', products?.[0])

      if (!products || products.length === 0) {
        alert('No products data found!')
        return
      }

      const { invoices, invoiceItems, creditMemos, creditMemoItems, customers, suppliers, rawMaterials, packaging, expenses, purchaseOrders, production } = await fetchAll()
      const wb = XLSX.utils.book_new()

      // ── 1. Products ──
      const productHeaders = [
        'SKU', 'Name', 'Size (oz)', 'Barcode UPC', 'Barcode ITF-14',
        'MFG Cost (CAD)', 'WHS Price (CAD)', 'MSRP (CAD)', 'Dist Price (CAD)',
        'Stock (Units)', 'Stock (Boxes)', 'Replenish At', 'Max Capacity',
        'Total MFG Value', 'Total WHS Value', 'Active', 'Notes',
      ]
      const productRows = (products as any[]).map(p => [
        String(p.sku || ''),
        String(p.name || ''),
        Number(p.size_oz) || 0,
        String(p.barcode_upc || ''),
        String(p.barcode_itf14 || ''),
        Number(p.unit_cost_cad) || 0,
        Number(p.price_whs_cad) || 0,
        Number(p.msrp_cad) || 0,
        Number(p.price_dist_cad) || 0,
        Number(p.current_stock) || 0,
        Math.floor(Number(p.current_stock) / 36),
        Number(p.reorder_threshold) || 0,
        '',
        Number(p.current_stock) * Number(p.unit_cost_cad),
        Number(p.current_stock) * Number(p.price_whs_cad),
        p.is_active ? 'Yes' : 'No',
        '',
      ])

      console.log('productRows count:', productRows.length)
      console.log('first row:', productRows[0])

      const productTotalRow = [
        'TOTAL', '', '', '', '', '', '', '', '',
        productRows.reduce((s, r) => s + (r[9] || 0), 0),
        productRows.reduce((s, r) => s + (r[10] || 0), 0),
        '', '',
        productRows.reduce((s, r) => s + (r[13] || 0), 0),
        productRows.reduce((s, r) => s + (r[14] || 0), 0),
        '', '',
      ]
      const wsProducts = XLSX.utils.aoa_to_sheet([productHeaders, ...productRows, [], productTotalRow])
      XLSX.utils.book_append_sheet(wb, wsProducts, 'Products')

      // ── 2. Inventory - Finished Goods ──
      const fgInvHeaders = [
        'SKU', 'Name', 'Size (oz)',
        'Stock (Units)', 'Stock (Boxes)',
        'Replenish At (Units)', 'Replenish At (Boxes)',
        'Max Capacity (Units)', 'Max Capacity (Boxes)',
        'MFG Cost (CAD)', 'Total MFG Value',
        'WHS Price (CAD)', 'Total WHS Value',
      ]
      const fgInvRows = (products as any[]).map(p => [
        String(p.sku || ''),
        String(p.name || ''),
        Number(p.size_oz) || 0,
        Number(p.current_stock) || 0,
        Math.floor(Number(p.current_stock) / 36),
        Number(p.reorder_threshold) || 0,
        Math.floor(Number(p.reorder_threshold) / 36),
        '',
        '',
        Number(p.unit_cost_cad) || 0,
        Number(p.current_stock) * Number(p.unit_cost_cad),
        Number(p.price_whs_cad) || 0,
        Number(p.current_stock) * Number(p.price_whs_cad),
      ])
      const fgInvTotalRow = [
        'TOTAL', '', '',
        fgInvRows.reduce((s, r) => s + (r[3] || 0), 0),
        fgInvRows.reduce((s, r) => s + (r[4] || 0), 0),
        '', '', '', '', '',
        fgInvRows.reduce((s, r) => s + (r[10] || 0), 0),
        '',
        fgInvRows.reduce((s, r) => s + (r[12] || 0), 0),
      ]
      const wsInv = XLSX.utils.aoa_to_sheet([fgInvHeaders, ...fgInvRows, [], fgInvTotalRow])
      XLSX.utils.book_append_sheet(wb, wsInv, 'Inventory - Finished Goods')

      // ── 3. Inventory - Raw Materials ──
      const rmData = rawMaterials.map((r: any) => [
        r.item_no || '', r.name || '', r.unit || '',
        r.current_stock ?? 0, r.cost_per_unit_cad ?? 0, r.avg_cost_cad ?? 0,
        r.reorder_threshold ?? '', r.max_capacity ?? '',
        (r.cost_per_unit_cad || 0) * (r.current_stock || 0),
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Item No', 'Name', 'Unit', 'Stock', 'Cost/Unit (CAD)', 'Avg Cost (CAD)', 'Reorder At', 'Max Capacity', 'Total Value'],
        rmData,
        ['TOTAL', '', '', sumIdx(rmData, 3), '', '', '', '', sumIdx(rmData, 8)]
      ), 'Inventory - Raw Materials')

      // ── 4. Inventory - Packaging ──
      const pkgData = packaging.map((p: any) => [
        p.item_no || '', p.name || '', p.type || '',
        p.current_stock ?? 0, p.cost_cad ?? 0, p.avg_cost_cad ?? 0,
        p.reorder_threshold ?? '', p.max_capacity ?? '',
        (p.cost_cad || 0) * (p.current_stock || 0),
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Item No', 'Name', 'Type', 'Stock', 'Cost (CAD)', 'Avg Cost (CAD)', 'Reorder At', 'Max Capacity', 'Total Value'],
        pkgData,
        ['TOTAL', '', '', sumIdx(pkgData, 3), '', '', '', '', sumIdx(pkgData, 8)]
      ), 'Inventory - Packaging')

      // ── 5. Production History ──
      const productionHeaders = ['Production Date', 'SKU', 'Product Name', 'Qty (Units)', 'Qty (Boxes)', 'Notes']
      const productionRows = (production as any[]).map(p => [
        p.produced_at ? new Date(p.produced_at).toLocaleDateString('en-CA') : '',
        p.products?.sku ?? '',
        p.products?.name ?? '',
        Number(p.qty_produced) || 0,
        Math.floor((Number(p.qty_produced) || 0) / 36),
        p.notes ?? '',
      ])
      const productionTotalRow = [
        'TOTAL', '', '',
        productionRows.reduce((s, r) => s + (r[3] || 0), 0),
        productionRows.reduce((s, r) => s + (r[4] || 0), 0),
        '',
      ]
      const wsProduction = XLSX.utils.aoa_to_sheet([productionHeaders, ...productionRows, [], productionTotalRow])
      XLSX.utils.book_append_sheet(wb, wsProduction, 'Production History')

      // ── 6. Invoices (CAD) ──
      const invHeaders = ['Invoice No', 'Date', 'Status', 'Currency', 'Customer Name', 'Subtotal (CAD)', 'Tax (CAD)', 'Total (CAD)', 'Payment Date', 'Delivery Date']
      const invCADData = invoices.filter((i: any) => i.currency !== 'USD').map((i: any) => [
        i.invoice_no || '', fmtDate(i.issued_at), i.status || '', i.currency || 'CAD',
        i.customers?.company_name || '',
        i.subtotal_cad ?? 0, i.tax_amount_cad ?? 0, i.total_cad ?? 0,
        fmtDate(i.payment_date), fmtDate(i.delivery_date),
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(invHeaders, invCADData,
        ['TOTAL', '', '', '', '', sumIdx(invCADData, 5), sumIdx(invCADData, 6), sumIdx(invCADData, 7), '', '']
      ), 'Invoices (CAD)')

      // ── 7. Invoices (USD) ──
      const invUSDData = invoices.filter((i: any) => i.currency === 'USD').map((i: any) => [
        i.invoice_no || '', fmtDate(i.issued_at), i.status || '', i.currency || 'USD',
        i.customers?.company_name || '',
        i.subtotal_cad ?? 0, i.tax_amount_cad ?? 0, i.total_cad ?? 0,
        fmtDate(i.payment_date), fmtDate(i.delivery_date),
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(invHeaders, invUSDData,
        ['TOTAL', '', '', '', '', sumIdx(invUSDData, 5), '', sumIdx(invUSDData, 7), '', '']
      ), 'Invoices (USD)')

      // ── 8. Invoice Items ──
      const iiData = invoiceItems.map((item: any) => [
        item.invoices?.invoice_no || '', item.products?.sku || '', item.products?.name || '',
        item.qty ?? 0, item.unit_price_cad ?? 0, item.line_total_cad ?? 0,
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Invoice No', 'SKU', 'Product Name', 'Qty', 'Unit Price (CAD)', 'Line Total (CAD)'],
        iiData,
        ['TOTAL', '', '', sumIdx(iiData, 3), '', sumIdx(iiData, 5)]
      ), 'Invoice Items')

      // ── 9. Credit Memos ──
      const cmData = creditMemos.map((m: any) => [
        m.memo_no || '', fmtDate(m.issued_at), m.status || '',
        m.customers?.company_name || '',
        m.subtotal_cad ?? 0, m.tax_amount_cad ?? 0, m.total_cad ?? 0,
        fmtDate(m.applied_date),
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Memo No', 'Date', 'Status', 'Customer Name', 'Subtotal (CAD)', 'Tax (CAD)', 'Total (CAD)', 'Applied Date'],
        cmData,
        ['TOTAL', '', '', '', sumIdx(cmData, 4), sumIdx(cmData, 5), sumIdx(cmData, 6), '']
      ), 'Credit Memos')

      // ── 10. Credit Memo Items ──
      const cmiData = creditMemoItems.map((item: any) => [
        item.credit_memos?.memo_no || '', item.products?.sku || '', item.products?.name || '',
        item.qty ?? 0, item.unit_price_cad ?? 0, item.line_total_cad ?? 0,
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Memo No', 'SKU', 'Product Name', 'Qty', 'Unit Price (CAD)', 'Line Total (CAD)'],
        cmiData,
        ['TOTAL', '', '', sumIdx(cmiData, 3), '', sumIdx(cmiData, 5)]
      ), 'Credit Memo Items')

      // ── 11. Customers ──
      const custData = customers.map((c: any) => [
        c.company_name || '', c.warehouse_address || '', c.city || '', c.province || '', c.postal_code || '',
        c.ship_to_address || '', c.ship_to_city || '', c.ship_to_province || '', c.ship_to_postal_code || '',
        c.bill_to_same_as_ship_to ? 'Yes' : 'No',
        c.contact_name || '', c.contact_email || '', c.contact_phone || '',
        c.payment_terms || '', c.currency || '', c.notes || '',
      ])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Company Name', 'Bill To Address', 'Bill To City', 'Bill To Province', 'Bill To Postal', 'Ship To Address', 'Ship To City', 'Ship To Province', 'Ship To Postal', 'Same Address', 'Contact Name', 'Email', 'Phone', 'Payment Terms', 'Currency', 'Notes'],
        ...custData,
      ]), 'Customers')

      // ── 12. Suppliers ──
      const suppData = suppliers.map((s: any) => [
        s.name || '', s.contact_name || '', s.contact_email || '', s.contact_phone || '',
        s.country || '', s.ship_to_address || '',
      ])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Name', 'Contact Name', 'Email', 'Phone', 'Country', 'Address'],
        ...suppData,
      ]), 'Suppliers')

      // ── 13. Expenses ──
      const expData = expenses.map((e: any) => [
        fmtDate(e.expense_date), e.category || '', e.type || '', e.payee || '', e.description || '',
        e.amount_before_tax ?? 0, e.sales_tax ?? 0, e.total_amount ?? 0,
        e.payment_method || '', e.currency || 'CAD',
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Date', 'Category', 'Type', 'Payee', 'Description', 'Amount Before Tax', 'Sales Tax', 'Total', 'Payment Method', 'Currency'],
        expData,
        ['TOTAL', '', '', '', '', sumIdx(expData, 5), sumIdx(expData, 6), sumIdx(expData, 7), '', '']
      ), 'Expenses')

      // ── 14. Purchase Orders ──
      const poData = purchaseOrders.map((po: any) => [
        po.po_number || '', po.status || '',
        fmtDate(po.ordered_at), fmtDate(po.received_at),
        po.suppliers?.name || '',
        po.qty_ordered ?? '', po.qty_received ?? '',
        po.cost_total_cad ?? 0, po.shipping_cad ?? 0,
        po.notes || '',
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['PO Number', 'Status', 'Ordered Date', 'Received Date', 'Supplier Name', 'Qty Ordered', 'Qty Received', 'Total Cost (CAD)', 'Shipping (CAD)', 'Notes'],
        poData,
        ['TOTAL', '', '', '', '', '', '', sumIdx(poData, 7), sumIdx(poData, 8), '']
      ), 'Purchase Orders')

      XLSX.writeFile(wb, `iampure_backup_${TODAY}.xlsx`)
    } finally {
      setLoading(false)
    }
  }

  async function exportExpenses() {
    setExportingKey('expenses')
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: true })
    const rows = (data || []).map((e: any) => ({
      'Date': fmtDate(e.expense_date),
      'Category': e.category || '',
      'Type': e.type || '',
      'Payee': e.payee || '',
      'Description': e.description || '',
      'Amount Before Tax': fmtNum(e.amount_before_tax),
      'Sales Tax': fmtNum(e.sales_tax),
      'Total': fmtNum(e.total_amount),
      'Payment Method': e.payment_method || '',
      'Currency': e.currency || 'CAD',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Expenses')
    XLSX.writeFile(wb, `expenses_${TODAY}.xlsx`)
    setExportingKey(null)
  }

  async function exportInvoices() {
    setExportingKey('invoices')
    const invFields = `
      invoice_no, issued_at, delivery_date, payment_date,
      subtotal_cad, tax_rate, tax_amount_cad, total_cad,
      status, currency, po_number, notes,
      customers (company_name)
    `
    const [{ data: invoicesCAD }, { data: invoicesUSD }, { data: creditMemos }] = await Promise.all([
      supabase.from('invoices').select(invFields).eq('currency', 'CAD').is('deleted_at', null).order('invoice_no'),
      supabase.from('invoices').select(invFields + ', wire_fee, received_amount').eq('currency', 'USD').is('deleted_at', null).order('invoice_no'),
      supabase.from('credit_memos').select(`
        memo_no, issued_at, applied_date,
        subtotal_cad, tax_rate, tax_amount_cad, total_cad,
        status, po_number, notes,
        customers (company_name)
      `).is('deleted_at', null).order('memo_no'),
    ])

    const cadHeaders = ['Invoice No', 'Customer', 'Date', 'Delivery Date', 'Payment Date', 'Subtotal', 'Tax Rate', 'Tax', 'Total', 'Status', 'PO#', 'Notes']
    const cadRows = (invoicesCAD || []).map((i: any) => [
      i.invoice_no || '', i.customers?.company_name || '',
      fmtDate(i.issued_at), fmtDate(i.delivery_date), fmtDate(i.payment_date),
      i.subtotal_cad ?? 0, i.tax_rate ?? 0, i.tax_amount_cad ?? 0, i.total_cad ?? 0,
      i.status || '', i.po_number || '', i.notes || '',
    ])

    const usdHeaders = ['Invoice No', 'Customer', 'Date', 'Delivery Date', 'Payment Date', 'Subtotal', 'Tax Rate', 'Tax', 'Total', 'Status', 'PO#', 'Notes', 'Wire Fee', 'Received Amount']
    const usdRows = (invoicesUSD || []).map((i: any) => [
      i.invoice_no || '', i.customers?.company_name || '',
      fmtDate(i.issued_at), fmtDate(i.delivery_date), fmtDate(i.payment_date),
      i.subtotal_cad ?? 0, i.tax_rate ?? 0, i.tax_amount_cad ?? 0, i.total_cad ?? 0,
      i.status || '', i.po_number || '', i.notes || '',
      i.wire_fee ?? 0, i.received_amount ?? 0,
    ])

    const cmHeaders = ['Memo No', 'Customer', 'Date', 'Applied Date', 'Subtotal', 'Tax Rate', 'Tax', 'Total', 'Status', 'PO#', 'Notes']
    const cmRows = (creditMemos || []).map((m: any) => [
      m.memo_no || '', m.customers?.company_name || '',
      fmtDate(m.issued_at), fmtDate(m.applied_date),
      m.subtotal_cad ?? 0, m.tax_rate ?? 0, m.tax_amount_cad ?? 0, m.total_cad ?? 0,
      m.status || '', m.po_number || '', m.notes || '',
    ])

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, makeAOASheet(cadHeaders, cadRows,
      ['TOTAL', '', '', '', '', sumIdx(cadRows, 5), '', sumIdx(cadRows, 7), sumIdx(cadRows, 8), '', '', '']
    ), 'Invoices (CAD)')
    XLSX.utils.book_append_sheet(wb, makeAOASheet(usdHeaders, usdRows,
      ['TOTAL', '', '', '', '', sumIdx(usdRows, 5), '', sumIdx(usdRows, 7), sumIdx(usdRows, 8), '', '', '', sumIdx(usdRows, 12), sumIdx(usdRows, 13)]
    ), 'Invoices (USD)')
    XLSX.utils.book_append_sheet(wb, makeAOASheet(cmHeaders, cmRows,
      ['TOTAL', '', '', '', sumIdx(cmRows, 4), '', sumIdx(cmRows, 6), sumIdx(cmRows, 7), '', '', '']
    ), 'Credit Memos')
    XLSX.writeFile(wb, `invoices_export_${TODAY}.xlsx`)
    setExportingKey(null)
  }

  async function exportProduction() {
    setExportingKey('production')
    const { data: production } = await supabase
      .from('production_orders')
      .select(`
        produced_at,
        qty_produced,
        notes,
        products (sku, name)
      `)
      .order('produced_at', { ascending: false })
    const productionRows = (production || []).map((p: any) => [
      p.produced_at ? new Date(p.produced_at).toLocaleDateString('en-CA') : '',
      p.products?.sku || '',
      p.products?.name || '',
      p.qty_produced || 0,
      Math.floor((p.qty_produced || 0) / 36),
      p.notes || '',
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, makeAOASheet(
      ['Production Date', 'SKU', 'Product Name', 'Qty (Units)', 'Qty (Boxes)', 'Notes'],
      productionRows,
      ['TOTAL', '', '', productionRows.reduce((s, r) => s + r[3], 0), productionRows.reduce((s, r) => s + r[4], 0), '']
    ), 'Production')
    XLSX.writeFile(wb, `production_${TODAY}.xlsx`)
    setExportingKey(null)
  }

  async function exportInventory() {
    setExportingKey('inventory')
    const [{ data: products }, { data: rawMaterials }, { data: packaging }] = await Promise.all([
      supabase.from('products').select('*').order('sku', { ascending: true }),
      supabase.from('raw_materials').select('*').order('item_no', { ascending: true }),
      supabase.from('packaging').select('*').order('item_no', { ascending: true }),
    ])
    const wb = XLSX.utils.book_new()
    const finishedRows = (products || []).map((p: any) => ({
      'SKU': p.sku, 'Name': p.name, 'Stock': p.current_stock,
      'MFG Cost': p.unit_cost_cad, 'WHS Price': p.price_whs_cad ?? '',
      'Total Value': (p.unit_cost_cad || 0) * (p.current_stock || 0),
    }))
    const rawRows = (rawMaterials || []).map((r: any) => ({
      'Item No': r.item_no, 'Name': r.name, 'Unit': r.unit, 'Stock': r.current_stock,
      'Cost/Unit': r.cost_per_unit_cad,
      'Total Value': (r.cost_per_unit_cad || 0) * (r.current_stock || 0),
    }))
    const packRows = (packaging || []).map((p: any) => ({
      'Item No': p.item_no, 'Name': p.name, 'Type': p.type, 'Stock': p.current_stock,
      'Cost': p.cost_cad, 'Total Value': (p.cost_cad || 0) * (p.current_stock || 0),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finishedRows), 'Finished Goods')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawRows), 'Raw Materials')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(packRows), 'Packaging')
    XLSX.writeFile(wb, `inventory_${TODAY}.xlsx`)
    setExportingKey(null)
  }

  async function exportCustomers() {
    setExportingKey('customers')
    const { data } = await supabase.from('customers').select('*').order('company_name', { ascending: true })
    const rows = (data || []).map((c: any) => ({
      'Company Name': c.company_name || '',
      'Bill To Address': c.warehouse_address || '',
      'Bill To City': c.city || '',
      'Bill To Province': c.province || '',
      'Bill To Postal': c.postal_code || '',
      'Ship To Address': c.ship_to_address || '',
      'Ship To City': c.ship_to_city || '',
      'Ship To Province': c.ship_to_province || '',
      'Ship To Postal': c.ship_to_postal_code || '',
      'Same Address': c.bill_to_same_as_ship_to ? 'Yes' : 'No',
      'Contact Name': c.contact_name || '',
      'Email': c.contact_email || '',
      'Phone': c.contact_phone || '',
      'Payment Terms': c.payment_terms || '',
      'Currency': c.currency || '',
      'Notes': c.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Customers')
    XLSX.writeFile(wb, 'customers.xlsx')
    setExportingKey(null)
  }

  async function exportSuppliers() {
    setExportingKey('suppliers')
    const { data } = await supabase.from('suppliers').select('*').order('name', { ascending: true })
    const rows = (data || []).map((s: any) => ({
      'Company Name': s.name,
      'Contact Name': s.contact_name || '',
      'Email': s.contact_email || '',
      'Phone': s.contact_phone || '',
      'Country': s.country || '',
      'Address': s.ship_to_address || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Suppliers')
    XLSX.writeFile(wb, 'suppliers.xlsx')
    setExportingKey(null)
  }

  async function exportPurchaseOrders() {
    setExportingKey('po')
    const { data } = await supabase.from('purchase_orders').select('*, suppliers(name)').order('ordered_at', { ascending: true })
    const rows = (data || []).map((po: any) => ({
      'PO Number': po.po_number || '',
      'Supplier': po.suppliers?.name || '',
      'Status': po.status || '',
      'Ordered At': fmtDate(po.ordered_at),
      'Shipped At': fmtDate(po.shipped_at),
      'Received At': fmtDate(po.received_at),
      'Cost Total CAD': fmtNum(po.cost_total_cad),
      'Shipping CAD': fmtNum(po.shipping_cad),
      'Brokerage CAD': fmtNum(po.brokerage_cad),
      'Duty CAD': fmtNum(po.duty_cad),
      'Notes': po.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchase Orders')
    XLSX.writeFile(wb, `purchase_orders_${TODAY}.xlsx`)
    setExportingKey(null)
  }

  async function exportProducts() {
    setExportingKey('products')
    const { data } = await supabase.from('products').select(`
      sku, name, size_oz,
      barcode_upc, barcode_itf14,
      unit_cost_cad, price_whs_cad, msrp_cad, price_dist_cad,
      current_stock, reorder_threshold,
      is_active
    `).order('sku', { ascending: true })
    // cols: SKU(0) Name(1) Size(2) UPC(3) ITF14(4) MFG Cost(5) WHS Price(6) MSRP(7) Dist Price(8) Stock Units(9) Stock Boxes(10) Replenish(11) Max(12) Total MFG(13) Total WHS(14) Active(15) Notes(16)
    const rows = (data || []).map((p: any) => [
      p.sku || '', p.name || '', p.size_oz ?? '',
      p.barcode_upc || '', p.barcode_itf14 || '',
      p.unit_cost_cad ?? 0, p.price_whs_cad ?? 0, p.msrp_cad ?? 0, p.price_dist_cad ?? 0,
      p.current_stock ?? 0, Math.floor((p.current_stock || 0) / 36),
      p.reorder_threshold ?? '', '',
      (p.unit_cost_cad || 0) * (p.current_stock || 0),
      (p.price_whs_cad || 0) * (p.current_stock || 0),
      p.is_active ? 'Yes' : 'No', '',
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, makeAOASheet(
      ['SKU', 'Name', 'Size (oz)', 'Barcode UPC', 'Barcode ITF-14', 'MFG Cost (CAD)', 'WHS Price (CAD)', 'MSRP (CAD)', 'Dist Price (CAD)', 'Stock (Units)', 'Stock (Boxes)', 'Replenish At (Units)', 'Max Capacity (Units)', 'Total MFG Value', 'Total WHS Value', 'Active', 'Notes'],
      rows,
      ['TOTAL', '', '', '', '', '', '', '', '', sumIdx(rows, 9), sumIdx(rows, 10), '', '', sumIdx(rows, 13), sumIdx(rows, 14), '', '']
    ), 'Products')
    XLSX.writeFile(wb, `products_${TODAY}.xlsx`)
    setExportingKey(null)
  }

  const quickExports = [
    { key: 'expenses', label: 'Expenses', fn: exportExpenses },
    { key: 'invoices', label: 'Invoices', fn: exportInvoices },
    { key: 'inventory', label: 'Inventory', fn: exportInventory },
    { key: 'products', label: 'Products', fn: exportProducts },
    { key: 'customers', label: 'Customers', fn: exportCustomers },
    { key: 'suppliers', label: 'Suppliers', fn: exportSuppliers },
    { key: 'po', label: 'Purchase Orders', fn: exportPurchaseOrders },
    { key: 'production', label: 'Production', fn: exportProduction },
  ]

  return (
    <MainLayout>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Database size={24} color='#2563eb' />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Data Backup</h1>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>Export all data as Excel for backup or reporting</div>
          </div>
        </div>

        {/* Full backup */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '28px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '6px' }}>Full Backup</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
            Downloads all data as a single Excel file with 14 sheets: Products, Inventory (Finished Goods), Inventory (Raw Materials), Inventory (Packaging), Production History, Invoices (CAD), Invoices (USD), Invoice Items, Credit Memos, Credit Memo Items, Customers, Suppliers, Expenses, Purchase Orders
          </div>
          <button
            onClick={handleFullBackup}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: loading ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', padding: '14px 32px', fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
          >
            <Download size={18} />
            {loading ? 'Preparing...' : `Full Backup — iampure_backup_${TODAY}.xlsx`}
          </button>
        </div>

        {/* Quick exports */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Quick Exports</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
            {quickExports.map(({ key, label, fn }) => (
              <button
                key={key}
                onClick={fn}
                disabled={exportingKey === key}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: exportingKey === key ? '#f1f5f9' : '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: '500', cursor: exportingKey === key ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
              >
                <Download size={14} color='#2563eb' />
                {exportingKey === key ? 'Exporting...' : label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
