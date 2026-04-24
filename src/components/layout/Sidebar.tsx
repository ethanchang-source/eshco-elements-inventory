'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
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
  ChevronRight
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

  return (
    <aside style={{ width: '240px', minHeight: '100vh', background: '#1e293b', color: '#fff', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, zIndex: 100 }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #334155' }}>
        <img src='/logo.png' alt='I AM PURE' style={{ height: '48px', objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }} />
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
    </aside>
  )
}
