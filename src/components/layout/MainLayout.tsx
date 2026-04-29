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
  const mainRef = useRef<HTMLElement>(null)
  const touchStartY = useRef(0)
  const pulling = useRef(false)
  const THRESHOLD = 65

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else setChecking(false)
    })
  }, [router])

  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      if (el!.scrollTop === 0) {
        touchStartY.current = e.touches[0].clientY
        pulling.current = true
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || refreshing) return
      const diff = e.touches[0].clientY - touchStartY.current
      if (diff > 0 && el!.scrollTop === 0) {
        setPullY(Math.min(diff * 0.5, THRESHOLD + 20))
      } else {
        pulling.current = false
        setPullY(0)
      }
    }

    function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false
      if (pullY >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        router.refresh()
        setTimeout(() => { setRefreshing(false); setPullY(0) }, 1000)
      } else {
        setPullY(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [pullY, refreshing, router])

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
        }
        @media (min-width: 769px) {
          .main-content { margin-left: 240px !important; margin-top: 64px !important; }
        }
        @keyframes ptr-spin { to { transform: rotate(360deg) } }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="desktop-header">
            <Header />
          </div>
          <main
            ref={mainRef}
            className="main-content"
            style={{ padding: '24px', flex: 1, background: '#f8fafc', minHeight: '100vh', overscrollBehaviorY: 'contain', position: 'relative' }}
          >
            {/* pull-to-refresh 인디케이터 */}
            {showIndicator && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
                display: 'flex', justifyContent: 'center',
                paddingTop: `${Math.min(pullY, THRESHOLD) * 0.3 + 4}px`,
                transition: refreshing ? 'none' : 'padding 0.1s',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: refreshing ? 1 : indicatorSize,
                  transform: refreshing ? 'scale(1)' : `scale(${0.5 + indicatorSize * 0.5})`,
                  transition: refreshing ? 'none' : 'transform 0.1s, opacity 0.1s',
                }}>
                  <svg
                    width='18' height='18' viewBox='0 0 24 24' fill='none'
                    stroke='#2563eb' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'
                    style={{
                      transform: refreshing ? 'none' : `rotate(${indicatorSize * 270}deg)`,
                      animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
                    }}
                  >
                    <polyline points='23 4 23 10 17 10' />
                    <path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10' />
                  </svg>
                </div>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
