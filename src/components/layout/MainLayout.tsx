'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'
import Header from './Header'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [pullY, setPullY] = useState(0)
  const [ptrState, setPtrState] = useState<'idle' | 'pulling' | 'ready' | 'refreshing' | 'done'>('idle')
  // displayState lags behind ptrState so the banner doesn't vanish instantly
  const [displayState, setDisplayState] = useState<typeof ptrState>('idle')
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const THRESHOLD = 65

  const updatePtrState = useCallback((s: typeof ptrState) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setPtrState(s)
    if (s === 'idle') {
      hideTimer.current = setTimeout(() => setDisplayState('idle'), 500)
    } else {
      setDisplayState(s)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else setChecking(false)
    })
  }, [router])

  useEffect(() => {
    let startY = 0
    let isPulling = false
    let currentY = 0
    let isRefreshing = false

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY
        isPulling = true
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPulling || isRefreshing) return
      const diff = e.touches[0].clientY - startY
      if (diff > 0 && window.scrollY === 0) {
        currentY = Math.min(diff * 0.5, THRESHOLD + 20)
        setPullY(currentY)
        updatePtrState(currentY >= THRESHOLD ? 'ready' : 'pulling')
      } else {
        isPulling = false
        currentY = 0
        setPullY(0)
        updatePtrState('idle')
      }
    }

    function onTouchEnd() {
      if (!isPulling) return
      isPulling = false
      if (currentY >= THRESHOLD && !isRefreshing) {
        isRefreshing = true
        updatePtrState('refreshing')
        router.refresh()
        setTimeout(() => {
          updatePtrState('done')
          setTimeout(() => {
            isRefreshing = false
            updatePtrState('idle')
            currentY = 0
            setPullY(0)
          }, 800)
        }, 1000)
      } else {
        currentY = 0
        setPullY(0)
        updatePtrState('idle')
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [router, updatePtrState])

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#64748b', fontSize: '14px' }}>
        Loading...
      </div>
    )
  }

  const ptrConfig = {
    idle:       { bg: '#1e293b', text: '↓  Pull to refresh',   show: false },
    pulling:    { bg: '#1e293b', text: '↓  Pull to refresh',   show: true  },
    ready:      { bg: '#2563eb', text: '↑  Release to refresh', show: true  },
    refreshing: { bg: '#2563eb', text: 'Refreshing...',         show: true  },
    done:       { bg: '#16a34a', text: '✓  Done',               show: true  },
  }
  const cfg = ptrConfig[displayState]

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .main-content { margin-left: 0 !important; margin-top: 56px !important; padding: 16px !important; }
          .desktop-header { display: none !important; }
          .ptr-banner { display: flex !important; }
        }
        @media (min-width: 769px) {
          .main-content { margin-left: 240px !important; margin-top: 64px !important; }
          .ptr-banner { display: none !important; }
        }
        @keyframes ptr-spin { to { transform: rotate(360deg) } }
        @keyframes ptr-slide-in { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes ptr-bar { 0% { left: -40% } 100% { left: 110% } }
      `}</style>

      {/* pull-to-refresh 배너 (모바일 전용) */}
      <div
        className='ptr-banner'
        style={{
          display: 'none',
          position: 'fixed',
          top: '56px',
          left: 0, right: 0,
          justifyContent: 'center',
          zIndex: 500,
          pointerEvents: 'none',
          padding: '6px 16px',
          transition: 'opacity 0.2s',
          opacity: cfg.show ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      >
        {(
          <div style={{
            background: cfg.bg,
            color: '#fff',
            borderRadius: '20px',
            padding: '8px 20px',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            animation: 'ptr-slide-in 0.15s ease',
            overflow: 'hidden',
            position: 'relative',
            minWidth: '160px',
            justifyContent: 'center',
          }}>
            {displayState === 'refreshing' && (
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#fff' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' style={{ animation: 'ptr-spin 0.7s linear infinite', flexShrink: 0 }}>
                <polyline points='23 4 23 10 17 10' />
                <path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10' />
              </svg>
            )}
            {cfg.text}
            {displayState === 'refreshing' && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, width: '40%', height: '100%', background: 'rgba(255,255,255,0.8)', borderRadius: '2px', animation: 'ptr-bar 1s ease-in-out infinite' }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="desktop-header">
            <Header />
          </div>
          <main
            className="main-content"
            style={{ padding: '24px', flex: 1, background: '#f8fafc', minHeight: '100vh' }}
          >
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
