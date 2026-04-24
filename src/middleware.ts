import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const isLoginPage = req.nextUrl.pathname === '/login'
  
  const authCookie = req.cookies.getAll().find(c => 
    c.name.includes('auth-token') || 
    c.name.includes('sb-') 
  )

  if (!authCookie && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (authCookie && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
}
