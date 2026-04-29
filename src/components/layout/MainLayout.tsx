'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'
import Header from './Header'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const THRESHOLD = 65

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
      } else {
        isPulling = false
        currentY = 0
        setPullY(0)
      }
    }

    function onTouchEnd() {
      if (!isPulling) return
      isPulling = false
      if (currentY >= THRESHOLD && !isRefreshing) {
        isRefreshing = true
        setRefreshing(true)
        router.refresh()
        setTimeout(() => {
          isRefreshing = false
          setRefreshing(false)
          currentY = 0
          setPullY(0)
        }, 1000)
      } else {
        currentY = 0
        setPullY(0)
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
  }, [router])

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#64748b', fontSize: '14px' }}>
        Loading...
      </div>
    )
  }

  const indicatorSize = Math.min(pullY / THRESHOLD, 1)
  const showIndicator = pullY > 8 || refreshing

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .main-content { margin-left: 0 !important; margin-top: 56px !important; }
          .desktop-header { display: none !important; }
          .ptr-indicator { display: flex !important; }
        }
        @media (min-width: 769px) {
          .main-content { margin-left: 240px !important; margin-top: 64px !important; }
          .ptr-indicator { display: none !important; }
        }
        @keyframes ptr-spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* pull-to-refresh 인디케이터 (모바일 전용, fixed) */}
      {showIndicator && (
        <div
          className='ptr-indicator'
          style={{
            display: 'none',
            position: 'fixed',
            top: `${56 + Math.min(pullY, THRESHOLD) * 0.5}px`,
            left: 0, right: 0,
            justifyContent: 'center',
            zIndex: 500,
            pointerEvents: 'none',
            transition: refreshing ? 'none' : 'top 0.05s',
          }}
        >
          <div style={{
            width: '38px', height: '38px', borderRadius: '50%',
            background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: refreshing ? 1 : indicatorSize,
            transform: refreshing ? 'scale(1)' : `scale(${0.4 + indicatorSize * 0.6})`,
            transition: refreshing ? 'none' : 'transform 0.05s, opacity 0.05s',
          }}>
            <svg
              width='18' height='18' viewBox='0 0 24 24' fill='none'
              stroke='#2563eb' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'
              style={{
                transform: refreshing ? 'none' : `rotate(${indicatorSize * 280}deg)`,
                animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
              }}
            >
              <polyline points='23 4 23 10 17 10' />
              <path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10' />
            </svg>
          </div>
        </div>
      )}
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
