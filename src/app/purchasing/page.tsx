'use client'

// -- SQL: CREATE TABLE IF NOT EXISTS purchase_order_attachments (
// --   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
// --   po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
// --   file_name text NOT NULL,
// --   file_url text NOT NULL,
// --   uploaded_at timestamptz DEFAULT now()
// -- );
// -- ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS pallet_count numeric DEFAULT 0;
// -- ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS landed_cost_cad numeric;

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { formatCurrency, getLocalDateString, formatTorontoDate } from '@/lib/utils'
import { Download, ShoppingCart, Plus, Search, X, Trash2, Paperclip, Eye } from 'lucide-react'

interface Supplier { id: string; name: string }

interface Material {
  id: string
  item_no: string
  name: string
  unit: string
  cost_per_unit: number
  material_type: 'raw_material' | 'packaging'
}

interface POLineItem {
  material_id: string
  item_no: string
  name: string
  unit: string
  material_type: 'raw_material' | 'packaging'
  unit_price: number
  qty: number
  total: number
  qty_str: string
  price_str: string
  purchase_unit: string
  weight_per_drum: number
  weight_per_drum_str: string
  pallet_count: number
  pallet_count_str: string
}

interface PO {
  id: string
  po_number: string | null
  supplier_id: string
  ordered_at: string
  status: 'ordered' | 'shipped' | 'received' | 'cancelled'
  cost_total_cad: number
  shipping_cad: number | null
  brokerage_cad: number | null
  duty_cad: number | null
  amount_usd: number | null
  exchange_rate: number | null
  notes: string | null
  invoice_url: string | null
  shipped_at: string | null
  received_at: string | null
  tax_rate?: number | null
  tax_amount?: number | null
  suppliers?: { name: string }
  international_fee_cad?: number | null
  wire_discount_amount?: number | null
  wire_discount_pct?: number | null
  brokerage_currency?: string | null
  gst_amount_cad?: number | null
  shipping_taxable?: boolean | null
  brokerage_taxable?: boolean | null
}

interface POItem {
  id: string
  po_id: string
  material_type: 'raw_material' | 'packaging'
  material_id: string
  quantity: number
  unit_price: number
  purchase_unit?: string | null
  weight_per_drum?: number | null
  ml_conversion?: number | null
  pallet_count?: number | null
}

