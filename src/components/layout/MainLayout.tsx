'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'
import Header from './Header'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setChecking(false)
      }
    })
  }, [router])

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#64748b', fontSize: '14px' }}>
        Loading...
      </div>
    )
  }

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
      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="desktop-header">
            <Header />
          </div>
          <main className="main-content" style={{ padding: '24px', flex: 1, background: '#f8fafc', minHeight: '100vh' }}>
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
