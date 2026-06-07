import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/analyze',
  '/docs',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/') return NextResponse.next()

  if (pathname === '/dashboard') {
    const sessionCookie = request.cookies.get('cicd.sid')
    const destination = sessionCookie?.value ? '/repos' : '/login'
    return NextResponse.redirect(new URL(destination, request.url))
  }

  const isPublic = PUBLIC_PATHS.some(p =>
    pathname === p || pathname.startsWith(p + '/')
  )
  if (isPublic) return NextResponse.next()

  if (pathname.startsWith('/_next')) return NextResponse.next()
  if (pathname.startsWith('/favicon')) return NextResponse.next()
  if (pathname.startsWith('/api')) return NextResponse.next()

  const sessionCookie = request.cookies.get('cicd.sid')
  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
