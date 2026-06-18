import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const nextRaw = searchParams.get('next') ?? '/reset-password'
  const next = nextRaw.startsWith('/') ? nextRaw : '/reset-password'

  const VALID_OTP_TYPES = ['recovery', 'signup', 'invite', 'email_change', 'magiclink'] as const
  type OtpType = typeof VALID_OTP_TYPES[number]

  if (token_hash && type && (VALID_OTP_TYPES as readonly string[]).includes(type)) {
    const response = NextResponse.redirect(new URL(next, request.url))
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        },
      }}
    )
    const { error } = await supabase.auth.verifyOtp({ type: type as OtpType, token_hash })
    if (!error) return response
  }
  return NextResponse.redirect(new URL('/login', request.url))
}
