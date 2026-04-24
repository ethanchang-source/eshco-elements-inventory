'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Bell, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const pageTitles: { [key: string]: string } = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/bom': 'Bill of Materials',
  '/production': 'Production',
  '/invoices': 'Invoices',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/reports': 'Reports',
}

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const title = pageTitles[pathname] || 'I Am Pure'

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header style={{ height: '64px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'fixed', top: 0, left: '240px', right: 0, zIndex: 99 }}>
      <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '8px' }}>
          <Bell size={20} />
        </button>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: '600' }}>
          E
        </div>
        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', color: '#64748b', fontSize: '13px' }}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </header>
  )
}
