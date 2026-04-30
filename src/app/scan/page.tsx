'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { supabase } from '@/lib/supabase'
import { ScanLine, RotateCcw, Package, AlertTriangle, CheckCircle, Camera } from 'lucide-react'

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

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
  }, [])

  const startScanner = useCallback(async () => {
    setProduct(null)
    setScannedCode('')
    setErrorMsg('')
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
        setErrorMsg('카메라 권한이 필요합니다. 브라우저 설정에서 카메라 접근을 허용해주세요.')
      } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('no camera')) {
        setErrorMsg('카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요.')
      } else {
        setErrorMsg(`카메라를 시작할 수 없습니다. Safari → 설정 → 카메라 권한을 확인해주세요. (${msg || 'unknown error'})`)
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

        {/* 카메라 시작 버튼 (idle 상태) */}
        {scanState === 'idle' && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '40px 20px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ width: '72px', height: '72px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Camera size={32} color='#2563eb' />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>카메라로 바코드 스캔</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>UPC / EAN / ITF-14 바코드 지원</div>
            <button
              onClick={startScanner}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 28px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
            >
              <Camera size={18} /> 카메라 시작
            </button>
          </div>
        )}

        {/* 카메라 뷰파인더 - scanning 상태일 때만 표시 */}
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

        {/* 스캔 결과: 제품 찾음 */}
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

              <div style={{ background: isLowStock ? '#fef2f2' : '#f0fdf4', borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
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
              </div>

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

        {/* 스캔 결과: 제품 없음 */}
        {scanState === 'not_found' && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #fecaca', padding: '32px 20px', textAlign: 'center', marginBottom: '16px' }}>
            <Package size={36} color='#fca5a5' style={{ display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#dc2626', marginBottom: '6px' }}>Product not found</div>
            <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>{scannedCode}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>Add this barcode to a product in the Products page</div>
          </div>
        )}

        {/* 에러 */}
        {scanState === 'error' && (
          <div style={{ background: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca', padding: '32px 20px', textAlign: 'center', marginBottom: '16px' }}>
            <AlertTriangle size={36} color='#f87171' style={{ display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#dc2626', marginBottom: '8px' }}>Camera Error</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>{errorMsg}</div>
          </div>
        )}

        {/* 다시 스캔 버튼 */}
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
