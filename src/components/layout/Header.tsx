'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Bell } from 'lucide-react'

const pageTitles: { [key: string]: string } = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/bom': 'BOM',
  '/production': 'Production',
  '/invoices': 'Invoices',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/purchasing': 'Purchasing',
  '/expenses': 'Expenses',
  '/reports': 'Reports',
  '/scan': 'Scan Stock',
  '/activity': 'Activity Log',
}

export default function Header() {
  const pathname = usePathname()
  const base = '/' + pathname.split('/')[1]
  const title = pageTitles[base] || 'ESHCO ELEMENTS'

  useEffect(() => {
    document.title = title === 'ESHCO ELEMENTS' ? 'ESHCO ELEMENTS' : `${title} | ESHCO ELEMENTS`
  }, [title])

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
      </div>
    </header>
  )
}
