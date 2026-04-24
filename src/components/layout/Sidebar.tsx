'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
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
  X
} from 'lucide-react'

const menuItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/products', icon: Package, label: 'Products' },
  { href: '/inventory', icon: BoxSelect, label: 'Inventory' },
  { href: '/bom', icon: FlaskConical, label: 'BOM' },
  { href: '/production', icon: Factory, label: 'Production' },
  { href: '/invoices', icon: FileText, label: 'Invoices' },
  { href: '/customers', icon: Users, label: 'Customers' },
  { href: '/suppliers', icon: Truck, label: 'Suppliers' },
  { href: '/reports', icon: BarChart3, label: 'Reports' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebarContent = (
    <>
      <div style={{ padding: '20px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <img src='/logo.png' alt='I AM PURE' style={{ height: '48px', objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }} />
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>Inventory Management System</div>
        </div>
        <button onClick={() => setMobileOpen(false)} style={{ display: 'none', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }} className="mobile-close">
          <X size={20} />
        </button>
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
      <div style={{ padding: '16px 20px', borderTop: '1px solid #334155', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
        &copy; 2026 I AM PURE
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

      {/* 데스크탑 사이드바 */}
      <aside className="desktop-sidebar" style={{ width: '240px', minHeight: '100vh', background: '#1e293b', color: '#fff', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, zIndex: 100 }}>
        {sidebarContent}
      </aside>

      {/* 모바일 상단 헤더 */}
      <div className="mobile-header" style={{ display: 'none', position: 'fixed', top: 0, left: 0, right: 0, height: '56px', background: '#1e293b', zIndex: 100, alignItems: 'center', padding: '0 16px', gap: '12px' }}>
        <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
          <Menu size={24} />
        </button>
        <img src='/logo.png' alt='I AM PURE' style={{ height: '32px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
      </div>

      {/* 모바일 오버레이 */}
      <div className="mobile-overlay" onClick={() => setMobileOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }} />

      {/* 모바일 슬라이드 사이드바 */}
      <aside className="mobile-sidebar" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '260px', background: '#1e293b', color: '#fff', display: 'flex', flexDirection: 'column', zIndex: 200, transition: 'transform 0.3s ease' }}>
        {sidebarContent}
      </aside>
    </>
  )
}
