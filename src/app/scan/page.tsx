'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { ScanLine, RotateCcw, Package, AlertTriangle, CheckCircle, Camera, Pencil, Save, X } from 'lucide-react'

const UNITS_PER_BOX = 36

interface Product {
  id: string
  sku: string
  name: string
  size_oz: number
  barcode_upc: string
  unit_cost_cad: number
  msrp_cad: number
  price_whs_cad: number
  current_stock: number
  reorder_threshold: number
  is_active: boolean
}

type ScanState = 'idle' | 'scanning' | 'found' | 'not_found' | 'error'

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [product, setProduct] = useState<Product | null>(null)
  const [scannedCode, setScannedCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const scannerRef = useRef<any>(null)

  const [editingStock, setEditingStock] = useState(false)
  const [stockMode, setStockMode] = useState<'units' | 'boxes'>('units')
  const [stockInput, setStockInput] = useState('')
  const [savingStock, setSavingStock] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
  }, [])

  function openEdit() {
    if (!product) return
    setStockMode('units')
    setStockInput(String(product.current_stock))
    setSaveSuccess(false)
    setEditingStock(true)
  }

  function cancelEdit() {
    setEditingStock(false)
    setSaveSuccess(false)
  }

  function handleModeToggle(mode: 'units' | 'boxes') {
    const current = parseFloat(stockInput) || 0
    if (mode === 'boxes' && stockMode === 'units') {
      setStockInput(String(Math.round(current / UNITS_PER_BOX * 100) / 100))
    } else if (mode === 'units' && stockMode === 'boxes') {
      setStockInput(String(Math.round(current * UNITS_PER_BOX)))
    }
    setStockMode(mode)
  }

  const computedUnits = stockMode === 'boxes'
    ? Math.round((parseFloat(stockInput) || 0) * UNITS_PER_BOX)
    : Math.round(parseFloat(stockInput) || 0)

  async function handleSaveStock() {
    if (!product) return
    setSavingStock(true)
    const newStock = computedUnits
    const { error } = await supabase.from('products').update({ current_stock: newStock }).eq('id', product.id)
    if (!error) {
      setProduct({ ...product, current_stock: newStock })
      setSaveSuccess(true)
      setEditingStock(false)
    }
    setSavingStock(false)
  }

  const startScanner = useCallback(async () => {
    setProduct(null)
    setScannedCode('')
    setErrorMsg('')
    setEditingStock(false)
    setSaveSuccess(false)
    setScanState('scanning')

    // Give React a tick to render the #qr-reader div before initializing
    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const html5QrCode = new Html5Qrcode('qr-reader')
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 120 } },
        async (decoded: string) => {
          await stopScanner()
          setScannedCode(decoded)

          const { data } = await supabase
            .from('products')
            .select('*')
            .or(`barcode_upc.eq.${decoded},barcode_itf14.eq.${decoded},sku.ilike.${decoded}`)
            .maybeSingle()

          if (data) {
            setProduct(data)
            setScanState('found')
          } else {
            setScanState('not_found')
          }
        },
        () => {}
      )
    } catch (err: any) {
      setScanState('error')
      const msg = err?.message || ''
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
        setErrorMsg('Camera permission is required. Please allow camera access in your browser settings.')
      } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('no camera')) {
        setErrorMsg('No camera found. Please make sure a camera is connected.')
      } else {
        setErrorMsg(`Unable to start camera. Check camera permissions in Safari → Settings. (${msg || 'unknown error'})`)
      }
    }
  }, [stopScanner])

  useEffect(() => {
    return () => { stopScanner() }
  }, [stopScanner])

  const isLowStock = product && product.current_stock <= product.reorder_threshold

  return (
    <MainLayout>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>Barcode Scanner</h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Point your camera at a product barcode</p>
        </div>

        {/* Start camera button (idle state) */}
        {scanState === 'idle' && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '40px 20px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ width: '72px', height: '72px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Camera size={32} color='#2563eb' />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Scan Barcode with Camera</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>Supports UPC / EAN / ITF-14 barcodes</div>
            <button
              onClick={startScanner}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 28px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
            >
              <Camera size={18} /> Start Camera
            </button>
          </div>
        )}

        {/* Camera viewfinder - shown only while scanning */}
        {scanState === 'scanning' && (
          <div style={{ position: 'relative', background: '#000', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
            <div id='qr-reader' style={{ width: '100%', minHeight: '240px' }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '260px', height: '120px', position: 'relative' }}>
                {[
                  { top: 0, left: 0, borderTop: '3px solid #2563eb', borderLeft: '3px solid #2563eb' },
                  { top: 0, right: 0, borderTop: '3px solid #2563eb', borderRight: '3px solid #2563eb' },
                  { bottom: 0, left: 0, borderBottom: '3px solid #2563eb', borderLeft: '3px solid #2563eb' },
                  { bottom: 0, right: 0, borderBottom: '3px solid #2563eb', borderRight: '3px solid #2563eb' },
                ].map((style, i) => (
                  <div key={i} style={{ position: 'absolute', width: '20px', height: '20px', ...style }} />
                ))}
                <style>{`
                  @keyframes scan { 0%,100% { top: 10px } 50% { top: calc(100% - 10px) } }
                  .scan-line { animation: scan 2s ease-in-out infinite; }
                `}</style>
                <div className='scan-line' style={{ position: 'absolute', left: '4px', right: '4px', height: '2px', background: 'rgba(37,99,235,0.8)', boxShadow: '0 0 8px #2563eb' }} />
              </div>
            </div>
          </div>
        )}

        {/* Scan result: product found */}
        {scanState === 'found' && product && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ background: isLowStock ? '#fef2f2' : '#f0fdf4', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isLowStock
                ? <AlertTriangle size={24} color='#dc2626' />
                : <CheckCircle size={24} color='#16a34a' />
              }
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: isLowStock ? '#dc2626' : '#16a34a' }}>
                  {isLowStock ? 'Low Stock' : 'In Stock'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Barcode: {scannedCode}</div>
              </div>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '20px' }}>
                <div style={{ width: '52px', height: '52px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={26} color='#2563eb' />
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', lineHeight: 1.2 }}>{product.name}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>{product.sku} · {product.size_oz} FL. OZ.</div>
                </div>
              </div>

              {!editingStock ? (
                <div style={{ background: isLowStock ? '#fef2f2' : '#f0fdf4', borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '16px', position: 'relative' }}>
                  <button
                    onClick={openEdit}
                    style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '500', color: '#374151', cursor: 'pointer' }}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Current Stock</div>
                  <div style={{ fontSize: '48px', fontWeight: '800', color: isLowStock ? '#dc2626' : '#16a34a', lineHeight: 1 }}>
                    {product.current_stock}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>units</div>
                  {isLowStock && (
                    <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px', fontWeight: '500' }}>
                      Reorder point: {product.reorder_threshold} units
                    </div>
                  )}
                  {saveSuccess && (
                    <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: '600', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <CheckCircle size={14} /> Stock updated!
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' }}>Edit Stock Quantity</div>

                  {/* Boxes / Units toggle */}
                  <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '8px', padding: '3px', marginBottom: '14px' }}>
                    {(['units', 'boxes'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => handleModeToggle(mode)}
                        style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', background: stockMode === mode ? '#fff' : 'transparent', color: stockMode === mode ? '#1e293b' : '#64748b', boxShadow: stockMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}
                      >
                        {mode === 'units' ? 'Units' : `Boxes (×${UNITS_PER_BOX})`}
                      </button>
                    ))}
                  </div>

                  <input
                    type='number'
                    min='0'
                    step={stockMode === 'boxes' ? '0.5' : '1'}
                    value={stockInput}
                    onChange={e => setStockInput(e.target.value)}
                    autoFocus
                    style={{ width: '100%', padding: '12px', border: '2px solid #2563eb', borderRadius: '8px', fontSize: '24px', fontWeight: '700', textAlign: 'center', outline: 'none', color: '#1e293b', boxSizing: 'border-box' }}
                  />

                  {stockMode === 'boxes' && (
                    <div style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      = <strong style={{ color: '#1e293b' }}>{computedUnits}</strong> units
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button onClick={cancelEdit} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontSize: '14px', cursor: 'pointer' }}>
                      <X size={15} /> Cancel
                    </button>
                    <button onClick={handleSaveStock} disabled={savingStock} style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', border: 'none', borderRadius: '8px', background: savingStock ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: savingStock ? 'not-allowed' : 'pointer' }}>
                      <Save size={15} /> {savingStock ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Cost', value: `$${product.unit_cost_cad?.toFixed(2)}` },
                  { label: 'WHS', value: `$${product.price_whs_cad?.toFixed(2)}` },
                  { label: 'MSRP', value: `$${product.msrp_cad?.toFixed(2)}` },
                ].map(item => (
                  <div key={item.label} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scan result: product not found */}
        {scanState === 'not_found' && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #fecaca', padding: '32px 20px', textAlign: 'center', marginBottom: '16px' }}>
            <Package size={36} color='#fca5a5' style={{ display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#dc2626', marginBottom: '6px' }}>Product not found</div>
            <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>{scannedCode}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>Add this barcode to a product in the Products page</div>
          </div>
        )}

        {/* Error */}
        {scanState === 'error' && (
          <div style={{ background: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca', padding: '32px 20px', textAlign: 'center', marginBottom: '16px' }}>
            <AlertTriangle size={36} color='#f87171' style={{ display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#dc2626', marginBottom: '8px' }}>Camera Error</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{errorMsg}</div>
          </div>
        )}

        {/* Scan again button */}
        {(scanState === 'found' || scanState === 'not_found' || scanState === 'error') && (
          <button
            onClick={startScanner}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
          >
            <RotateCcw size={18} /> Scan Again
          </button>
        )}

        {scanState === 'scanning' && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <ScanLine size={16} />
            Supports UPC / EAN / ITF-14 barcodes
          </div>
        )}
      </div>
    </MainLayout>
  )
}
