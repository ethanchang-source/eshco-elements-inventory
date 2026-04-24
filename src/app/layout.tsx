import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'I Am Pure - Inventory Management',
  description: 'Hair Oil Inventory Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}