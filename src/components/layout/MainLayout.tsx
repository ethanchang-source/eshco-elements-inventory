import Sidebar from './Sidebar'
import Header from './Header'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />
        <main style={{
          marginTop: '64px',
          padding: '24px',
          flex: 1,
          background: '#f8fafc',
          minHeight: 'calc(100vh - 64px)',
        }}>
          {children}
        </main>
      </div>
    </div>
  )
}