interface POAttachment {
  id: string
  po_id: string
  file_name: string
  file_url: string
  uploaded_at: string
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ordered:   { bg: '#eff6ff', color: '#2563eb', label: 'Ordered' },
  shipped:   { bg: '#fef3c7', color: '#d97706', label: 'Shipped' },
  received:  { bg: '#f0fdf4', color: '#16a34a', label: 'Received' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' },
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '5px' }
const numInp: React.CSSProperties = { ...inp, textAlign: 'right' }

const formatPrice = (v: number) => {
  if (!v) return '0'
  const str = v.toString()
  return str.includes('.') ? str.replace(/\.?0+$/, '') : str
}

const toTorontoDateInput = (dateStr: string): string => {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10)
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function Purchasing() {
  const [pos, setPOs] = useState<PO[]>([])
  const [poItems, setPoItems] = useState<Record<string, POItem[]>>({})
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createSupplier, setCreateSupplier] = useState<Supplier | null>(null)
  const [createLineItems, setCreateLineItems] = useState<POLineItem[]>([])
  const [createForm, setCreateForm] = useState({
    po_number: '',
    supplier_id: '', ordered_at: getLocalDateString(),
    purchase_currency: 'USD',
    international_fee_usd: '',
    wire_discount_pct: '',
    tax_rate: '0',
    shipping_cad: '', brokerage_cad: '', duty_cad: '',
    gst_amount_cad: '',
    amount_cad: '',
    notes: '',
  })
  const [createShippingTaxable, setCreateShippingTaxable] = useState(false)
  const [createBrokerageTaxable, setCreateBrokerageTaxable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')

  // Detail/Edit modal
  const [showDetail, setShowDetail] = useState(false)
  const [detailPO, setDetailPO] = useState<PO | null>(null)
  const [editLineItems, setEditLineItems] = useState<POLineItem[]>([])
  const [editForm, setEditForm] = useState({
    po_number: '',
    supplier_id: '', ordered_at: '', status: 'ordered',
    purchase_currency: 'USD',
    international_fee_usd: '',
    wire_discount_pct: '',
    tax_rate: '0',
    shipping_cad: '', brokerage_cad: '', duty_cad: '',
    gst_amount_cad: '',
    amount_cad: '',
    notes: '',
    shipped_at: '', received_at: '',
  })
  const [editShippingTaxable, setEditShippingTaxable] = useState(false)
  const [editBrokerageTaxable, setEditBrokerageTaxable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Standalone attachments modal
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [poAttachments, setPoAttachments] = useState<Record<string, POAttachment[]>>({})
  const [showAttachments, setShowAttachments] = useState(false)
  const [attachmentPO, setAttachmentPO] = useState<PO | null>(null)
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachUploadStatus, setAttachUploadStatus] = useState<string>('')

  // Create PO attachments
  const createFileInputRef = useRef<HTMLInputElement>(null)
  const [createFiles, setCreateFiles] = useState<File[]>([])

  // Edit PO attachments
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const [editAttachments, setEditAttachments] = useState<{ id: string; file_name: string; file_url: string }[]>([])
  const [editNewFiles, setEditNewFiles] = useState<File[]>([])
  const [editUploadStatus, setEditUploadStatus] = useState('')
  const [uploadingEditAttachment, setUploadingEditAttachment] = useState(false)

  const [showShippedModal, setShowShippedModal] = useState(false)
  const [showReceivedModal, setShowReceivedModal] = useState(false)
  const [dateModalPO, setDateModalPO] = useState<PO | null>(null)
  const [shippedDateInput, setShippedDateInput] = useState('')
  const [receivedDateInput, setReceivedDateInput] = useState('')

  useEffect(() => { fetchAll() }, [selectedYear])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showDeleteConfirm) { setShowDeleteConfirm(false); return }
      if (showShippedModal) { setShowShippedModal(false); setDateModalPO(null); return }
      if (showReceivedModal) { setShowReceivedModal(false); setDateModalPO(null); return }
      if (showAttachments) { setShowAttachments(false); setAttachmentFiles([]); setAttachUploadStatus(''); return }
      if (showCreate) { setShowCreate(false); setCreateError(''); setCreateFiles([]); return }
      if (showDetail) { setShowDetail(false); setUpdateError(''); setEditNewFiles([]); setEditUploadStatus(''); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCreate, showDetail, showDeleteConfirm, showAttachments, showShippedModal, showReceivedModal])

  async function fetchAll() {
    const [posRes, suppRes, rawRes, pkgRes, itemsRes, attachRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, suppliers(name)')
        .is('deleted_at', null)
        .gte('ordered_at', `${selectedYear}-01-01`)
        .lte('ordered_at', `${selectedYear}-12-31`)
        .order('ordered_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('raw_materials').select('id, item_no, name, unit, cost_per_unit_cad').order('item_no'),
      supabase.from('packaging').select('id, item_no, name, type, cost_cad').order('item_no'),
      supabase.from('purchase_order_items').select('id, po_id, material_type, material_id, quantity, unit_price, purchase_unit, weight_per_drum, ml_conversion, pallet_count'),
      supabase.from('purchase_order_attachments').select('id, po_id, file_name, file_url, uploaded_at').order('uploaded_at'),
    ])
    setPOs(posRes.data || [])
    setSuppliers(suppRes.data || [])

    const raw: Material[] = (rawRes.data || []).map(m => ({
      id: m.id, item_no: m.item_no, name: m.name, unit: m.unit,
      cost_per_unit: m.cost_per_unit_cad ?? 0, material_type: 'raw_material',
    }))
    const pkg: Material[] = (pkgRes.data || []).map(p => ({
      id: p.id, item_no: p.item_no, name: p.name, unit: p.type || 'ea',
      cost_per_unit: p.cost_cad ?? 0, material_type: 'packaging',
    }))
    setMaterials([...raw, ...pkg])

    const grouped: Record<string, POItem[]> = {}
    for (const item of (itemsRes.data || []) as POItem[]) {
      if (!grouped[item.po_id]) grouped[item.po_id] = []
      grouped[item.po_id].push(item)
    }
    setPoItems(grouped)

    const attachGrouped: Record<string, POAttachment[]> = {}
    for (const a of (attachRes.data || []) as POAttachment[]) {
      if (!attachGrouped[a.po_id]) attachGrouped[a.po_id] = []
      attachGrouped[a.po_id].push(a)
    }
    setPoAttachments(attachGrouped)
    setLoading(false)
  }

  function handleSupplierChange(supplierId: string) {
    const supplier = suppliers.find(s => s.id === supplierId) || null
    setCreateSupplier(supplier)
    setCreateForm(prev => ({ ...prev, supplier_id: supplierId }))
    setCreateLineItems(materials.map(m => ({
      material_id: m.id,
      item_no: m.item_no,
      name: m.name,
      unit: m.unit,
      material_type: m.material_type,
      unit_price: m.cost_per_unit,
      qty: 0,
      total: 0,
      qty_str: '',
      price_str: String(m.cost_per_unit),
      purchase_unit: 'ml',
      weight_per_drum: 0,
      weight_per_drum_str: '',
      pallet_count: 0,
      pallet_count_str: '',
    })))
  }

  function updateCreateQty(index: number, qtyStr: string) {
    if (qtyStr !== '' && !/^[0-9]*\.?[0-9]*$/.test(qtyStr)) return
    setCreateLineItems(prev => {
      const updated = [...prev]
      const qty = parseFloat(qtyStr) || 0
      updated[index] = { ...updated[index], qty_str: qtyStr, qty, total: qty * updated[index].unit_price }
      return updated
    })
  }

  function updateCreatePrice(index: number, priceStr: string) {
    if (priceStr !== '' && !/^[0-9]*\.?[0-9]*$/.test(priceStr)) return
    setCreateLineItems(prev => {
      const updated = [...prev]
      const price = parseFloat(priceStr) || 0
      updated[index] = { ...updated[index], price_str: priceStr, unit_price: price, total: price * updated[index].qty }
      return updated
    })
  }

  const activeCreateItems = createLineItems.filter(item => item.qty > 0)
  // Step 1: Items subtotal (USD in USD mode, CAD in CAD mode)
  const createSubtotalUsd = activeCreateItems.reduce((s, i) => s + i.total, 0)
  // Step 2: Wire Discount (%) on subtotal before intl fee
  const createWireDiscountPct = parseFloat(createForm.wire_discount_pct || '0') || 0
  const createWireDiscountUsd = createSubtotalUsd * createWireDiscountPct / 100
  const createAfterDiscountUsd = createSubtotalUsd - createWireDiscountUsd
  // Step 3: + International Fee (USD) after discount
  const createIntlFeeUsd = parseFloat(createForm.international_fee_usd || '0') || 0
  const createAfterIntlUsd = createAfterDiscountUsd + createIntlFeeUsd
  // Step 4: amount_usd = auto-computed; exchange rate = wire_cad / amount_usd
  const createWireCad = parseFloat(createForm.amount_cad || '0') || 0
  const createExchangeRate = createAfterIntlUsd > 0 && createWireCad > 0
    ? (createWireCad / createAfterIntlUsd).toFixed(4) : null
  const createExchangeRateNum = createExchangeRate ? parseFloat(createExchangeRate) : 1
  const createSubtotal2Cad = createWireCad
  // CAD mode: simple tax on subtotal
  const createTaxRate = parseFloat(createForm.tax_rate || '0') || 0
  const createCadTax = createSubtotalUsd * createTaxRate / 100
  // Step 5: CAD extras with HST
  const createShipping = parseFloat(createForm.shipping_cad || '0') || 0
  const createShippingHst = createShippingTaxable ? createShipping * 0.13 : 0
  const createBrokerageRaw = parseFloat(createForm.brokerage_cad || '0') || 0
  const createBrokerageHst = createBrokerageTaxable ? createBrokerageRaw * 0.13 : 0
  const createDuty = parseFloat(createForm.duty_cad || '0') || 0
  const createGstAmountCad = parseFloat(createForm.gst_amount_cad || '0') || 0
  // Step 6: Grand Total
  const createCadExtras = createShipping + createShippingHst + createBrokerageRaw + createBrokerageHst + createDuty + createGstAmountCad
  const createTotal = createForm.purchase_currency === 'USD'
    ? createSubtotal2Cad + createCadExtras
    : createSubtotalUsd + createCadTax + createCadExtras

  function closeCreate() {
    setShowCreate(false)
    setCreateError('')
    setCreateFiles([])
  }

  async function handleCreate() {
    setCreateError('')
    if (!createForm.supplier_id) { setCreateError('Please select a supplier.'); return }
    if (activeCreateItems.length === 0) { setCreateError('Please enter a quantity for at least one item.'); return }

    setSaving(true)

    const { data: poData, error: poError } = await supabase.from('purchase_orders').insert([{
      po_number: createForm.po_number || null,
      supplier_id: createForm.supplier_id,
      item_type: activeCreateItems[0].material_type,
      raw_material_id: null,
      packaging_id: null,
      qty_ordered: 0,
      cost_total_cad: createTotal,
      shipping_cad: createShipping || null,
      brokerage_cad: createBrokerageRaw || null,
      duty_cad: createDuty || null,
      status: 'ordered',
      ordered_at: createForm.ordered_at,
      notes: createForm.notes || null,
      amount_usd: createAfterIntlUsd || null,
      exchange_rate: createExchangeRate ? parseFloat(createExchangeRate) : null,
      tax_rate: createForm.purchase_currency === 'CAD' ? (createTaxRate / 100) : null,
      tax_amount: (createShippingHst + createBrokerageHst) || null,
      international_fee_cad: (createIntlFeeUsd * createExchangeRateNum) || null,
      wire_discount_amount: (createWireDiscountUsd * createExchangeRateNum) || null,
      wire_discount_pct: createWireDiscountPct || null,
      brokerage_currency: 'CAD',
      gst_amount_cad: createGstAmountCad || null,
      shipping_taxable: createShippingTaxable,
      brokerage_taxable: createBrokerageTaxable,
    }]).select('id').single()

    if (poError || !poData) {
      setCreateError(poError?.message || 'Failed to create PO.')
      setSaving(false)
      return
    }

    const { error: itemsError } = await supabase.from('purchase_order_items').insert(
      activeCreateItems.map(item => ({
        po_id: poData.id,
        material_type: item.material_type,
        material_id: item.material_id,
        quantity: item.qty,
        unit_price: item.unit_price,
        purchase_unit: item.material_type === 'raw_material' ? (item.purchase_unit || 'ml') : null,
        weight_per_drum: item.material_type === 'raw_material' && ['drum', 'gallon', 'pail'].includes(item.purchase_unit || '') ? (item.weight_per_drum || null) : null,
        ml_conversion: computeMlConversion(item),
        pallet_count: item.material_type === 'packaging' ? (item.pallet_count || null) : null,
      }))
    )

    if (itemsError) {
      setCreateError(itemsError.message || 'Failed to save items.')
      await supabase.from('purchase_orders').delete().eq('id', poData.id)
      setSaving(false)
      return
    }

    let attachFailCount = 0
    for (const file of createFiles) {
      const path = `${poData.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('po-attachments').upload(path, file)
      if (uploadError) { attachFailCount++; continue }
      const { data: urlData } = supabase.storage.from('po-attachments').getPublicUrl(path)
      await supabase.from('purchase_order_attachments').insert({
        po_id: poData.id, file_name: file.name, file_url: urlData.publicUrl,
      })
    }

    setSaving(false)
    if (attachFailCount > 0) {
      setCreateError(`PO created, but ${attachFailCount} attachment(s) failed to upload.`)
      setCreateFiles([])
      fetchAll()
      return
    }
    setShowCreate(false)
    setCreateError('')
    setCreateForm({ po_number: '', supplier_id: '', ordered_at: getLocalDateString(), purchase_currency: 'USD', international_fee_usd: '', wire_discount_pct: '', tax_rate: '0', shipping_cad: '', brokerage_cad: '', duty_cad: '', gst_amount_cad: '', amount_cad: '', notes: '' })
    setCreateShippingTaxable(false)
    setCreateBrokerageTaxable(false)
    setCreateLineItems([])
    setCreateSupplier(null)
    setCreateFiles([])
    fetchAll()
  }

  async function openDetail(po: PO) {
    setDetailPO(po)
    const exRate = po.exchange_rate || 1
    const reconIntlFeeUsd = po.international_fee_cad != null && po.exchange_rate
      ? po.international_fee_cad / exRate : null
    const reconWireCad = po.amount_usd != null && po.exchange_rate != null
      ? po.amount_usd * po.exchange_rate : null
    setEditForm({
      po_number: po.po_number || '',
      supplier_id: po.supplier_id,
      ordered_at: toTorontoDateInput(po.ordered_at),
      status: po.status,
      purchase_currency: po.exchange_rate != null ? 'USD' : 'CAD',
      international_fee_usd: reconIntlFeeUsd != null ? String(parseFloat(reconIntlFeeUsd.toFixed(4))) : '',
      wire_discount_pct: po.wire_discount_pct != null ? String(po.wire_discount_pct) : '',
      tax_rate: po.tax_rate != null ? String(Math.round(po.tax_rate * 100)) : '0',
      shipping_cad: po.shipping_cad != null ? String(po.shipping_cad) : '',
      brokerage_cad: po.brokerage_cad != null ? String(po.brokerage_cad) : '',
      duty_cad: po.duty_cad != null ? String(po.duty_cad) : '',
      gst_amount_cad: po.gst_amount_cad != null ? String(po.gst_amount_cad) : '',
      amount_cad: reconWireCad != null ? reconWireCad.toFixed(2) : '',
      notes: po.notes || '',
      shipped_at: toTorontoDateInput(po.shipped_at || ''),
      received_at: toTorontoDateInput(po.received_at || ''),
    })
    setEditShippingTaxable(po.shipping_taxable ?? false)
    setEditBrokerageTaxable(po.brokerage_taxable ?? false)
    setUpdateError('')
    setEditNewFiles([])
    setEditUploadStatus('')

    const [freshItemsRes, attachRes] = await Promise.all([
      supabase.from('purchase_order_items')
        .select('id, po_id, material_type, material_id, quantity, unit_price, purchase_unit, weight_per_drum, ml_conversion, pallet_count')
        .eq('po_id', po.id),
      supabase.from('purchase_order_attachments')
        .select('id, file_name, file_url')
        .eq('po_id', po.id)
        .order('uploaded_at'),
    ])

    const existingMap: Record<string, { qty: number; unit_price: number; purchase_unit: string; weight_per_drum: number; pallet_count: number }> = {}
    for (const item of (freshItemsRes.data || []) as POItem[]) {
      existingMap[item.material_id] = {
        qty: item.quantity, unit_price: item.unit_price,
        purchase_unit: item.purchase_unit || 'ml',
        weight_per_drum: item.weight_per_drum || 0,
        pallet_count: item.pallet_count || 0,
      }
    }

    setEditLineItems(materials.map(m => ({
      material_id: m.id,
      item_no: m.item_no,
      name: m.name,
      unit: m.unit,
      material_type: m.material_type,
      unit_price: existingMap[m.id]?.unit_price ?? m.cost_per_unit,
      qty: existingMap[m.id]?.qty ?? 0,
      total: (existingMap[m.id]?.unit_price ?? m.cost_per_unit) * (existingMap[m.id]?.qty ?? 0),
      qty_str: existingMap[m.id]?.qty ? String(existingMap[m.id].qty) : '',
      price_str: String(existingMap[m.id]?.unit_price ?? m.cost_per_unit),
      purchase_unit: existingMap[m.id]?.purchase_unit ?? 'ml',
      weight_per_drum: existingMap[m.id]?.weight_per_drum ?? 0,
      weight_per_drum_str: existingMap[m.id]?.weight_per_drum ? String(existingMap[m.id].weight_per_drum) : '',
      pallet_count: existingMap[m.id]?.pallet_count ?? 0,
      pallet_count_str: existingMap[m.id]?.pallet_count ? String(existingMap[m.id].pallet_count) : '',
    })))

    setEditAttachments(attachRes.data || [])
    setShowDetail(true)
  }

  function updateEditQty(index: number, qtyStr: string) {
    if (qtyStr !== '' && !/^[0-9]*\.?[0-9]*$/.test(qtyStr)) return
    setEditLineItems(prev => {
      const updated = [...prev]
      const qty = parseFloat(qtyStr) || 0
      updated[index] = { ...updated[index], qty_str: qtyStr, qty, total: qty * updated[index].unit_price }
      return updated
    })
  }

  function updateEditPrice(index: number, priceStr: string) {
    if (priceStr !== '' && !/^[0-9]*\.?[0-9]*$/.test(priceStr)) return
    setEditLineItems(prev => {
      const updated = [...prev]
      const price = parseFloat(priceStr) || 0
      updated[index] = { ...updated[index], price_str: priceStr, unit_price: price, total: price * updated[index].qty }
      return updated
    })
  }

  function updateCreatePurchaseUnit(index: number, unit: string) {
    setCreateLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], purchase_unit: unit }
      return updated
    })
  }

  function updateCreateWeightPerDrum(index: number, val: string) {
    if (val !== '' && !/^[0-9]*\.?[0-9]*$/.test(val)) return
    setCreateLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], weight_per_drum_str: val, weight_per_drum: parseFloat(val) || 0 }
      return updated
    })
  }

  function updateEditPurchaseUnit(index: number, unit: string) {
    setEditLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], purchase_unit: unit }
      return updated
    })
  }

  function updateEditWeightPerDrum(index: number, val: string) {
    if (val !== '' && !/^[0-9]*\.?[0-9]*$/.test(val)) return
    setEditLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], weight_per_drum_str: val, weight_per_drum: parseFloat(val) || 0 }
      return updated
    })
  }

  function computeMlConversion(item: POLineItem): number | null {
    if (item.material_type !== 'raw_material') return null
    const pu = item.purchase_unit || 'ml'
    if (pu === 'kg') return item.qty * 1000
    if (pu === 'drum') return item.qty * (item.weight_per_drum || 0) * 1000
    if (pu === 'gallon') return item.qty * (item.weight_per_drum || 0)
    if (pu === 'pail') return item.qty * (item.weight_per_drum || 0) * 1000
    return null
  }

  function updateCreatePalletCount(index: number, val: string) {
    if (val !== '' && !/^[0-9]*\.?[0-9]*$/.test(val)) return
    setCreateLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], pallet_count_str: val, pallet_count: parseFloat(val) || 0 }
      return updated
    })
  }

  function updateEditPalletCount(index: number, val: string) {
    if (val !== '' && !/^[0-9]*\.?[0-9]*$/.test(val)) return
    setEditLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], pallet_count_str: val, pallet_count: parseFloat(val) || 0 }
      return updated
    })
  }

  const activeEditItems = editLineItems.filter(item => item.qty > 0)
  // Step 1: Items subtotal
  const editSubtotalUsd = activeEditItems.reduce((s, i) => s + i.total, 0)
  // Step 2: Wire Discount (%) on subtotal before intl fee
  const editWireDiscountPct = parseFloat(editForm.wire_discount_pct || '0') || 0
  const editWireDiscountUsd = editSubtotalUsd * editWireDiscountPct / 100
  const editAfterDiscountUsd = editSubtotalUsd - editWireDiscountUsd
  // Step 3: + International Fee (USD) after discount
  const editIntlFeeUsd = parseFloat(editForm.international_fee_usd || '0') || 0
  const editAfterIntlUsd = editAfterDiscountUsd + editIntlFeeUsd
  // Step 4: exchange rate = wire_cad / amount_usd_auto
  const editWireCad = parseFloat(editForm.amount_cad || '0') || 0
  const editExchangeRate = editAfterIntlUsd > 0 && editWireCad > 0
    ? (editWireCad / editAfterIntlUsd).toFixed(4) : null
  const editExchangeRateNum = editExchangeRate ? parseFloat(editExchangeRate) : 1
  // CAD mode: simple tax on subtotal
  const editTaxRate = parseFloat(editForm.tax_rate || '0') || 0
  const editCadTax = editSubtotalUsd * editTaxRate / 100
  // Step 5: CAD extras with HST
  const editShipping = parseFloat(editForm.shipping_cad || '0') || 0
  const editShippingHst = editShippingTaxable ? editShipping * 0.13 : 0
  const editBrokerageRaw = parseFloat(editForm.brokerage_cad || '0') || 0
  const editBrokerageHst = editBrokerageTaxable ? editBrokerageRaw * 0.13 : 0
  const editDuty = parseFloat(editForm.duty_cad || '0') || 0
  const editGstAmountCad = parseFloat(editForm.gst_amount_cad || '0') || 0
  // Step 6: Grand Total
  const editCadExtras = editShipping + editShippingHst + editBrokerageRaw + editBrokerageHst + editDuty + editGstAmountCad
  const editTotal = editForm.purchase_currency === 'USD'
    ? editWireCad + editCadExtras
    : editSubtotalUsd + editCadTax + editCadExtras
  const isReadOnly = detailPO?.status === 'received' || detailPO?.status === 'cancelled'

  function itemKgWeight(item: { quantity: number; purchase_unit?: string | null; weight_per_drum?: number | null; ml_conversion?: number | null }): number {
    const pu = item.purchase_unit || 'ml'
    if (pu === 'kg') return item.quantity
    if (pu === 'drum') return item.quantity * (item.weight_per_drum || 0)
    if (pu === 'pail') return item.quantity * (item.weight_per_drum || 0)
    if (pu === 'gallon') return item.quantity * (item.weight_per_drum || 0) / 1000
    return (item.ml_conversion ?? item.quantity) / 1000
  }

  // Shared helper: add or subtract stock + avg_cost_cad on received/rollback
  async function applyReceivedStock(
    items: { material_type: string; material_id: string; quantity: number; unit_price: number; ml_conversion?: number | null; pallet_count?: number | null; purchase_unit?: string | null; weight_per_drum?: number | null }[],
    direction: 'add' | 'subtract',
    poContext?: { po_id: string; exchange_rate: number | null; shipping_cad: number | null; brokerage_cad: number | null; duty_cad: number | null }
  ) {
    if (direction === 'add' && poContext) {
      const exRate = poContext.exchange_rate ?? 1
      const distributableCad = (poContext.shipping_cad ?? 0) + (poContext.brokerage_cad ?? 0) + (poContext.duty_cad ?? 0)
      const rawItems = items.filter(i => i.material_type === 'raw_material')
      const pkgItems = items.filter(i => i.material_type === 'packaging')
      const rawSubtotal = rawItems.reduce((s, i) => s + i.quantity * i.unit_price * exRate, 0)
      const pkgSubtotal = pkgItems.reduce((s, i) => s + i.quantity * i.unit_price * exRate, 0)
      const totalSubtotal = rawSubtotal + pkgSubtotal
      const rawGroupCost = totalSubtotal > 0 ? distributableCad * rawSubtotal / totalSubtotal : (pkgItems.length === 0 ? distributableCad : 0)
      const pkgGroupCost = totalSubtotal > 0 ? distributableCad * pkgSubtotal / totalSubtotal : (rawItems.length === 0 ? distributableCad : 0)

      const landedCostMap = new Map<string, number>()

      const rawTotalKg = rawItems.reduce((s, i) => s + itemKgWeight(i), 0)
      for (const i of rawItems) {
        const kg = itemKgWeight(i)
        const distCost = rawTotalKg > 0 ? rawGroupCost * kg / rawTotalKg : rawGroupCost / Math.max(rawItems.length, 1)
        landedCostMap.set(i.material_id, i.quantity * i.unit_price * exRate + distCost)
      }

      const pkgTotalPallets = pkgItems.reduce((s, i) => s + (i.pallet_count || 0), 0)
      const pkgTotalQty = pkgItems.reduce((s, i) => s + i.quantity, 0)
      for (const i of pkgItems) {
        const share = pkgTotalPallets > 0
          ? (i.pallet_count || 0) / pkgTotalPallets
          : (pkgTotalQty > 0 ? i.quantity / pkgTotalQty : 1 / Math.max(pkgItems.length, 1))
        landedCostMap.set(i.material_id, i.quantity * i.unit_price * exRate + pkgGroupCost * share)
      }

      for (const [materialId, landedCost] of landedCostMap.entries()) {
        const item = items.find(i => i.material_id === materialId)
        if (!item) continue
        await supabase.from('purchase_order_items')
          .update({ landed_cost_cad: landedCost })
          .eq('po_id', poContext.po_id)
          .eq('material_id', materialId)
          .eq('material_type', item.material_type)
      }
    }

    for (const item of items) {
      if (item.material_type === 'raw_material') {
        const { data: mat } = await supabase
          .from('raw_materials')
          .select('current_stock')
          .eq('id', item.material_id)
          .single()
        const oldStock = mat?.current_stock || 0
        const stockDelta = item.ml_conversion ?? item.quantity
        if (direction === 'add') {
          const { data: allItems } = await supabase
            .from('purchase_order_items')
            .select('quantity, unit_price, ml_conversion, landed_cost_cad, purchase_orders!inner(status, exchange_rate)')
            .eq('material_type', 'raw_material')
            .eq('material_id', item.material_id)
            .eq('purchase_orders.status', 'received')
          const totalMl = allItems?.reduce((s: number, i: any) => s + (i.ml_conversion ?? i.quantity), 0) || 0
          const totalCost = allItems?.reduce((s: number, i: any) => {
            if (i.landed_cost_cad != null) return s + i.landed_cost_cad
            const er = i.purchase_orders?.exchange_rate ?? 1
            return s + i.quantity * i.unit_price * er
          }, 0) || 0
          const newAvg = totalMl > 0 ? totalCost / totalMl : 0
          await supabase.from('raw_materials').update({
            current_stock: oldStock + stockDelta,
            avg_cost_cad: newAvg,
          }).eq('id', item.material_id)
        } else {
          await supabase.from('raw_materials').update({
            current_stock: Math.max(0, oldStock - stockDelta),
          }).eq('id', item.material_id)
        }
      } else {
        const { data: pkg } = await supabase
          .from('packaging')
          .select('current_stock')
          .eq('id', item.material_id)
          .single()
        const oldStock = pkg?.current_stock || 0
        if (direction === 'add') {
          const { data: allItems } = await supabase
            .from('purchase_order_items')
            .select('quantity, unit_price, landed_cost_cad, purchase_orders!inner(status, exchange_rate)')
            .eq('material_type', 'packaging')
            .eq('material_id', item.material_id)
            .eq('purchase_orders.status', 'received')
          const totalQty = allItems?.reduce((s: number, i: any) => s + i.quantity, 0) || 0
          const totalValue = allItems?.reduce((s: number, i: any) => {
            if (i.landed_cost_cad != null) return s + i.landed_cost_cad
            const er = i.purchase_orders?.exchange_rate ?? 1
            return s + i.quantity * i.unit_price * er
          }, 0) || 0
          const newAvg = totalQty > 0 ? totalValue / totalQty : 0
          await supabase.from('packaging').update({
            current_stock: oldStock + item.quantity,
            avg_cost_cad: newAvg,
          }).eq('id', item.material_id)
        } else {
          await supabase.from('packaging').update({
            current_stock: Math.max(0, oldStock - item.quantity),
          }).eq('id', item.material_id)
        }
      }
    }
  }

  async function handleUpdate() {
    if (!detailPO) return
    setUpdateError('')
    if (activeEditItems.length === 0) { setUpdateError('At least one item with quantity is required.'); return }

    setUpdating(true)

    // Fetch current DB status before update to prevent duplicate/missed stock changes
    const { data: currentPOState } = await supabase
      .from('purchase_orders').select('status').eq('id', detailPO.id).single()
    const previousDBStatus = currentPOState?.status

    const updatePayload: Record<string, unknown> = {
      po_number: editForm.po_number || null,
      supplier_id: editForm.supplier_id,
      ordered_at: editForm.ordered_at,
      status: editForm.status,
      cost_total_cad: editTotal,
      shipping_cad: editShipping || null,
      brokerage_cad: editBrokerageRaw || null,
      duty_cad: editDuty || null,
      notes: editForm.notes || null,
      amount_usd: editForm.purchase_currency === 'USD' ? (editAfterIntlUsd || null) : null,
      exchange_rate: editForm.purchase_currency === 'USD' && editExchangeRate ? parseFloat(editExchangeRate) : null,
      tax_rate: editForm.purchase_currency === 'CAD' ? (editTaxRate / 100) : null,
      tax_amount: (editShippingHst + editBrokerageHst) || null,
      shipped_at: editForm.status === 'shipped' || editForm.status === 'received'
        ? (editForm.shipped_at || getLocalDateString()) : null,
      received_at: editForm.status === 'received'
        ? (editForm.received_at || getLocalDateString()) : null,
      international_fee_cad: editForm.purchase_currency === 'USD' ? ((editIntlFeeUsd * editExchangeRateNum) || null) : null,
      wire_discount_amount: null,
      wire_discount_pct: editWireDiscountPct || null,
      brokerage_currency: 'CAD',
      gst_amount_cad: editGstAmountCad || null,
      shipping_taxable: editShippingTaxable,
      brokerage_taxable: editBrokerageTaxable,
    }

    const { error } = await supabase.from('purchase_orders').update(updatePayload).eq('id', detailPO.id)
    if (error) { setUpdateError(error.message); setUpdating(false); return }

    await supabase.from('purchase_order_items').delete().eq('po_id', detailPO.id)
    await supabase.from('purchase_order_items').insert(
      activeEditItems.map(item => ({
        po_id: detailPO.id,
        material_type: item.material_type,
        material_id: item.material_id,
        quantity: item.qty,
        unit_price: item.unit_price,
        purchase_unit: item.material_type === 'raw_material' ? (item.purchase_unit || 'ml') : null,
        weight_per_drum: item.material_type === 'raw_material' && ['drum', 'gallon', 'pail'].includes(item.purchase_unit || '') ? (item.weight_per_drum || null) : null,
        ml_conversion: computeMlConversion(item),
        pallet_count: item.material_type === 'packaging' ? (item.pallet_count || null) : null,
      }))
    )

    const editItemsNorm = activeEditItems.map(i => ({
      material_type: i.material_type, material_id: i.material_id,
      quantity: i.qty, unit_price: i.unit_price, ml_conversion: computeMlConversion(i),
      pallet_count: i.pallet_count, purchase_unit: i.purchase_unit, weight_per_drum: i.weight_per_drum,
    }))
    const editPoCtx = {
      po_id: detailPO.id,
      exchange_rate: editForm.purchase_currency === 'USD' && editExchangeRate ? parseFloat(editExchangeRate) : null,
      shipping_cad: editShipping || null, brokerage_cad: editBrokerageRaw || null, duty_cad: editDuty || null,
    }
    if (editForm.status === 'received' && previousDBStatus !== 'received') {
      await applyReceivedStock(editItemsNorm, 'add', editPoCtx)
    } else if (editForm.status !== 'received' && previousDBStatus === 'received') {
      await applyReceivedStock(editItemsNorm, 'subtract')
    }

    setUpdating(false)
    setShowDetail(false)
    fetchAll()
  }

  async function handleUploadEditAttachments() {
    if (!detailPO || editNewFiles.length === 0) return
    setUploadingEditAttachment(true)
    setEditUploadStatus('')
    const poId = detailPO.id
    let successCount = 0
    let failCount = 0
    let lastError = ''
    for (const file of editNewFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${poId}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage.from('po-attachments').upload(path, file)
      if (uploadError) { failCount++; lastError = uploadError.message || JSON.stringify(uploadError); continue }
      const { data: urlData } = supabase.storage.from('po-attachments').getPublicUrl(path)
      const { error: insertError } = await supabase.from('purchase_order_attachments').insert({
        po_id: poId, file_name: file.name, file_url: urlData.publicUrl,
      })
      if (insertError) { failCount++; lastError = insertError.message || JSON.stringify(insertError); continue }
      successCount++
    }
    setEditNewFiles([])
    setUploadingEditAttachment(false)
    if (failCount === 0) {
      setEditUploadStatus(`✓ ${successCount} file(s) uploaded.`)
    } else if (successCount === 0) {
      setEditUploadStatus(`✗ Upload failed (${lastError})`)
    } else {
      setEditUploadStatus(`${successCount} uploaded, ${failCount} failed (${lastError})`)
    }
    const { data } = await supabase.from('purchase_order_attachments')
      .select('id, file_name, file_url')
      .eq('po_id', poId)
      .order('uploaded_at')
    setEditAttachments(data || [])
    setPoAttachments(prev => ({
      ...prev,
      [poId]: (data || []).map(a => ({ ...a, po_id: poId, uploaded_at: '' })) as POAttachment[],
    }))
  }

  async function handleDeleteEditAttachment(attachmentId: string) {
    await supabase.from('purchase_order_attachments').delete().eq('id', attachmentId)
    setEditAttachments(prev => prev.filter(a => a.id !== attachmentId))
    if (detailPO) {
      setPoAttachments(prev => ({
        ...prev,
        [detailPO.id]: (prev[detailPO.id] || []).filter(a => a.id !== attachmentId),
      }))
    }
  }

  async function handleDelete() {
    if (!detailPO) return
    setDeleting(true)
    await supabase.from('purchase_order_items').delete().eq('po_id', detailPO.id)
    await supabase.from('purchase_orders').delete().eq('id', detailPO.id)
    setDeleting(false)
    setShowDeleteConfirm(false)
    setShowDetail(false)
    fetchAll()
  }

  function getPOSummary(po: PO): string {
    const items = poItems[po.id]
    if (!items || items.length === 0) return '—'
    return items.length === 1 ? '1 item' : `${items.length} items`
  }

  function getPOItemNamesStr(po: PO): string {
    const items = poItems[po.id]
    if (!items || items.length === 0) return ''
    return items.map(it => {
      const mat = materials.find(m => m.id === it.material_id)
      return mat ? `${mat.item_no} ${mat.name}` : ''
    }).join(' ')
  }

  async function openAttachments(e: React.MouseEvent, po: PO) {
    e.stopPropagation()
    setAttachmentPO(po)
    setAttachmentFiles([])
    setAttachUploadStatus('')
    setShowAttachments(true)
    const { data } = await supabase.from('purchase_order_attachments')
      .select('id, po_id, file_name, file_url, uploaded_at')
      .eq('po_id', po.id)
      .order('uploaded_at')
    setPoAttachments(prev => ({ ...prev, [po.id]: data || [] }))
  }

  async function handleUploadAttachments() {
    if (!attachmentPO || attachmentFiles.length === 0) return
    setUploadingAttachment(true)
    setAttachUploadStatus('')
    const poId = attachmentPO.id
    let successCount = 0
    let failCount = 0
    let lastError = ''
    for (const file of attachmentFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${poId}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage.from('po-attachments').upload(path, file)
      if (uploadError) { failCount++; lastError = uploadError.message || JSON.stringify(uploadError); continue }
      const { data: urlData } = supabase.storage.from('po-attachments').getPublicUrl(path)
      const { error: dbError } = await supabase.from('purchase_order_attachments').insert({
        po_id: poId,
        file_name: file.name,
        file_url: urlData.publicUrl,
      })
      if (dbError) { failCount++; lastError = dbError.message || JSON.stringify(dbError); continue }
      successCount++
    }
    setAttachmentFiles([])
    setUploadingAttachment(false)
    if (failCount === 0) {
      setAttachUploadStatus(`✓ ${successCount} file(s) uploaded successfully.`)
    } else if (successCount === 0) {
      setAttachUploadStatus(`✗ Upload failed (${lastError})`)
      alert('Upload failed: ' + lastError)
    } else {
      setAttachUploadStatus(`${successCount} uploaded, ${failCount} failed (${lastError})`)
    }
    const { data } = await supabase.from('purchase_order_attachments')
      .select('id, po_id, file_name, file_url, uploaded_at')
      .eq('po_id', poId)
      .order('uploaded_at')
    setPoAttachments(prev => ({ ...prev, [poId]: data || [] }))
  }

  async function handleDeleteAttachment(attachment: POAttachment) {
    const storagePrefix = '/storage/v1/object/public/po-attachments/'
    const urlPath = attachment.file_url.split(storagePrefix)[1]
    if (urlPath) {
      await supabase.storage.from('po-attachments').remove([decodeURIComponent(urlPath)])
    }
    await supabase.from('purchase_order_attachments').delete().eq('id', attachment.id)
    const { data } = await supabase.from('purchase_order_attachments')
      .select('id, po_id, file_name, file_url, uploaded_at')
      .eq('po_id', attachment.po_id)
      .order('uploaded_at')
    setPoAttachments(prev => ({ ...prev, [attachment.po_id]: data || [] }))
  }

  async function handleTableStatusChange(newStatus: string, po: PO) {
    // Fetch DB status before update to prevent duplicate/missed stock changes
    const { data: currentPOState } = await supabase
      .from('purchase_orders').select('status').eq('id', po.id).single()
    const previousDBStatus = currentPOState?.status

    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', po.id)

    const items = (poItems[po.id] || []).map(i => ({
      material_type: i.material_type, material_id: i.material_id,
      quantity: i.quantity, unit_price: i.unit_price, ml_conversion: i.ml_conversion,
      pallet_count: i.pallet_count, purchase_unit: i.purchase_unit, weight_per_drum: i.weight_per_drum,
    }))
    if (newStatus === 'received' && previousDBStatus !== 'received') {
      const tablePoCtx = {
        po_id: po.id,
        exchange_rate: po.exchange_rate ?? null,
        shipping_cad: po.shipping_cad ?? null,
        brokerage_cad: po.brokerage_cad ?? null,
        duty_cad: po.duty_cad ?? null,
      }
      await applyReceivedStock(items, 'add', tablePoCtx)
    } else if (newStatus !== 'received' && previousDBStatus === 'received') {
      await applyReceivedStock(items, 'subtract')
    }
    fetchAll()
  }

  async function handleConfirmShippedDate() {
    if (!dateModalPO || !shippedDateInput) return
    await supabase.from('purchase_orders').update({ shipped_at: shippedDateInput, status: 'shipped' }).eq('id', dateModalPO.id)
    setShowShippedModal(false)
    setDateModalPO(null)
    setShippedDateInput('')
    fetchAll()
  }

  async function handleConfirmReceivedDate() {
    if (!dateModalPO || !receivedDateInput) return
    // Fetch DB status before update to prevent duplicate stock increase
    const { data: currentPOState } = await supabase
      .from('purchase_orders').select('status').eq('id', dateModalPO.id).single()
    const previousDBStatus = currentPOState?.status

    await supabase.from('purchase_orders').update({ received_at: receivedDateInput, status: 'received' }).eq('id', dateModalPO.id)

    if (previousDBStatus !== 'received') {
      const items = (poItems[dateModalPO.id] || []).map(i => ({
        material_type: i.material_type, material_id: i.material_id,
        quantity: i.quantity, unit_price: i.unit_price, ml_conversion: i.ml_conversion,
        pallet_count: i.pallet_count, purchase_unit: i.purchase_unit, weight_per_drum: i.weight_per_drum,
      }))
      const datePoCtx = {
        po_id: dateModalPO.id,
        exchange_rate: dateModalPO.exchange_rate ?? null,
        shipping_cad: dateModalPO.shipping_cad ?? null,
        brokerage_cad: dateModalPO.brokerage_cad ?? null,
        duty_cad: dateModalPO.duty_cad ?? null,
      }
      await applyReceivedStock(items, 'add', datePoCtx)
    }
    setShowReceivedModal(false)
    setDateModalPO(null)
    setReceivedDateInput('')
    fetchAll()
  }

  function handleExport() {
    // Derive per-PO HST amounts.
    // If DB columns (shipping_taxable / brokerage_taxable) exist use them directly.
    // For records predating that migration, reverse-engineer from tax_amount via
    // 13% rate checks with 0.5% tolerance.
    function calcHst(po: PO): { ship: number | undefined; brok: number | undefined } {
      if (po.shipping_taxable != null || po.brokerage_taxable != null) {
        return {
          ship: po.shipping_cad != null ? (po.shipping_taxable ? po.shipping_cad * 0.13 : 0) : undefined,
          brok: po.brokerage_cad != null ? (po.brokerage_taxable ? po.brokerage_cad * 0.13 : 0) : undefined,
        }
      }
      const taxAmt = po.tax_amount ?? 0
      const expShip = (po.shipping_cad ?? 0) * 0.13
      const expBrok = (po.brokerage_cad ?? 0) * 0.13
      const expBoth = expShip + expBrok
      const eps = 0.005
      const near = (a: number, b: number) => b > 0 && Math.abs(a - b) / b < eps
      if (taxAmt === 0) return {
        ship: po.shipping_cad != null ? 0 : undefined,
        brok: po.brokerage_cad != null ? 0 : undefined,
      }
      if (near(taxAmt, expBoth)) return { ship: expShip, brok: expBrok }
      if (near(taxAmt, expShip)) return { ship: taxAmt, brok: po.brokerage_cad != null ? 0 : undefined }
      if (near(taxAmt, expBrok)) return { ship: po.shipping_cad != null ? 0 : undefined, brok: taxAmt }
      return { ship: taxAmt, brok: po.brokerage_cad != null ? 0 : undefined }
    }

    const poHeaders = [
      'Invoice #', 'Supplier', 'Order Date', 'Ship Date', 'Received Date', 'Status',
      'Items Subtotal (USD)', 'Wire Discount (%)', 'Wire Discount Amount (USD)',
      'International Fee (USD)', 'USD Invoice Amount', 'CAD Invoice Amount (wire)',
      'Exchange Rate',
      'Shipping (CAD)', 'Shipping HST Amount (CAD)',
      'Brokerage (CAD)', 'Brokerage HST Amount (CAD)',
      'Duty (CAD)', 'GST Amount (CAD)', 'Grand Total (CAD)', 'Notes',
    ]

    const poRows: (string | number | undefined)[][] = pos.map(po => {
      const isUSD = po.amount_usd != null && po.exchange_rate != null
      const items = poItems[po.id] || []
      const itemsSubtotalUSD = isUSD ? items.reduce((s, i) => s + i.quantity * i.unit_price, 0) : undefined
      // Store as decimal fraction so "0.00%" numFmt renders correctly (e.g. 2% → 0.02)
      const wireDiscPct = isUSD && po.wire_discount_pct != null ? po.wire_discount_pct / 100 : undefined
      const wireDiscAmtUSD = isUSD && itemsSubtotalUSD != null && po.wire_discount_pct
        ? itemsSubtotalUSD * (po.wire_discount_pct / 100)
        : undefined
      const intlFeeUSD = isUSD && po.international_fee_cad != null && po.exchange_rate
        ? po.international_fee_cad / po.exchange_rate
        : undefined
      const usdInvoiceAmt = isUSD && po.amount_usd != null ? po.amount_usd : undefined
      const cadInvoiceAmt = isUSD && po.amount_usd != null && po.exchange_rate != null
        ? po.amount_usd * po.exchange_rate
        : undefined
      const exchangeRate = isUSD && po.exchange_rate != null ? po.exchange_rate : undefined
      const { ship: shippingHst, brok: brokerageHst } = calcHst(po)
      return [
        po.po_number ?? '',
        po.suppliers?.name ?? '',
        po.ordered_at?.slice(0, 10) ?? '',
        po.shipped_at?.slice(0, 10) ?? '',
        po.received_at?.slice(0, 10) ?? '',
        po.status,
        itemsSubtotalUSD,
        wireDiscPct,
        wireDiscAmtUSD,
        intlFeeUSD,
        usdInvoiceAmt,
        cadInvoiceAmt,
        exchangeRate,
        po.shipping_cad ?? undefined,
        shippingHst,
        po.brokerage_cad ?? undefined,
        brokerageHst,
        po.duty_cad ?? undefined,
        po.gst_amount_cad ?? undefined,
        po.cost_total_cad,
        po.notes ?? '',
      ]
    })

    const totals = pos.reduce((acc, po) => {
      const { ship: sh, brok: bk } = calcHst(po)
      return {
        ship: acc.ship + (po.shipping_cad ?? 0),
        shipHst: acc.shipHst + (sh ?? 0),
        brok: acc.brok + (po.brokerage_cad ?? 0),
        brokHst: acc.brokHst + (bk ?? 0),
        duty: acc.duty + (po.duty_cad ?? 0),
        gst: acc.gst + (po.gst_amount_cad ?? 0),
        grand: acc.grand + (po.cost_total_cad ?? 0),
      }
    }, { ship: 0, shipHst: 0, brok: 0, brokHst: 0, duty: 0, gst: 0, grand: 0 })

    const poTotalRow: (string | number | undefined)[] = [
      'TOTAL', '', '', '', '', '',
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      totals.ship, totals.shipHst,
      totals.brok, totals.brokHst,
      totals.duty, totals.gst, totals.grand, '',
    ]

    const ws = XLSX.utils.aoa_to_sheet([poHeaders, ...poRows, poTotalRow])

    // Apply numFmt to every numeric cell (skip header row 0)
    const wsRange = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
    const CURR = '$#,##0.00'
    const currCols = new Set([6, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19])
    for (let r = 1; r <= wsRange.e.r; r++) {
      for (let c = 0; c <= wsRange.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (!cell || cell.t !== 'n') continue
        if (currCols.has(c)) cell.z = CURR
        else if (c === 12) cell.z = '0.0000'
        else if (c === 7) cell.z = '0.00%'
      }
    }

    const itemHeaders = ['PO Number', 'Material Type', 'Item No', 'Name', 'Quantity', 'Unit Price', 'Line Total']
    const itemRows: (string | number)[][] = []
    let itemTotalQty = 0, itemTotalAmt = 0
    for (const po of pos) {
      for (const item of (poItems[po.id] || [])) {
        const mat = materials.find(m => m.id === item.material_id)
        const lineTotal = item.quantity * item.unit_price
        itemRows.push([po.po_number ?? '', item.material_type, mat?.item_no ?? '', mat?.name ?? '', item.quantity, item.unit_price, lineTotal])
        itemTotalQty += item.quantity
        itemTotalAmt += lineTotal
      }
    }
    const itemTotalRow = ['TOTAL', '', '', '', itemTotalQty, '', itemTotalAmt]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Orders')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows, itemTotalRow]), 'PO Items')
    XLSX.writeFile(wb, `purchasing_${selectedYear}.xlsx`)
  }

  const filtered = pos.filter(po =>
    po.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    getPOItemNamesStr(po).toLowerCase().includes(search.toLowerCase()) ||
    po.status?.toLowerCase().includes(search.toLowerCase()) ||
    (po.po_number || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <MainLayout>
      <style>{`
        @media (max-width: 640px) {
          .modal-overlay { align-items: flex-start !important; padding: 0 !important; }
          .modal-box { border-radius: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 100svh; }
          .po-grid-2, .po-grid-3, .po-grid-4 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 16px', width: '300px' }}>
          <Search size={16} color='#94a3b8' />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search supplier, item, status...' style={{ border: 'none', outline: 'none', fontSize: '14px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#374151', outline: 'none', background: '#fff' }}>
            {Array.from({ length: 21 }, (_, i) => 2020 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Download size={15} /> Export Excel
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreateError(''); setCreateForm({ po_number: '', supplier_id: '', ordered_at: getLocalDateString(), purchase_currency: 'USD', international_fee_usd: '', wire_discount_pct: '', tax_rate: '0', shipping_cad: '', brokerage_cad: '', duty_cad: '', gst_amount_cad: '', amount_cad: '', notes: '' }); setCreateShippingTaxable(false); setCreateBrokerageTaxable(false); setCreateLineItems([]); setCreateSupplier(null); setCreateFiles([]) }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
          >
            <Plus size={16} /> New PO
          </button>
        </div>
      </div>

      {/* PO Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <ShoppingCart size={32} color='#e2e8f0' style={{ display: 'block', margin: '0 auto 8px' }} />
          No purchase orders yet
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1380px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Invoice #', 'Supplier', 'Date', 'Items', 'USD Invoice', 'CAD Invoice', 'Additional (CAD)', 'Total (CAD)', 'Status', 'Shipped', 'Received', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: i >= 4 && i <= 7 ? 'right' : 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((po, i) => {
                const st = STATUS_STYLE[po.status] || STATUS_STYLE.ordered
                const items = poItems[po.id] || []
                const isUsdPO = po.exchange_rate != null && po.amount_usd != null
                const cadInvoice = isUsdPO
                  ? po.amount_usd! * po.exchange_rate!
                  : items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
                const additionalCad = (po.cost_total_cad || 0) - cadInvoice
                const itemLabel = items.length === 0 ? '—' : items.length === 1 ? '1 item' : `${items.length} items`
                const itemTooltip = items.map(it => {
                  const mat = materials.find(m => m.id === it.material_id)
                  return mat ? `${mat.item_no} — ${mat.name}` : '—'
                }).join('\n')
                return (
                  <tr key={po.id} onClick={() => openDetail(po)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px', whiteSpace: 'nowrap' }}>{po.po_number || '—'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '500', color: '#374151' }}>{po.suppliers?.name || '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px', whiteSpace: 'nowrap' }}>{formatTorontoDate(po.ordered_at || '')}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', cursor: itemTooltip ? 'help' : 'pointer' }} title={itemTooltip}>{itemLabel}</td>
                    <td style={{ padding: '12px 16px', color: isUsdPO ? '#1e293b' : '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isUsdPO ? `$${formatCurrency(po.amount_usd!)} USD` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#1e293b', textAlign: 'right', whiteSpace: 'nowrap' }}>${formatCurrency(cadInvoice)}</td>
                    <td style={{ padding: '12px 16px', color: additionalCad > 0.005 ? '#1e293b' : '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {additionalCad > 0.005 ? `$${formatCurrency(additionalCad)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b', textAlign: 'right', whiteSpace: 'nowrap' }}>${formatCurrency(po.cost_total_cad || 0)}</td>
                    <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                      <select
                        value={po.status}
                        onChange={e => handleTableStatusChange(e.target.value, po)}
                        style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}40`, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '500', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value='ordered'>Ordered</option>
                        <option value='shipped'>Shipped</option>
                        <option value='received'>Received</option>
                        <option value='cancelled'>Cancelled</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '13px' }} onClick={e => e.stopPropagation()}>
                      {po.shipped_at ? (
                        <button onClick={() => { setDateModalPO(po); setShippedDateInput(po.shipped_at!.slice(0, 10)); setShowShippedModal(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', fontSize: '13px', padding: '2px 0', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                          {formatTorontoDate(po.shipped_at)}
                        </button>
                      ) : (
                        <button onClick={() => { setDateModalPO(po); setShippedDateInput(getLocalDateString()); setShowShippedModal(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: '2px 0' }}>
                          + Add
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '13px' }} onClick={e => e.stopPropagation()}>
                      {po.received_at ? (
                        <button onClick={() => { setDateModalPO(po); setReceivedDateInput(po.received_at!.slice(0, 10)); setShowReceivedModal(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: '13px', padding: '2px 0', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                          {formatTorontoDate(po.received_at)}
                        </button>
                      ) : (po.status === 'shipped' || po.status === 'received') ? (
                        <button onClick={() => { setDateModalPO(po); setReceivedDateInput(getLocalDateString()); setShowReceivedModal(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', padding: '2px 0' }}>
                          + Add
                        </button>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {(poAttachments[po.id]?.length ?? 0) > 0 && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              const attachs = poAttachments[po.id]
                              if (attachs.length === 1) {
                                window.open(attachs[0].file_url, '_blank')
                              } else {
                                openAttachments(e, po)
                              }
                            }}
                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <Eye size={13} /> View
                          </button>
                        )}
                        <button onClick={e => openAttachments(e, po)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: (poAttachments[po.id]?.length ?? 0) > 0 ? '#2563eb' : '#94a3b8' }}>
                          <Paperclip size={15} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setDetailPO(po); setShowDeleteConfirm(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create PO Modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={closeCreate}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '900px', margin: '20px auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>New Purchase Order</h2>
              <button onClick={closeCreate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            {/* Invoice# + Supplier + Date */}
            <div className="po-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={lbl}>Invoice #</label>
                <input type='text' value={createForm.po_number} onChange={e => setCreateForm(f => ({ ...f, po_number: e.target.value }))} placeholder='e.g. PO-2024-001' style={inp} />
              </div>
              <div>
                <label style={lbl}>Supplier *</label>
                <select value={createForm.supplier_id} onChange={e => handleSupplierChange(e.target.value)} style={inp}>
                  <option value=''>Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Order Date *</label>
                <input type='date' value={createForm.ordered_at} onChange={e => setCreateForm(f => ({ ...f, ordered_at: e.target.value }))} style={inp} />
              </div>
            </div>

            {/* Materials table */}
            {createSupplier && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ ...lbl, marginBottom: '8px' }}>Materials — enter qty for items to include</label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', maxHeight: '400px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Type</th>
                        <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Item No</th>
                        <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Item Description</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Qty</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit Price</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {createLineItems.map((item, idx) => (
                        <tr key={item.material_id} style={{ borderBottom: '1px solid #f1f5f9', background: item.qty > 0 ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '7px 14px' }}>
                            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', fontWeight: '500', background: item.material_type === 'raw_material' ? '#eff6ff' : '#fef3c7', color: item.material_type === 'raw_material' ? '#2563eb' : '#d97706' }}>
                              {item.material_type === 'raw_material' ? 'Raw' : 'Pkg'}
                            </span>
                          </td>
                          <td style={{ padding: '7px 14px', color: '#2563eb', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.item_no}</td>
                          <td style={{ padding: '7px 14px', color: '#374151' }}>{item.name}</td>
                          <td style={{ padding: '7px 14px', textAlign: 'right', color: '#64748b' }}>{item.unit}</td>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                            <input type='text' inputMode='decimal'
                              value={item.qty_str}
                              onChange={e => updateCreateQty(idx, e.target.value)}
                              placeholder='0'
                              style={{ ...numInp, padding: '4px 8px', fontSize: '13px', width: '80px' }}
                            />
                            {item.material_type === 'raw_material' && (
                              <div style={{ marginTop: '4px' }}>
                                <select
                                  value={item.purchase_unit}
                                  onChange={e => updateCreatePurchaseUnit(idx, e.target.value)}
                                  style={{ fontSize: '11px', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: '4px', color: '#374151', background: '#fff' }}
                                >
                                  <option value='ml'>ml</option>
                                  <option value='kg'>kg</option>
                                  <option value='drum'>drum</option>
                                  <option value='gallon'>gallon</option>
                                  <option value='pail'>pail</option>
                                </select>
                              </div>
                            )}
                            {item.material_type === 'raw_material' && ['drum', 'gallon', 'pail'].includes(item.purchase_unit || '') && (
                              <div style={{ marginTop: '4px' }}>
                                <input type='text' inputMode='decimal'
                                  value={item.weight_per_drum_str}
                                  onChange={e => updateCreateWeightPerDrum(idx, e.target.value)}
                                  placeholder={item.purchase_unit === 'gallon' ? 'ml/gal' : item.purchase_unit === 'pail' ? 'kg/pail' : 'kg/drum'}
                                  style={{ ...numInp, padding: '2px 6px', fontSize: '11px', width: '80px' }}
                                />
                              </div>
                            )}
                            {item.material_type === 'packaging' && (
                              <div style={{ marginTop: '4px' }}>
                                <input type='text' inputMode='decimal'
                                  value={item.pallet_count_str}
                                  onChange={e => updateCreatePalletCount(idx, e.target.value)}
                                  placeholder='pallets'
                                  style={{ ...numInp, padding: '2px 6px', fontSize: '11px', width: '80px' }}
                                />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                              <span style={{ position: 'absolute', left: '8px', color: '#64748b', fontSize: '13px', pointerEvents: 'none' }}>$</span>
                              <input type='text' inputMode='decimal'
                                value={item.price_str}
                                onChange={e => updateCreatePrice(idx, e.target.value)}
                                placeholder='0.00'
                                style={{ ...numInp, padding: '4px 8px 4px 18px', fontSize: '13px', width: '90px' }}
                              />
                            </div>
                            {item.material_type === 'raw_material' && item.purchase_unit !== 'ml' && item.unit_price > 0 && (() => {
                              const pu = item.purchase_unit || 'ml'
                              let mlPerUnit = 0
                              if (pu === 'kg') mlPerUnit = 1000
                              else if (pu === 'drum') mlPerUnit = (item.weight_per_drum || 0) * 1000
                              else if (pu === 'gallon') mlPerUnit = item.weight_per_drum || 0
                              else if (pu === 'pail') mlPerUnit = (item.weight_per_drum || 0) * 1000
                              const cadPerMl = mlPerUnit > 0 ? item.unit_price / mlPerUnit : 0
                              return cadPerMl > 0 ? <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>${cadPerMl.toFixed(4)}/ml</div> : null
                            })()}
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: '500', color: item.qty > 0 ? '#1e293b' : '#94a3b8' }}>
                            {item.qty > 0 ? `$${formatCurrency(item.total)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                  <span>{activeCreateItems.length} item(s) with qty &gt; 0</span>
                  {createSubtotalUsd > 0 && <span style={{ fontWeight: '600', color: '#1e293b' }}>Subtotal ({createForm.purchase_currency}): ${formatCurrency(createSubtotalUsd)}</span>}
                </div>
              </div>
            )}

            {/* Purchase type toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>Purchase Type:</span>
              {(['USD', 'CAD'] as const).map(c => (
                <button type='button' key={c} onClick={() => setCreateForm(f => ({ ...f, purchase_currency: c }))}
                  style={{ fontSize: '13px', padding: '5px 14px', border: '1px solid', borderRadius: '6px', cursor: 'pointer', fontWeight: createForm.purchase_currency === c ? '600' : '400', background: createForm.purchase_currency === c ? '#2563eb' : '#fff', color: createForm.purchase_currency === c ? '#fff' : '#64748b', borderColor: createForm.purchase_currency === c ? '#2563eb' : '#e2e8f0' }}>
                  {c === 'USD' ? 'USD (International)' : 'CAD (Local)'}
                </button>
              ))}
            </div>

            {/* USD mode: invoice amounts + intl fee + wire discount */}
            {createForm.purchase_currency === 'USD' && (
              <div style={{ marginBottom: '14px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>USD Invoice</div>
                <div className="po-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={lbl}>Wire Discount (%)</label>
                    <input type='number' min='0' step='0.01' value={createForm.wire_discount_pct} onChange={e => setCreateForm(f => ({ ...f, wire_discount_pct: e.target.value }))} placeholder='0.00' style={numInp} />
                    {createWireDiscountUsd > 0 && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>= −USD ${formatCurrency(createWireDiscountUsd)}</div>}
                  </div>
                  <div>
                    <label style={lbl}>International Fee (USD)</label>
                    <input type='number' min='0' step='0.01' value={createForm.international_fee_usd} onChange={e => setCreateForm(f => ({ ...f, international_fee_usd: e.target.value }))} placeholder='0.00' style={numInp} />
                    {createIntlFeeUsd > 0 && createExchangeRate && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>= CAD ${formatCurrency(createIntlFeeUsd * createExchangeRateNum)}</div>}
                  </div>
                </div>
                <div className="po-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={lbl}>Amount (USD)</label>
                    <input readOnly value={createAfterIntlUsd > 0 ? createAfterIntlUsd.toFixed(2) : ''} placeholder='auto' style={{ ...inp, background: '#f1f5f9', color: '#64748b', textAlign: 'right' }} />
                    {createAfterIntlUsd > 0 && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>= Subtotal − Discount + Intl Fee</div>}
                  </div>
                  <div>
                    <label style={lbl}>Amount (CAD) — wire</label>
                    <input type='number' min='0' step='0.01' value={createForm.amount_cad} onChange={e => setCreateForm(f => ({ ...f, amount_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                  </div>
                  <div>
                    <label style={lbl}>Exchange Rate</label>
                    <input readOnly value={createExchangeRate ?? ''} placeholder='auto' style={{ ...inp, background: '#f1f5f9', color: '#64748b', textAlign: 'right' }} />
                  </div>
                </div>
              </div>
            )}

            {/* CAD mode: tax rate */}
            {createForm.purchase_currency === 'CAD' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={lbl}>Tax Rate (%)</label>
                <input type='text' inputMode='decimal' value={createForm.tax_rate}
                  onChange={e => { if (e.target.value === '' || /^[0-9]*\.?[0-9]*$/.test(e.target.value)) setCreateForm(f => ({ ...f, tax_rate: e.target.value })) }}
                  placeholder='0' style={numInp} />
              </div>
            )}

            {/* CAD extras: Shipping + HST / Brokerage + HST / Duty / GST */}
            <div className="po-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ ...lbl, marginBottom: 0 }}>Shipping (CAD)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontWeight: 'normal' }}>
                    <input type='checkbox' checked={createShippingTaxable} onChange={e => setCreateShippingTaxable(e.target.checked)} style={{ accentColor: '#2563eb' }} />
                    +HST 13%
                  </label>
                </div>
                <input type='number' min='0' step='0.01' value={createForm.shipping_cad} onChange={e => setCreateForm(f => ({ ...f, shipping_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                {createShippingTaxable && createShipping > 0 && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textAlign: 'right' }}>+HST: ${formatCurrency(createShippingHst)}</div>}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ ...lbl, marginBottom: 0 }}>Brokerage (CAD)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontWeight: 'normal' }}>
                    <input type='checkbox' checked={createBrokerageTaxable} onChange={e => setCreateBrokerageTaxable(e.target.checked)} style={{ accentColor: '#2563eb' }} />
                    +HST 13%
                  </label>
                </div>
                <input type='number' min='0' step='0.01' value={createForm.brokerage_cad} onChange={e => setCreateForm(f => ({ ...f, brokerage_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                {createBrokerageTaxable && createBrokerageRaw > 0 && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textAlign: 'right' }}>+HST: ${formatCurrency(createBrokerageHst)}</div>}
              </div>
              <div>
                <label style={lbl}>Duty (CAD)</label>
                <input type='number' min='0' step='0.01' value={createForm.duty_cad} onChange={e => setCreateForm(f => ({ ...f, duty_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
              <div>
                <label style={lbl}>GST Amount (CAD)</label>
                <input type='number' min='0' step='0.01' value={createForm.gst_amount_cad} onChange={e => setCreateForm(f => ({ ...f, gst_amount_cad: e.target.value }))} placeholder='0.00' style={numInp} />
              </div>
            </div>

            {/* Summary */}
            {createSupplier && (
              <div style={{ marginBottom: '14px', padding: '12px 16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                  <span>Items Subtotal ({createForm.purchase_currency})</span>
                  <span>${formatCurrency(createSubtotalUsd)}</span>
                </div>
                {createForm.purchase_currency === 'USD' && (<>
                  {createWireDiscountUsd > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                      <span>− Wire Discount ({createWireDiscountPct}%)</span>
                      <span style={{ color: '#dc2626' }}>−${formatCurrency(createWireDiscountUsd)} USD</span>
                    </div>
                  )}
                  {createIntlFeeUsd > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                      <span>+ Intl Fee</span>
                      <span>+${formatCurrency(createIntlFeeUsd)} USD</span>
                    </div>
                  )}
                  {createWireCad > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                      <span>Wire Amount (CAD){createExchangeRate ? ` × ${createExchangeRate}` : ''}</span>
                      <span>${formatCurrency(createWireCad)}</span>
                    </div>
                  )}
                </>)}
                {createForm.purchase_currency === 'CAD' && createCadTax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                    <span>Tax ({createTaxRate}%)</span>
                    <span>${formatCurrency(createCadTax)}</span>
                  </div>
                )}
                {createShipping > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                    <span>Shipping{createShippingTaxable ? ' + HST' : ''}</span>
                    <span>${formatCurrency(createShipping + createShippingHst)}</span>
                  </div>
                )}
                {createBrokerageRaw > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                    <span>Brokerage{createBrokerageTaxable ? ' + HST' : ''}</span>
                    <span>${formatCurrency(createBrokerageRaw + createBrokerageHst)}</span>
                  </div>
                )}
                {createDuty > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                    <span>Duty</span>
                    <span>${formatCurrency(createDuty)}</span>
                  </div>
                )}
                {createGstAmountCad > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '6px' }}>
                    <span>GST</span>
                    <span>${formatCurrency(createGstAmountCad)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '700', color: '#1d4ed8', borderTop: '1px solid #bfdbfe', paddingTop: '8px' }}>
                  <span>TOTAL (CAD)</span>
                  <span>${formatCurrency(createTotal)}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Notes</label>
              <textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Optional notes...' style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {/* Attachments */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Attachments</label>
              <input id="create-file-input" ref={createFileInputRef} type='file' multiple style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files) {
                    setCreateFiles(prev => [...prev, ...Array.from(e.target.files!)])
                    e.target.value = ''
                  }
                }} />
              <label htmlFor="create-file-input"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                <Paperclip size={14} /> Choose Files
              </label>
              {createFiles.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {createFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                      <button type='button' onClick={() => setCreateFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px 4px', marginLeft: '8px', flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {createError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>{createError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={closeCreate} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {saving ? 'Saving...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail / Edit Modal ── */}
      {showDetail && detailPO && (
        <div className="modal-overlay" onClick={() => { setShowDetail(false); setUpdateError(''); setEditNewFiles([]); setEditUploadStatus('') }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '900px', margin: '20px auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 2px' }}>Edit Purchase Order</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => setShowDeleteConfirm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}><Trash2 size={16} /></button>
                <button onClick={() => { setShowDetail(false); setUpdateError(''); setEditNewFiles([]); setEditUploadStatus('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              </div>
            </div>

            {/* Invoice# + Supplier + Date + Status */}
            <div className="po-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={lbl}>Invoice #</label>
                <input type='text' value={editForm.po_number} onChange={e => setEditForm(f => ({ ...f, po_number: e.target.value }))} placeholder='e.g. PO-2024-001' style={inp} disabled={isReadOnly} />
              </div>
              <div>
                <label style={lbl}>Supplier</label>
                <select value={editForm.supplier_id} onChange={e => setEditForm(f => ({ ...f, supplier_id: e.target.value }))} style={inp} disabled={isReadOnly}>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Order Date</label>
                <input type='date' value={editForm.ordered_at} onChange={e => setEditForm(f => ({ ...f, ordered_at: e.target.value }))} style={inp} disabled={isReadOnly} />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={inp} disabled={isReadOnly}>
                  <option value='ordered'>Ordered</option>
                  <option value='shipped'>Shipped</option>
                  <option value='received'>Received</option>
                  <option value='cancelled'>Cancelled</option>
                </select>
              </div>
            </div>


            {/* Materials table */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ ...lbl, marginBottom: '8px' }}>Materials</label>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Type</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Item No</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Item Description</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Unit Price</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isReadOnly ? editLineItems.filter(item => item.qty > 0) : editLineItems).map((item, idx) => (
                      <tr key={item.material_id} style={{ borderBottom: '1px solid #f1f5f9', background: item.qty > 0 ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 14px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', fontWeight: '500', background: item.material_type === 'raw_material' ? '#eff6ff' : '#fef3c7', color: item.material_type === 'raw_material' ? '#2563eb' : '#d97706' }}>
                            {item.material_type === 'raw_material' ? 'Raw' : 'Pkg'}
                          </span>
                        </td>
                        <td style={{ padding: '7px 14px', color: '#2563eb', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.item_no}</td>
                        <td style={{ padding: '7px 14px', color: '#374151' }}>{item.name}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', color: '#64748b' }}>{item.unit}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                          {isReadOnly ? (
                            <div>
                              <span style={{ color: '#374151' }}>{item.qty > 0 ? item.qty : '—'}</span>
                              {item.material_type === 'raw_material' && item.purchase_unit && item.purchase_unit !== 'ml' && (
                                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                                  {item.purchase_unit}
                                  {item.purchase_unit === 'drum' && item.weight_per_drum ? ` (${item.weight_per_drum}kg/drum)` : ''}
                                  {item.purchase_unit === 'gallon' && item.weight_per_drum ? ` (${item.weight_per_drum}ml/gal)` : ''}
                                  {item.purchase_unit === 'pail' && item.weight_per_drum ? ` (${item.weight_per_drum}kg/pail)` : ''}
                                </div>
                              )}
                              {item.material_type === 'packaging' && item.pallet_count > 0 && (
                                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{item.pallet_count} pallets</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <input type='text' inputMode='decimal'
                                value={item.qty_str}
                                onChange={e => updateEditQty(idx, e.target.value)}
                                placeholder='0'
                                style={{ ...numInp, padding: '4px 8px', fontSize: '13px', width: '80px' }}
                              />
                              {item.material_type === 'raw_material' && (
                                <div style={{ marginTop: '4px' }}>
                                  <select
                                    value={item.purchase_unit}
                                    onChange={e => updateEditPurchaseUnit(idx, e.target.value)}
                                    style={{ fontSize: '11px', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: '4px', color: '#374151', background: '#fff' }}
                                  >
                                    <option value='ml'>ml</option>
                                    <option value='kg'>kg</option>
                                    <option value='drum'>drum</option>
                                    <option value='gallon'>gallon</option>
                                    <option value='pail'>pail</option>
                                  </select>
                                </div>
                              )}
                              {item.material_type === 'raw_material' && ['drum', 'gallon', 'pail'].includes(item.purchase_unit || '') && (
                                <div style={{ marginTop: '4px' }}>
                                  <input type='text' inputMode='decimal'
                                    value={item.weight_per_drum_str}
                                    onChange={e => updateEditWeightPerDrum(idx, e.target.value)}
                                    placeholder={item.purchase_unit === 'gallon' ? 'ml/gal' : item.purchase_unit === 'pail' ? 'kg/pail' : 'kg/drum'}
                                    style={{ ...numInp, padding: '2px 6px', fontSize: '11px', width: '80px' }}
                                  />
                                </div>
                              )}
                              {item.material_type === 'packaging' && (
                                <div style={{ marginTop: '4px' }}>
                                  <input type='text' inputMode='decimal'
                                    value={item.pallet_count_str}
                                    onChange={e => updateEditPalletCount(idx, e.target.value)}
                                    placeholder='pallets'
                                    style={{ ...numInp, padding: '2px 6px', fontSize: '11px', width: '80px' }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                          {isReadOnly ? (
                            <div>
                              <span style={{ color: '#64748b' }}>${formatPrice(item.unit_price)}</span>
                              {item.material_type === 'raw_material' && item.purchase_unit && item.purchase_unit !== 'ml' && item.unit_price > 0 && (() => {
                                const pu = item.purchase_unit
                                let mlPerUnit = 0
                                if (pu === 'kg') mlPerUnit = 1000
                                else if (pu === 'drum') mlPerUnit = (item.weight_per_drum || 0) * 1000
                                else if (pu === 'gallon') mlPerUnit = item.weight_per_drum || 0
                                else if (pu === 'pail') mlPerUnit = (item.weight_per_drum || 0) * 1000
                                const cadPerMl = mlPerUnit > 0 ? item.unit_price / mlPerUnit : 0
                                return cadPerMl > 0 ? <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>${cadPerMl.toFixed(4)}/ml</div> : null
                              })()}
                            </div>
                          ) : (
                            <div>
                              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '8px', color: '#64748b', fontSize: '13px', pointerEvents: 'none' }}>$</span>
                                <input type='text' inputMode='decimal'
                                  value={item.price_str}
                                  onChange={e => updateEditPrice(idx, e.target.value)}
                                  placeholder='0.00'
                                  style={{ ...numInp, padding: '4px 8px 4px 18px', fontSize: '13px', width: '90px' }}
                                />
                              </div>
                              {item.material_type === 'raw_material' && item.purchase_unit !== 'ml' && item.unit_price > 0 && (() => {
                                const pu = item.purchase_unit
                                let mlPerUnit = 0
                                if (pu === 'kg') mlPerUnit = 1000
                                else if (pu === 'drum') mlPerUnit = (item.weight_per_drum || 0) * 1000
                                else if (pu === 'gallon') mlPerUnit = item.weight_per_drum || 0
                                else if (pu === 'pail') mlPerUnit = (item.weight_per_drum || 0) * 1000
                                const cadPerMl = mlPerUnit > 0 ? item.unit_price / mlPerUnit : 0
                                return cadPerMl > 0 ? <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>${cadPerMl.toFixed(4)}/ml</div> : null
                              })()}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: '500', color: item.qty > 0 ? '#1e293b' : '#94a3b8' }}>
                          {item.qty > 0 ? `$${formatCurrency(item.total)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                <span>{activeEditItems.length} item(s) with qty &gt; 0</span>
                {editSubtotalUsd > 0 && <span style={{ fontWeight: '600', color: '#1e293b' }}>Subtotal ({editForm.purchase_currency}): ${formatCurrency(editSubtotalUsd)}</span>}
              </div>
            </div>

            {/* Cost fields */}
            {!isReadOnly && (
              <>
                {/* Purchase type toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>Purchase Type:</span>
                  {(['USD', 'CAD'] as const).map(c => (
                    <button type='button' key={c} onClick={() => setEditForm(f => ({ ...f, purchase_currency: c }))}
                      style={{ fontSize: '13px', padding: '5px 14px', border: '1px solid', borderRadius: '6px', cursor: 'pointer', fontWeight: editForm.purchase_currency === c ? '600' : '400', background: editForm.purchase_currency === c ? '#2563eb' : '#fff', color: editForm.purchase_currency === c ? '#fff' : '#64748b', borderColor: editForm.purchase_currency === c ? '#2563eb' : '#e2e8f0' }}>
                      {c === 'USD' ? 'USD (International)' : 'CAD (Local)'}
                    </button>
                  ))}
                </div>

                {/* USD mode: invoice amounts + intl fee + wire discount */}
                {editForm.purchase_currency === 'USD' && (
                  <div style={{ marginBottom: '14px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>USD Invoice</div>
                    <div className="po-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={lbl}>Wire Discount (%)</label>
                        <input type='number' min='0' step='0.01' value={editForm.wire_discount_pct} onChange={e => setEditForm(f => ({ ...f, wire_discount_pct: e.target.value }))} placeholder='0.00' style={numInp} />
                        {editWireDiscountUsd > 0 && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>= −USD ${formatCurrency(editWireDiscountUsd)}</div>}
                      </div>
                      <div>
                        <label style={lbl}>International Fee (USD)</label>
                        <input type='number' min='0' step='0.01' value={editForm.international_fee_usd} onChange={e => setEditForm(f => ({ ...f, international_fee_usd: e.target.value }))} placeholder='0.00' style={numInp} />
                        {editIntlFeeUsd > 0 && editExchangeRate && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>= CAD ${formatCurrency(editIntlFeeUsd * editExchangeRateNum)}</div>}
                      </div>
                    </div>
                    <div className="po-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={lbl}>Amount (USD)</label>
                        <input readOnly value={editAfterIntlUsd > 0 ? editAfterIntlUsd.toFixed(2) : ''} placeholder='auto' style={{ ...inp, background: '#f1f5f9', color: '#64748b', textAlign: 'right' }} />
                        {editAfterIntlUsd > 0 && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>= Subtotal − Discount + Intl Fee</div>}
                      </div>
                      <div>
                        <label style={lbl}>Amount (CAD) — wire</label>
                        <input type='number' min='0' step='0.01' value={editForm.amount_cad} onChange={e => setEditForm(f => ({ ...f, amount_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                      </div>
                      <div>
                        <label style={lbl}>Exchange Rate</label>
                        <input readOnly value={editExchangeRate ?? ''} placeholder='auto' style={{ ...inp, background: '#f1f5f9', color: '#64748b', textAlign: 'right' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* CAD mode: tax rate */}
                {editForm.purchase_currency === 'CAD' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={lbl}>Tax Rate (%)</label>
                    <input type='text' inputMode='decimal' value={editForm.tax_rate}
                      onChange={e => { if (e.target.value === '' || /^[0-9]*\.?[0-9]*$/.test(e.target.value)) setEditForm(f => ({ ...f, tax_rate: e.target.value })) }}
                      placeholder='0' style={numInp} />
                  </div>
                )}

                {/* CAD extras: Shipping + HST / Brokerage + HST / Duty / GST */}
                <div className="po-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <label style={{ ...lbl, marginBottom: 0 }}>Shipping (CAD)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontWeight: 'normal' }}>
                        <input type='checkbox' checked={editShippingTaxable} onChange={e => setEditShippingTaxable(e.target.checked)} style={{ accentColor: '#2563eb' }} />
                        +HST 13%
                      </label>
                    </div>
                    <input type='number' min='0' step='0.01' value={editForm.shipping_cad} onChange={e => setEditForm(f => ({ ...f, shipping_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                    {editShippingTaxable && editShipping > 0 && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textAlign: 'right' }}>+HST: ${formatCurrency(editShippingHst)}</div>}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <label style={{ ...lbl, marginBottom: 0 }}>Brokerage (CAD)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontWeight: 'normal' }}>
                        <input type='checkbox' checked={editBrokerageTaxable} onChange={e => setEditBrokerageTaxable(e.target.checked)} style={{ accentColor: '#2563eb' }} />
                        +HST 13%
                      </label>
                    </div>
                    <input type='number' min='0' step='0.01' value={editForm.brokerage_cad} onChange={e => setEditForm(f => ({ ...f, brokerage_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                    {editBrokerageTaxable && editBrokerageRaw > 0 && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', textAlign: 'right' }}>+HST: ${formatCurrency(editBrokerageHst)}</div>}
                  </div>
                  <div>
                    <label style={lbl}>Duty (CAD)</label>
                    <input type='number' min='0' step='0.01' value={editForm.duty_cad} onChange={e => setEditForm(f => ({ ...f, duty_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                  </div>
                  <div>
                    <label style={lbl}>GST Amount (CAD)</label>
                    <input type='number' min='0' step='0.01' value={editForm.gst_amount_cad} onChange={e => setEditForm(f => ({ ...f, gst_amount_cad: e.target.value }))} placeholder='0.00' style={numInp} />
                  </div>
                </div>
              </>
            )}

            {/* Summary */}
            <div style={{ marginBottom: '14px', padding: '12px 16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                <span>Items Subtotal ({editForm.purchase_currency})</span>
                <span>${formatCurrency(editSubtotalUsd)}</span>
              </div>
              {editForm.purchase_currency === 'USD' && (<>
                {editWireDiscountUsd > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                    <span>− Wire Discount ({editWireDiscountPct}%)</span>
                    <span style={{ color: '#dc2626' }}>−${formatCurrency(editWireDiscountUsd)} USD</span>
                  </div>
                )}
                {editIntlFeeUsd > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                    <span>+ Intl Fee</span>
                    <span>+${formatCurrency(editIntlFeeUsd)} USD</span>
                  </div>
                )}
                {editWireCad > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                    <span>Wire Amount (CAD){editExchangeRate ? ` × ${editExchangeRate}` : ''}</span>
                    <span>${formatCurrency(editWireCad)}</span>
                  </div>
                )}
              </>)}
              {editForm.purchase_currency === 'CAD' && editCadTax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                  <span>Tax ({editTaxRate}%)</span>
                  <span>${formatCurrency(editCadTax)}</span>
                </div>
              )}
              {editShipping > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                  <span>Shipping{editShippingTaxable ? ' + HST' : ''}</span>
                  <span>${formatCurrency(editShipping + editShippingHst)}</span>
                </div>
              )}
              {editBrokerageRaw > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                  <span>Brokerage{editBrokerageTaxable ? ' + HST' : ''}</span>
                  <span>${formatCurrency(editBrokerageRaw + editBrokerageHst)}</span>
                </div>
              )}
              {editDuty > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '4px' }}>
                  <span>Duty</span>
                  <span>${formatCurrency(editDuty)}</span>
                </div>
              )}
              {editGstAmountCad > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1d4ed8', marginBottom: '6px' }}>
                  <span>GST</span>
                  <span>${formatCurrency(editGstAmountCad)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '700', color: '#1d4ed8', borderTop: '1px solid #bfdbfe', paddingTop: '8px' }}>
                <span>TOTAL (CAD)</span>
                <span>${formatCurrency(editTotal)}</span>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Optional notes...' style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} disabled={isReadOnly} />
            </div>

            {/* Edit PO Attachments */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Attachments</label>
              {editAttachments.length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {editAttachments.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                      <a href={a.file_url} target='_blank' rel='noopener noreferrer'
                        style={{ color: '#2563eb', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                        onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'}
                        onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'}>
                        <Paperclip size={13} style={{ flexShrink: 0 }} />{a.file_name}
                      </a>
                      <button type='button' onClick={() => handleDeleteEditAttachment(a.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px 4px', marginLeft: '8px', flexShrink: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={editFileInputRef} type='file' multiple style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files) {
                    setEditNewFiles(prev => [...prev, ...Array.from(e.target.files!)])
                    e.target.value = ''
                  }
                }} />
              <button
                type='button'
                onClick={e => { e.stopPropagation(); editFileInputRef.current?.click() }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                <Paperclip size={14} /> Choose Files
              </button>
              {editNewFiles.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {editNewFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                      <button type='button' onClick={() => setEditNewFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px 4px', marginLeft: '8px', flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {editUploadStatus && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: editUploadStatus.startsWith('✓') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${editUploadStatus.startsWith('✓') ? '#bbf7d0' : '#fecaca'}`, borderRadius: '6px', fontSize: '13px', color: editUploadStatus.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
                  {editUploadStatus}
                </div>
              )}
              {editNewFiles.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type='button' onClick={handleUploadEditAttachments} disabled={uploadingEditAttachment}
                    style={{ padding: '7px 16px', background: uploadingEditAttachment ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: uploadingEditAttachment ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500' }}>
                    {uploadingEditAttachment ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              )}
            </div>

            {updateError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', color: '#dc2626' }}>{updateError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => { setShowDetail(false); setUpdateError(''); setEditNewFiles([]); setEditUploadStatus('') }} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>
                {isReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!isReadOnly && (
                <button onClick={handleUpdate} disabled={updating} style={{ padding: '9px 20px', background: updating ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: updating ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Attachments Modal ── */}
      {showAttachments && attachmentPO && (
        <div className="modal-overlay" onClick={() => { setShowAttachments(false); setAttachmentFiles([]); setAttachUploadStatus('') }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '520px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Attachments</h3>
              <button onClick={() => { setShowAttachments(false); setAttachmentFiles([]); setAttachUploadStatus('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            {(poAttachments[attachmentPO.id] || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '14px', background: '#f8fafc', borderRadius: '8px', marginBottom: '20px' }}>
                No attachments yet
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                {(poAttachments[attachmentPO.id] || []).map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                    <a href={a.file_url} target='_blank' rel='noopener noreferrer'
                      style={{ fontSize: '14px', color: '#2563eb', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'}>
                      <Paperclip size={13} style={{ flexShrink: 0 }} />
                      {a.file_name}
                    </a>
                    <button onClick={() => handleDeleteAttachment(a)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px', marginLeft: '8px', flexShrink: 0 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <input id="attach-file-input" ref={fileInputRef} type='file' multiple style={{ display: 'none' }}
                onChange={e => {
                  const files = e.target.files ? Array.from(e.target.files) : []
                  if (files.length > 0) {
                    setAttachmentFiles(prev => [...prev, ...files])
                  }
                  e.target.value = ''
                }} />
              <label htmlFor="attach-file-input"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                <Paperclip size={14} /> Choose Files
              </label>
              {attachmentFiles.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {attachmentFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                      <button type='button' onClick={() => setAttachmentFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px 4px', marginLeft: '8px', flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {attachUploadStatus && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: attachUploadStatus.startsWith('✓') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${attachUploadStatus.startsWith('✓') ? '#bbf7d0' : '#fecaca'}`, borderRadius: '6px', fontSize: '13px', color: attachUploadStatus.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
                {attachUploadStatus}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => { setShowAttachments(false); setAttachmentFiles([]); setAttachUploadStatus('') }}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Close</button>
              <button onClick={() => handleUploadAttachments()}
                disabled={uploadingAttachment || attachmentFiles.length === 0}
                style={{ padding: '8px 16px', background: uploadingAttachment || attachmentFiles.length === 0 ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: uploadingAttachment || attachmentFiles.length === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {uploadingAttachment ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shipped Date Modal ── */}
      {showShippedModal && dateModalPO && (
        <div className="modal-overlay" onClick={() => { setShowShippedModal(false); setDateModalPO(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '360px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 6px' }}>Shipped Date</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
              {dateModalPO.po_number || '—'} · {dateModalPO.suppliers?.name || ''}
            </p>
            <input type='date' value={shippedDateInput} onChange={e => setShippedDateInput(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '20px' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => { setShowShippedModal(false); setDateModalPO(null) }}
                style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleConfirmShippedDate} disabled={!shippedDateInput}
                style={{ padding: '8px 18px', background: shippedDateInput ? '#d97706' : '#fcd34d', color: '#fff', border: 'none', borderRadius: '6px', cursor: shippedDateInput ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '500' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Received Date Modal ── */}
      {showReceivedModal && dateModalPO && (
        <div className="modal-overlay" onClick={() => { setShowReceivedModal(false); setDateModalPO(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '360px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 6px' }}>Received Date</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 4px' }}>
              {dateModalPO.po_number || '—'} · {dateModalPO.suppliers?.name || ''}
            </p>
            {dateModalPO.status !== 'received' && (
              <p style={{ fontSize: '12px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '6px 10px', margin: '0 0 16px' }}>
                Status will be updated to Received and inventory will be incremented.
              </p>
            )}
            <input type='date' value={receivedDateInput} onChange={e => setReceivedDateInput(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '20px', marginTop: dateModalPO.status !== 'received' ? '0' : '16px' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => { setShowReceivedModal(false); setDateModalPO(null) }}
                style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleConfirmReceivedDate} disabled={!receivedDateInput}
                style={{ padding: '8px 18px', background: receivedDateInput ? '#16a34a' : '#86efac', color: '#fff', border: 'none', borderRadius: '6px', cursor: receivedDateInput ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '500' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {showDeleteConfirm && detailPO && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '20px' }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '380px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 12px', color: '#dc2626' }}>Delete Purchase Order</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px' }}>
              Are you sure? This cannot be undone.
              {detailPO.status === 'received' && (
                <span style={{ display: 'block', marginTop: '8px', color: '#92400e', fontWeight: '500' }}>
                  ⚠️ This PO is Received — inventory will NOT be automatically reversed.
                </span>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '8px 16px', background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500' }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
