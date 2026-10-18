// PROXY: runs before every page request. It does two quick jobs and
// deliberately NOT a third.
//
// 1. OPTIMISTIC REDIRECT: a request for a protected page with NO session
//    cookie at all goes straight to /login?next=…, before any rendering.
//    "Optimistic" because a cookie being present proves nothing: it may be
//    expired, revoked or made up. The real check is verifySession() in
//    lib/auth/dal.ts, which every protected page and action calls.
//
// 2. COOKIE REFRESH: sliding renewal moves the session's expires_at in the
//    database, but pages can't write cookies while they render. So on each
//    page load the proxy re-sends the same cookie with a fresh 30-day
//    Max-Age. The database still decides when the session really ends.
//
// What it does NOT do: look the session up in the database, or redirect
// signed-in people away from /login. With a stale cookie, "/login → you're
// signed in, go to /appointments" and "/appointments → not signed in, go to
// /login" would bounce forever. The login page checks the session itself.
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie'

// The signed-in areas. The home page and /book stay public, so anyone can
// browse services and open times; the booking step itself asks for a
// session (and sends you to /login?next=… with your choices kept).
const PROTECTED_PREFIXES = ['/appointments', '/stylist', '/admin', '/account']

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (isProtected(pathname) && !token) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', pathname + search)
    return NextResponse.redirect(login)
  }

  // Tell the page which path was requested, so the DAL can build
  // /login?next=… if the cookie turns out to be invalid. Always overwritten
  // here, so a visitor can't supply their own (and `next` is checked by
  // safeNextPath anyway).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-ipade-path', pathname + search)
  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (token && request.method === 'GET') {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  }
  return response
}

export const config = {
  // Every page, but not Next.js's own files or static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico|txt)$).*)'],
}
