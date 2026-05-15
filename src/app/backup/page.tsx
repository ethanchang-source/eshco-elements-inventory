'use client'

import { useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Database, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const TODAY = new Date().toISOString().slice(0, 10)

const fmtDate = (v: any) => (v ? String(v).slice(0, 10) : '')
const fmtNum = (v: any) => (v !== null && v !== undefined && v !== '' ? Number(v).toFixed(2) : '')

function sumCol(data: any[], key: string): number {
  return data.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0)
}

function makeSheetWithTotal(data: any[], summaryRow: Record<string, any>) {
  const ws = XLSX.utils.json_to_sheet(data)
  if (data.length === 0) return ws
  XLSX.utils.sheet_add_aoa(ws, [[]], { origin: -1 })
  XLSX.utils.sheet_add_json(ws, [summaryRow], { skipHeader: true, origin: -1 })
  return ws
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
      payment_date, delivery_date, wire_fee, received_amount,
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

  const mapInvoice = (i: any) => ({
    'Invoice No': i.invoice_no || '',
    'Date': fmtDate(i.issued_at),
    'Status': i.status || '',
    'Currency': i.currency || 'CAD',
    'Customer Name': i.customers?.company_name || '',
    'Subtotal (CAD)': fmtNum(i.subtotal_cad),
    'Tax (CAD)': fmtNum(i.tax_amount_cad),
    'Total (CAD)': fmtNum(i.total_cad),
    'Payment Date': fmtDate(i.payment_date),
    'Delivery Date': fmtDate(i.delivery_date),
  })

  const invoicesCAD = (invoicesRaw || []).filter((i: any) => i.currency !== 'USD').map(mapInvoice)
  const invoicesUSD = (invoicesRaw || []).filter((i: any) => i.currency === 'USD').map(mapInvoice)

  const invoiceItems = (invoiceItemsRaw || []).map((item: any) => ({
    'Invoice No': item.invoices?.invoice_no || '',
    'SKU': item.products?.sku || '',
    'Product Name': item.products?.name || '',
    'Qty': item.qty ?? '',
    'Unit Price (CAD)': fmtNum(item.unit_price_cad),
    'Line Total (CAD)': fmtNum(item.line_total_cad),
  }))

  const creditMemos = (creditMemosRaw || []).map((m: any) => ({
    'Memo No': m.memo_no || '',
    'Date': fmtDate(m.issued_at),
    'Status': m.status || '',
    'Customer Name': m.customers?.company_name || '',
    'Subtotal (CAD)': fmtNum(m.subtotal_cad),
    'Tax (CAD)': fmtNum(m.tax_amount_cad),
    'Total (CAD)': fmtNum(m.total_cad),
    'Applied Date': fmtDate(m.applied_date),
  }))

  const creditMemoItems = (creditMemoItemsRaw || []).map((item: any) => ({
    'Memo No': item.credit_memos?.memo_no || '',
    'SKU': item.products?.sku || '',
    'Product Name': item.products?.name || '',
    'Qty': item.qty ?? '',
    'Unit Price (CAD)': fmtNum(item.unit_price_cad),
    'Line Total (CAD)': fmtNum(item.line_total_cad),
  }))

  const customers = (customersRaw || []).map((c: any) => ({
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

  const suppliers = (suppliersRaw || []).map((s: any) => ({
    'Name': s.name || '',
    'Contact Name': s.contact_name || '',
    'Email': s.contact_email || '',
    'Phone': s.contact_phone || '',
    'Country': s.country || '',
    'Address': s.ship_to_address || '',
  }))

  const products = (productsRaw || []).map((p: any) => ({
    'SKU': p.sku || '',
    'Name': p.name || '',
    'Size (oz)': p.size_oz ?? '',
    'Barcode UPC': p.barcode_upc || '',
    'Barcode ITF-14': p.barcode_itf14 || '',
    'MFG Cost (CAD)': fmtNum(p.unit_cost_cad),
    'WHS Price (CAD)': fmtNum(p.price_whs_cad),
    'MSRP (CAD)': fmtNum(p.price_msrp),
    'Dist Price (CAD)': fmtNum(p.price_dist_cad),
    'Stock (Units)': p.current_stock ?? '',
    'Stock (Boxes)': Math.floor((p.current_stock || 0) / 36),
    'Replenish At (Units)': p.reorder_threshold ?? '',
    'Max Capacity (Units)': p.max_capacity ?? '',
    'Total MFG Value': fmtNum((p.unit_cost_cad || 0) * (p.current_stock || 0)),
    'Total WHS Value': fmtNum((p.price_whs_cad || 0) * (p.current_stock || 0)),
    'Active': p.is_active ? 'Yes' : 'No',
    'Notes': p.notes || '',
  }))

  const rawMaterials = (rawMaterialsRaw || []).map((r: any) => ({
    'Item No': r.item_no || '',
    'Name': r.name || '',
    'Unit': r.unit || '',
    'Stock': r.current_stock ?? '',
    'Cost/Unit (CAD)': fmtNum(r.cost_per_unit_cad),
    'Avg Cost (CAD)': fmtNum(r.avg_cost_cad),
    'Reorder At': r.reorder_threshold ?? '',
    'Max Capacity': r.max_capacity ?? '',
    'Total Value': fmtNum((r.cost_per_unit_cad || 0) * (r.current_stock || 0)),
  }))

  const packaging = (packagingRaw || []).map((p: any) => ({
    'Item No': p.item_no || '',
    'Name': p.name || '',
    'Type': p.type || '',
    'Stock': p.current_stock ?? '',
    'Cost (CAD)': fmtNum(p.cost_cad),
    'Avg Cost (CAD)': fmtNum(p.avg_cost_cad),
    'Reorder At': p.reorder_threshold ?? '',
    'Max Capacity': p.max_capacity ?? '',
    'Total Value': fmtNum((p.cost_cad || 0) * (p.current_stock || 0)),
  }))

  const expenses = (expensesRaw || []).map((e: any) => ({
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

  const purchaseOrders = (purchaseOrdersRaw || []).map((po: any) => ({
    'PO Number': po.po_number || '',
    'Status': po.status || '',
    'Ordered Date': fmtDate(po.ordered_at),
    'Received Date': fmtDate(po.received_at),
    'Supplier Name': po.suppliers?.name || '',
    'Qty Ordered': po.qty_ordered ?? '',
    'Qty Received': po.qty_received ?? '',
    'Total Cost (CAD)': fmtNum(po.cost_total_cad),
    'Shipping (CAD)': fmtNum(po.shipping_cad),
    'Notes': po.notes || '',
  }))

  return { invoicesCAD, invoicesUSD, invoiceItems, creditMemos, creditMemoItems, customers, suppliers, products, rawMaterials, packaging, expenses, purchaseOrders }
}

export default function BackupPage() {
  const [loading, setLoading] = useState(false)
  const [exportingKey, setExportingKey] = useState<string | null>(null)

  async function handleFullBackup() {
    setLoading(true)
    try {
      const { invoicesCAD, invoicesUSD, invoiceItems, creditMemos, creditMemoItems, customers, suppliers, products, rawMaterials, packaging, expenses, purchaseOrders } = await fetchAll()
      const wb = XLSX.utils.book_new()

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(invoicesCAD, {
        'Invoice No': 'TOTAL',
        'Subtotal (CAD)': sumCol(invoicesCAD, 'Subtotal (CAD)'),
        'Tax (CAD)': sumCol(invoicesCAD, 'Tax (CAD)'),
        'Total (CAD)': sumCol(invoicesCAD, 'Total (CAD)'),
      }), 'Invoices CAD')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(invoicesUSD, {
        'Invoice No': 'TOTAL',
        'Subtotal (CAD)': sumCol(invoicesUSD, 'Subtotal (CAD)'),
        'Total (CAD)': sumCol(invoicesUSD, 'Total (CAD)'),
      }), 'Invoices USD')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(invoiceItems, {
        'Invoice No': 'TOTAL',
        'Qty': sumCol(invoiceItems, 'Qty'),
        'Line Total (CAD)': sumCol(invoiceItems, 'Line Total (CAD)'),
      }), 'Invoice Items')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(creditMemos, {
        'Memo No': 'TOTAL',
        'Subtotal (CAD)': sumCol(creditMemos, 'Subtotal (CAD)'),
        'Tax (CAD)': sumCol(creditMemos, 'Tax (CAD)'),
        'Total (CAD)': sumCol(creditMemos, 'Total (CAD)'),
      }), 'Credit Memos')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(creditMemoItems, {
        'Memo No': 'TOTAL',
        'Qty': sumCol(creditMemoItems, 'Qty'),
        'Line Total (CAD)': sumCol(creditMemoItems, 'Line Total (CAD)'),
      }), 'Credit Memo Items')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customers), 'Customers')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(suppliers), 'Suppliers')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(products, {
        'SKU': 'TOTAL',
        'Stock (Units)': sumCol(products, 'Stock (Units)'),
        'Stock (Boxes)': sumCol(products, 'Stock (Boxes)'),
        'Total MFG Value': sumCol(products, 'Total MFG Value'),
        'Total WHS Value': sumCol(products, 'Total WHS Value'),
      }), 'Products (Finished Goods)')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(rawMaterials, {
        'Item No': 'TOTAL',
        'Stock': sumCol(rawMaterials, 'Stock'),
        'Total Value': sumCol(rawMaterials, 'Total Value'),
      }), 'Raw Materials')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(packaging, {
        'Item No': 'TOTAL',
        'Stock': sumCol(packaging, 'Stock'),
        'Total Value': sumCol(packaging, 'Total Value'),
      }), 'Packaging')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(expenses, {
        'Date': 'TOTAL',
        'Amount Before Tax': sumCol(expenses, 'Amount Before Tax'),
        'Sales Tax': sumCol(expenses, 'Sales Tax'),
        'Total': sumCol(expenses, 'Total'),
      }), 'Expenses')

      XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(purchaseOrders, {
        'PO Number': 'TOTAL',
        'Total Cost (CAD)': sumCol(purchaseOrders, 'Total Cost (CAD)'),
        'Shipping (CAD)': sumCol(purchaseOrders, 'Shipping (CAD)'),
      }), 'Purchase Orders')

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
    const rows = (data || []).map((p: any) => ({
      'SKU': p.sku || '',
      'Name': p.name || '',
      'Size (oz)': p.size_oz ?? '',
      'Barcode UPC': p.barcode_upc || '',
      'Barcode ITF-14': p.barcode_itf14 || '',
      'MFG Cost (CAD)': fmtNum(p.unit_cost_cad),
      'WHS Price (CAD)': fmtNum(p.price_whs_cad),
      'MSRP (CAD)': fmtNum(p.price_msrp),
      'Dist Price (CAD)': fmtNum(p.price_dist_cad),
      'Stock (Units)': p.current_stock ?? '',
      'Stock (Boxes)': Math.floor((p.current_stock || 0) / 36),
      'Replenish At (Units)': p.reorder_threshold ?? '',
      'Max Capacity (Units)': p.max_capacity ?? '',
      'Total MFG Value': fmtNum((p.unit_cost_cad || 0) * (p.current_stock || 0)),
      'Total WHS Value': fmtNum((p.price_whs_cad || 0) * (p.current_stock || 0)),
      'Active': p.is_active ? 'Yes' : 'No',
      'Notes': p.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, makeSheetWithTotal(rows, {
      'SKU': 'TOTAL',
      'Stock (Units)': sumCol(rows, 'Stock (Units)'),
      'Stock (Boxes)': sumCol(rows, 'Stock (Boxes)'),
      'Total MFG Value': sumCol(rows, 'Total MFG Value'),
      'Total WHS Value': sumCol(rows, 'Total WHS Value'),
    }), 'Products')
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
