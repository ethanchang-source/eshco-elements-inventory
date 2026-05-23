import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ESHCO ELEMENTS',
  description: 'Hair Oil Inventory Management System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ESHCO ELEMENTS',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}