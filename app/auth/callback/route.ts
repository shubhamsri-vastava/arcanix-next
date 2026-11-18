import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const requestedPath = request.nextUrl.searchParams.get('next') ?? '/'
  // Only allow in-app relative paths after authentication.
  const next = requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\') && !/[\u0000-\u001f]/.test(requestedPath) ? requestedPath : '/'
  const destination = new URL(next, request.url)
  const hasProviderError = request.nextUrl.searchParams.has('error')

  if (!code || hasProviderError) {
    destination.searchParams.set('auth', 'callback-error')
    return NextResponse.redirect(destination)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    destination.searchParams.set('auth', 'callback-error')
    return NextResponse.redirect(destination)
  }

  destination.searchParams.set('auth', next.startsWith('/auth/reset-password') ? 'recovery-ready' : 'confirmed')
  return NextResponse.redirect(destination)
}
