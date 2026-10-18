// SIGNED-IN PAGES: header, the nav strip, the "confirm your email" banner.
//
// The layout never awaits the session at its top level: that would hold
// every page behind the database. The nav and the banner read it inside
// their own <Suspense> boundaries, and each page checks it again itself
// with verifySession() or requireRole(). (Layouts don't re-render on every
// navigation, so a check here alone would not protect the pages.)

import { Suspense } from 'react'
import { ResendVerificationForm } from '@/components/auth/verify-forms'
import { AppNav } from '@/components/site/app-nav'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { Notice } from '@/components/ui/notice'
import { getCurrentSession } from '@/lib/auth/dal'
import { rethrowNextErrors } from '@/lib/next-errors'

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <Suspense fallback={<div className="h-12 border-b border-line" />}>
        <MainNav />
      </Suspense>
      <main id="main" className="mx-auto w-full max-w-page flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={null}>
          <VerifyBanner />
        </Suspense>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

/** The session, or null if it can't be read (the page's own check will report a database problem). */
async function sessionOrNull() {
  try {
    return await getCurrentSession()
  } catch (error) {
    rethrowNextErrors(error)
    return null
  }
}

async function MainNav() {
  const current = await sessionOrNull()
  // No nav while the temporary password is being replaced: every other page
  // would only redirect back to /account/password.
  if (!current || current.user.mustChangePassword) return <div className="h-12 border-b border-line" />
  return <AppNav role={current.user.role} />
}

/** Accounts can sign in before confirming their address, but see this until they do. */
async function VerifyBanner() {
  const current = await sessionOrNull()
  if (!current || current.user.emailVerifiedAt || current.user.mustChangePassword) return null
  return (
    <Notice tone="info" title="Please confirm your email address" className="mb-6">
      <p>
        We sent a link to <strong className="break-all">{current.user.email}</strong>. You need it to confirm your first booking and to reset a forgotten password
        {current.user.role === 'admin' ? ', and the admin pages stay locked until you open it' : ''}.
      </p>
      <div className="mt-3">
        <ResendVerificationForm compact />
      </div>
    </Notice>
  )
}
