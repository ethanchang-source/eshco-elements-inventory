import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const isLoginPage = req.nextUrl.pathname === '/login'
  const isPublic = req.nextUrl.pathname.startsWith('/_next') || 
                   req.nextUrl.pathname.startsWith('/favicon') ||
                   req.nextUrl.pathname.startsWith('/logo')

  if (isPublic) return NextResponse.next()
  if (isLoginPage) return NextResponse.next()

  const cookies = req.cookies.getAll()
  const hasSession = cookies.some(c => c.name.startsWith('sb-'))

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
}
