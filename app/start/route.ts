// /start: "take me to MY page". Each role has a different home (clients
// /appointments, stylists /stylist, admins /admin), but some places only
// know that someone is signed in, not who: the password-reset redirect, the
// "continue" links on the login and verify pages. They all point here, and
// this looks the role up and forwards, keeping any ?notice=.
import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSession, homePathFor } from '@/lib/auth/dal'

export async function GET(request: NextRequest) {
  const current = await getCurrentSession()
  const target = new URL(current ? homePathFor(current.user.role) : '/login', request.url)
  const notice = request.nextUrl.searchParams.get('notice')
  // Only a short slug is passed on; the page decides what (if anything) it means.
  if (notice && /^[a-z-]{1,40}$/.test(notice)) target.searchParams.set('notice', notice)
  return NextResponse.redirect(target, 303)
}
