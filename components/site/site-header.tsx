import Link from 'next/link'
import { Suspense } from 'react'
import { Logo } from '@/components/brand/logo'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { getCurrentSession } from '@/lib/auth/dal'
import { rethrowNextErrors } from '@/lib/next-errors'
import { SignOutButton } from './sign-out-button'
import { ThemeToggle } from './theme-toggle'

/**
 * The header on every page. The logo and theme toggle are static; the
 * right-hand side depends on the session cookie, so it sits in <Suspense>
 * and streams in. The rest of the page never waits for it.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-page items-center gap-1.5 px-4 py-2 sm:gap-2 sm:px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Suspense fallback={<span className="skeleton block h-11 w-24 sm:w-56" />}>
            <AccountControls />
          </Suspense>
        </div>
      </div>
    </header>
  )
}

async function AccountControls() {
  let current = null
  try {
    current = await getCurrentSession()
  } catch (error) {
    // Let Next.js's own control-flow signals through, then treat a database
    // problem as "signed out" here: the header shouldn't take the whole
    // page down. Protected pages still fail loudly through their error
    // boundary, with the friendly "database unreachable" screen.
    rethrowNextErrors(error)
    console.error('[header] Could not read the session:', error)
  }

  if (!current) {
    return (
      <Link href="/login" className={`${button.secondary} px-3 whitespace-nowrap`}>
        Sign in
      </Link>
    )
  }

  return (
    <>
      {/* The most common job, one tap away from every page. */}
      <Link href="/movements/new" className={`${button.primary} px-3`}>
        <Icon name="plus" />
        <span>
          Record<span className="max-sm:sr-only"> stock</span>
        </span>
      </Link>
      <Link href="/account" className={`${button.ghost} max-w-44 px-2.5`} aria-label={`Your account (${current.user.name})`}>
        <Icon name="user" />
        <span className="truncate max-md:hidden">{current.user.name}</span>
      </Link>
      {/* On a phone, Sign out lives on the account page to keep the header on one line. */}
      <div className="max-sm:hidden">
        <SignOutButton />
      </div>
    </>
  )
}
