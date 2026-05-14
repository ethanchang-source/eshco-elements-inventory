'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Package,
  FlaskConical,
  BoxSelect,
  Factory,
  FileText,
  Users,
  Truck,
  BarChart3,
  ChevronRight,
  Menu,
  ScanLine,
  LogOut,
  ShoppingCart,
  Receipt,
  History,
  Archive,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const menuItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/products', icon: Package, label: 'Products' },
  { href: '/inventory', icon: BoxSelect, label: 'Inventory' },
  { href: '/inventory-history', icon: Archive, label: 'Inventory History' },
  { href: '/bom', icon: FlaskConical, label: 'BOM' },
  { href: '/production', icon: Factory, label: 'Production' },
  { href: '/invoices', icon: FileText, label: 'Invoices' },
  { href: '/customers', icon: Users, label: 'Customers' },
  { href: '/suppliers', icon: Truck, label: 'Suppliers' },
  { href: '/purchasing', icon: ShoppingCart, label: 'Purchasing' },
  { href: '/expenses', icon: Receipt, label: 'Expenses' },
  { href: '/reports', icon: BarChart3, label: 'Reports' },
  { href: '/scan', icon: ScanLine, label: 'Scan Stock' },
  { href: '/activity', icon: History, label: 'Activity Log' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || '')
    })
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const sidebarContent = (
    <>
      <div style={{ padding: '20px', borderBottom: '1px solid #334155', textAlign: 'center' }}>
        <img src='/logo.png' alt='I AM PURE' style={{ height: '48px', objectFit: 'contain', display: 'block', margin: '0 auto', filter: 'brightness(0) invert(1)' }} />
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>Inventory Management System</div>
      </div>
      <nav style={{ padding: '12px 0', flex: 1 }}>
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', color: isActive ? '#fff' : '#94a3b8', background: isActive ? '#2563eb' : 'transparent', textDecoration: 'none', fontSize: '14px', fontWeight: isActive ? '500' : '400', transition: 'all 0.15s' }}
            >
              <Icon size={18} />
              {item.label}
              {isActive && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
            </Link>
          )
        })}
      </nav>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #334155' }}>
        {userEmail && (
          <div style={{ fontSize: '11px', color: '#64748b', padding: '6px 12px', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userEmail}
          </div>
        )}
        <button
          onClick={handleSignOut}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#dc2626' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#334155' }}
        >
          <LogOut size={16} /> Sign Out
        </button>
        <div style={{ fontSize: '11px', color: '#475569', textAlign: 'center', marginTop: '10px' }}>&copy; 2026 I AM PURE</div>
      </div>
    </>
  )

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-header { display: flex !important; }
          .mobile-overlay { display: ${mobileOpen ? 'block' : 'none'} !important; }
          .mobile-sidebar { transform: ${mobileOpen ? 'translateX(0)' : 'translateX(-100%)'} !important; }
        }
        @media (min-width: 769px) {
          .mobile-header { display: none !important; }
          .mobile-overlay { display: none !important; }
          .mobile-sidebar { display: none !important; }
        }
      `}</style>

      {/* Desktop sidebar */}
      <aside className="desktop-sidebar" style={{ width: '240px', minHeight: '100vh', background: '#1e293b', color: '#fff', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, zIndex: 100 }}>
        {sidebarContent}
      </aside>

      {/* Mobile top header */}
      <div className="mobile-header" style={{ display: 'none', position: 'fixed', top: 0, left: 0, right: 0, height: '56px', background: '#1e293b', zIndex: 100, alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
        <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', position: 'absolute', left: '16px' }}>
          <Menu size={24} />
        </button>
        <img src='/logo.png' alt='I AM PURE' style={{ height: '32px', objectFit: 'contain', filter: 'brightness(0) invert(1)', display: 'block', margin: '0 auto' }} />
      </div>

      {/* Mobile overlay */}
      <div className="mobile-overlay" onClick={() => setMobileOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }} />

      {/* Mobile slide sidebar */}
      <aside className="mobile-sidebar" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '260px', background: '#1e293b', color: '#fff', display: 'flex', flexDirection: 'column', zIndex: 200, transition: 'transform 0.3s ease' }}>
        {sidebarContent}
      </aside>
    </>
  )
}
