'use client'

import { useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { Database, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const TODAY = new Date().toISOString().slice(0, 10)

async function fetchAll() {
  const [
    { data: invoicesRaw },
    { data: invoiceItems },
    { data: creditMemos },
    { data: creditMemoItems },
    { data: customers },
    { data: suppliers },
    { data: products },
    { data: rawMaterials },
    { data: packaging },
    { data: expenses },
    { data: purchaseOrders },
  ] = await Promise.all([
    supabase.from('invoices').select('*').order('issued_at', { ascending: true }),
    supabase.from('invoice_items').select('*').order('id', { ascending: true }),
    supabase.from('credit_memos').select('*').order('issued_at', { ascending: true }),
    supabase.from('credit_memo_items').select('*').order('id', { ascending: true }),
    supabase.from('customers').select('*').order('company_name', { ascending: true }),
    supabase.from('suppliers').select('*').order('name', { ascending: true }),
    supabase.from('products').select('*').order('sku', { ascending: true }),
    supabase.from('raw_materials').select('*').order('item_no', { ascending: true }),
    supabase.from('packaging').select('*').order('item_no', { ascending: true }),
    supabase.from('expenses').select('*').order('expense_date', { ascending: true }),
    supabase.from('purchase_orders').select('*').order('ordered_at', { ascending: true }),
  ])

  const invoicesCAD = (invoicesRaw || []).filter((i: any) => i.currency === 'CAD' || !i.currency)
  const invoicesUSD = (invoicesRaw || []).filter((i: any) => i.currency === 'USD')

  return { invoicesCAD, invoicesUSD, invoiceItems, creditMemos, creditMemoItems, customers, suppliers, products, rawMaterials, packaging, expenses, purchaseOrders }
}

function makeSheet(data: any[] | null) {
  return XLSX.utils.json_to_sheet(data || [])
}

export default function BackupPage() {
  const [loading, setLoading] = useState(false)
  const [exportingKey, setExportingKey] = useState<string | null>(null)

  async function handleFullBackup() {
    setLoading(true)
    try {
      const { invoicesCAD, invoicesUSD, invoiceItems, creditMemos, creditMemoItems, customers, suppliers, products, rawMaterials, packaging, expenses, purchaseOrders } = await fetchAll()
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, makeSheet(invoicesCAD), 'Invoices CAD')
      XLSX.utils.book_append_sheet(wb, makeSheet(invoicesUSD), 'Invoices USD')
      XLSX.utils.book_append_sheet(wb, makeSheet(invoiceItems), 'Invoice Items')
      XLSX.utils.book_append_sheet(wb, makeSheet(creditMemos), 'Credit Memos')
      XLSX.utils.book_append_sheet(wb, makeSheet(creditMemoItems), 'Credit Memo Items')
      XLSX.utils.book_append_sheet(wb, makeSheet(customers), 'Customers')
      XLSX.utils.book_append_sheet(wb, makeSheet(suppliers), 'Suppliers')
      XLSX.utils.book_append_sheet(wb, makeSheet(products), 'Products (Finished Goods)')
      XLSX.utils.book_append_sheet(wb, makeSheet(rawMaterials), 'Raw Materials')
      XLSX.utils.book_append_sheet(wb, makeSheet(packaging), 'Packaging')
      XLSX.utils.book_append_sheet(wb, makeSheet(expenses), 'Expenses')
      XLSX.utils.book_append_sheet(wb, makeSheet(purchaseOrders), 'Purchase Orders')
      XLSX.writeFile(wb, `iampure_backup_${TODAY}.xlsx`)
    } finally {
      setLoading(false)
    }
  }

  async function exportExpenses() {
    setExportingKey('expenses')
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: true })
    const rows = (data || []).map((e: any) => ({
      'Date': e.expense_date,
      'Category': e.category || '',
      'Type': e.type || '',
      'Payee': e.payee || '',
      'Description': e.description || '',
      'Amount Before Tax': e.amount_before_tax || 0,
      'Sales Tax': e.sales_tax || 0,
      'Total': e.total_amount || 0,
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
      .select('invoice_number, customers(company_name), issued_at, subtotal_cad, tax_amount_cad, total_cad, currency, status')
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
      'MFG Cost': p.unit_cost_cad, 'WHS Price': p.whs_price_cad ?? '',
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
      'Company Name': c.company_name,
      'Address': c.ship_to_address || '',
      'City': c.ship_to_city || '',
      'Province': c.ship_to_province || '',
      'Contact Name': c.contact_name || '',
      'Email': c.contact_email || '',
      'Phone': c.contact_phone || '',
      'Payment Terms': c.payment_terms || '',
      'Currency': c.currency || '',
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
      'Ordered At': po.ordered_at || '',
      'Shipped At': po.shipped_at || '',
      'Received At': po.received_at || '',
      'Cost Total CAD': po.cost_total_cad || 0,
      'Shipping CAD': po.shipping_cad || 0,
      'Brokerage CAD': po.brokerage_cad || 0,
      'Duty CAD': po.duty_cad || 0,
      'Notes': po.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchase Orders')
    XLSX.writeFile(wb, `purchase_orders_${TODAY}.xlsx`)
    setExportingKey(null)
  }

  const quickExports = [
    { key: 'expenses', label: 'Expenses', fn: exportExpenses },
    { key: 'revenue', label: 'Revenue', fn: exportRevenue },
    { key: 'inventory', label: 'Inventory', fn: exportInventory },
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
