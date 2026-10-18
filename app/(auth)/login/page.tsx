import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'
import { AuthCard, FormSkeleton } from '@/components/site/auth-card'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { getCurrentSession } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <AuthCard
      title="Sign in"
      footer={
        <p>
          <Link href="/forgot-password">Forgot your password?</Link>
        </p>
      }
    >
      {/* The URL and the cookie are only known per request, so this part streams in. */}
      <Suspense fallback={<FormSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

async function LoginContent({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const params = await searchParams
  const next = first(params.next) ?? null
  const reason = first(params.reason)
  const notice = first(params.notice)

  // Already signed in? Offer to carry on, rather than redirecting: the proxy
  // can't tell a valid cookie from a stale one, so the decision is made
  // here, where the database has actually been asked.
  const current = await getCurrentSession()

  return (
    <>
      {notice === 'verified' ? (
        <Notice tone="success" title="Email address confirmed" className="mb-6">
          <p>Thank you. Sign in to carry on.</p>
        </Notice>
      ) : null}
      {notice === 'signed-out' && !current ? (
        <Notice tone="success" title="You’re signed out" className="mb-6">
          <p>Your session was deleted on the server and the cookie removed from this browser.</p>
        </Notice>
      ) : null}
      {reason === 'ended' && !current ? (
        <Notice tone="info" title="Your session has ended" className="mb-6">
          <p>It expired or was signed out from another device. Please sign in again.</p>
        </Notice>
      ) : null}
      {current ? (
        <div className="mb-6 rounded-control border border-line bg-paper p-4">
          <p>
            You’re already signed in as <strong>{current.user.name}</strong>.
          </p>
          <Link href="/start" className={`${button.primary} mt-3`}>
            Continue to your page
          </Link>
          <p className="mt-3 text-sm text-muted">Or sign in below as someone else.</p>
        </div>
      ) : null}
      <LoginForm next={next} />
      {/* The sign-up link carries ?next= too, so a client who was halfway
          through booking comes back to the same step either way. */}
      <p className="mt-6 border-t border-line pt-5 text-center">
        New here?{' '}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'} className="font-semibold">
          Create an account
        </Link>
      </p>
    </>
  )
}
