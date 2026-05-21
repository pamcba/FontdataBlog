import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Se banco não configurado, redirecionar admin para /setup
  if (!process.env.DATABASE_URL) {
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/setup', request.url))
    }
    return NextResponse.next()
  }

  // Se já instalado, bloquear /setup
  if (pathname === '/setup' || pathname.startsWith('/setup/')) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  const token = request.cookies.get('auth_token')?.value
  const isApiRoute = pathname.startsWith('/api/admin')
  const isLoginPage = pathname === '/admin/login'

  if (isLoginPage) return NextResponse.next()

  const payload = token ? await verifyToken(token) : null

  if (!payload) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  const response = NextResponse.next()
  response.headers.set('x-user-id', String(payload.userId))
  response.headers.set('x-user-email', payload.email)
  return response
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/setup', '/setup/:path*'],
}
