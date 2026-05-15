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
    { data: productsRaw },
    { data: rawMaterialsRaw },
    { data: packagingRaw },
    { data: expensesRaw },
    { data: purchaseOrdersRaw },
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
    supabase.from('products').select(`
      sku, name, size_oz,
      barcode_upc, barcode_itf14,
      unit_cost_cad, price_whs_cad, price_msrp, price_dist_cad,
      current_stock, reorder_threshold, max_capacity,
      is_active, notes
    `).order('sku', { ascending: true }),
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
  ])
  return {
    invoices: invoicesRaw || [],
    invoiceItems: invoiceItemsRaw || [],
    creditMemos: creditMemosRaw || [],
    creditMemoItems: creditMemoItemsRaw || [],
    customers: customersRaw || [],
    suppliers: suppliersRaw || [],
    products: productsRaw || [],
    rawMaterials: rawMaterialsRaw || [],
    packaging: packagingRaw || [],
    expenses: expensesRaw || [],
    purchaseOrders: purchaseOrdersRaw || [],
  }
}

export default function BackupPage() {
  const [loading, setLoading] = useState(false)
  const [exportingKey, setExportingKey] = useState<string | null>(null)

  async function handleFullBackup() {
    setLoading(true)
    try {
      const { invoices, invoiceItems, creditMemos, creditMemoItems, customers, suppliers, products, rawMaterials, packaging, expenses, purchaseOrders } = await fetchAll()
      const wb = XLSX.utils.book_new()

      // Invoices CAD — cols: Invoice No(0) Date(1) Status(2) Currency(3) Customer(4) Subtotal(5) Tax(6) Total(7) Payment Date(8) Delivery Date(9)
      const invHeaders = ['Invoice No', 'Date', 'Status', 'Currency', 'Customer Name', 'Subtotal (CAD)', 'Tax (CAD)', 'Total (CAD)', 'Payment Date', 'Delivery Date']
      const invCADData = invoices.filter((i: any) => i.currency !== 'USD').map((i: any) => [
        i.invoice_no || '', fmtDate(i.issued_at), i.status || '', i.currency || 'CAD',
        i.customers?.company_name || '',
        i.subtotal_cad ?? 0, i.tax_amount_cad ?? 0, i.total_cad ?? 0,
        fmtDate(i.payment_date), fmtDate(i.delivery_date),
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(invHeaders, invCADData,
        ['TOTAL', '', '', '', '', sumIdx(invCADData, 5), sumIdx(invCADData, 6), sumIdx(invCADData, 7), '', '']
      ), 'Invoices CAD')

      // Invoices USD — same columns, sum Subtotal(5) and Total(7) only
      const invUSDData = invoices.filter((i: any) => i.currency === 'USD').map((i: any) => [
        i.invoice_no || '', fmtDate(i.issued_at), i.status || '', i.currency || 'USD',
        i.customers?.company_name || '',
        i.subtotal_cad ?? 0, i.tax_amount_cad ?? 0, i.total_cad ?? 0,
        fmtDate(i.payment_date), fmtDate(i.delivery_date),
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(invHeaders, invUSDData,
        ['TOTAL', '', '', '', '', sumIdx(invUSDData, 5), '', sumIdx(invUSDData, 7), '', '']
      ), 'Invoices USD')

      // Invoice Items — cols: Invoice No(0) SKU(1) Product Name(2) Qty(3) Unit Price(4) Line Total(5)
      const iiData = invoiceItems.map((item: any) => [
        item.invoices?.invoice_no || '', item.products?.sku || '', item.products?.name || '',
        item.qty ?? 0, item.unit_price_cad ?? 0, item.line_total_cad ?? 0,
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Invoice No', 'SKU', 'Product Name', 'Qty', 'Unit Price (CAD)', 'Line Total (CAD)'],
        iiData,
        ['TOTAL', '', '', sumIdx(iiData, 3), '', sumIdx(iiData, 5)]
      ), 'Invoice Items')

      // Credit Memos — cols: Memo No(0) Date(1) Status(2) Customer(3) Subtotal(4) Tax(5) Total(6) Applied Date(7)
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

      // Credit Memo Items — cols: Memo No(0) SKU(1) Product Name(2) Qty(3) Unit Price(4) Line Total(5)
      const cmiData = creditMemoItems.map((item: any) => [
        item.credit_memos?.memo_no || '', item.products?.sku || '', item.products?.name || '',
        item.qty ?? 0, item.unit_price_cad ?? 0, item.line_total_cad ?? 0,
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['Memo No', 'SKU', 'Product Name', 'Qty', 'Unit Price (CAD)', 'Line Total (CAD)'],
        cmiData,
        ['TOTAL', '', '', sumIdx(cmiData, 3), '', sumIdx(cmiData, 5)]
      ), 'Credit Memo Items')

      // Customers — no totals
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

      // Suppliers — no totals
      const suppData = suppliers.map((s: any) => [
        s.name || '', s.contact_name || '', s.contact_email || '', s.contact_phone || '',
        s.country || '', s.ship_to_address || '',
      ])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Name', 'Contact Name', 'Email', 'Phone', 'Country', 'Address'],
        ...suppData,
      ]), 'Suppliers')

      // Products — cols: SKU(0) Name(1) Size(2) UPC(3) ITF14(4) MFG Cost(5) WHS Price(6) MSRP(7) Dist Price(8) Stock Units(9) Stock Boxes(10) Replenish(11) Max(12) Total MFG(13) Total WHS(14) Active(15) Notes(16)
      const prodData = products.map((p: any) => [
        p.sku || '', p.name || '', p.size_oz ?? '',
        p.barcode_upc || '', p.barcode_itf14 || '',
        p.unit_cost_cad ?? 0, p.price_whs_cad ?? 0, p.price_msrp ?? 0, p.price_dist_cad ?? 0,
        p.current_stock ?? 0, Math.floor((p.current_stock || 0) / 36),
        p.reorder_threshold ?? '', p.max_capacity ?? '',
        (p.unit_cost_cad || 0) * (p.current_stock || 0),
        (p.price_whs_cad || 0) * (p.current_stock || 0),
        p.is_active ? 'Yes' : 'No', p.notes || '',
      ])
      XLSX.utils.book_append_sheet(wb, makeAOASheet(
        ['SKU', 'Name', 'Size (oz)', 'Barcode UPC', 'Barcode ITF-14', 'MFG Cost (CAD)', 'WHS Price (CAD)', 'MSRP (CAD)', 'Dist Price (CAD)', 'Stock (Units)', 'Stock (Boxes)', 'Replenish At (Units)', 'Max Capacity (Units)', 'Total MFG Value', 'Total WHS Value', 'Active', 'Notes'],
        prodData,
        ['TOTAL', '', '', '', '', '', '', '', '', sumIdx(prodData, 9), sumIdx(prodData, 10), '', '', sumIdx(prodData, 13), sumIdx(prodData, 14), '', '']
      ), 'Products (Finished Goods)')

      // Raw Materials — cols: Item No(0) Name(1) Unit(2) Stock(3) Cost/Unit(4) Avg Cost(5) Reorder At(6) Max Capacity(7) Total Value(8)
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
      ), 'Raw Materials')

      // Packaging — cols: Item No(0) Name(1) Type(2) Stock(3) Cost(4) Avg Cost(5) Reorder At(6) Max Capacity(7) Total Value(8)
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
      ), 'Packaging')

      // Expenses — cols: Date(0) Category(1) Type(2) Payee(3) Description(4) Amount Before Tax(5) Sales Tax(6) Total(7) Payment Method(8) Currency(9)
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

      // Purchase Orders — cols: PO Number(0) Status(1) Ordered Date(2) Received Date(3) Supplier(4) Qty Ordered(5) Qty Received(6) Total Cost(7) Shipping(8) Notes(9)
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

  async function exportRevenue() {
    setExportingKey('revenue')
    const { data } = await supabase
      .from('invoices')
      .select('invoice_no, customers(company_name), issued_at, subtotal_cad, tax_amount_cad, total_cad, currency, status')
      .order('issued_at', { ascending: true })
    const rows = (data || []).map((inv: any) => ({
      'Invoice No': inv.invoice_no,
      'Customer': inv.customers?.company_name || '',
      'Date': fmtDate(inv.issued_at),
      'Subtotal (CAD)': fmtNum(inv.subtotal_cad),
      'Tax (CAD)': fmtNum(inv.tax_amount_cad),
      'Total (CAD)': fmtNum(inv.total_cad),
      'Currency': inv.currency || 'CAD',
      'Status': inv.status || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Revenue')
    XLSX.writeFile(wb, `revenue_${TODAY}.xlsx`)
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
      unit_cost_cad, price_whs_cad, price_msrp, price_dist_cad,
      current_stock, reorder_threshold, max_capacity,
      is_active, notes
    `).order('sku', { ascending: true })
    // cols: SKU(0) Name(1) Size(2) UPC(3) ITF14(4) MFG Cost(5) WHS Price(6) MSRP(7) Dist Price(8) Stock Units(9) Stock Boxes(10) Replenish(11) Max(12) Total MFG(13) Total WHS(14) Active(15) Notes(16)
    const rows = (data || []).map((p: any) => [
      p.sku || '', p.name || '', p.size_oz ?? '',
      p.barcode_upc || '', p.barcode_itf14 || '',
      p.unit_cost_cad ?? 0, p.price_whs_cad ?? 0, p.price_msrp ?? 0, p.price_dist_cad ?? 0,
      p.current_stock ?? 0, Math.floor((p.current_stock || 0) / 36),
      p.reorder_threshold ?? '', p.max_capacity ?? '',
      (p.unit_cost_cad || 0) * (p.current_stock || 0),
      (p.price_whs_cad || 0) * (p.current_stock || 0),
      p.is_active ? 'Yes' : 'No', p.notes || '',
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
    { key: 'revenue', label: 'Revenue', fn: exportRevenue },
    { key: 'inventory', label: 'Inventory', fn: exportInventory },
    { key: 'products', label: 'Products', fn: exportProducts },
    { key: 'customers', label: 'Customers', fn: exportCustomers },
    { key: 'suppliers', label: 'Suppliers', fn: exportSuppliers },
    { key: 'po', label: 'Purchase Orders', fn: exportPurchaseOrders },
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
            Downloads all data as a single Excel file with 12 sheets: Invoices CAD, Invoices USD, Invoice Items, Credit Memos, Credit Memo Items, Customers, Suppliers, Products, Raw Materials, Packaging, Expenses, Purchase Orders
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
