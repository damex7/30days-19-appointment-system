import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { ProfileForm } from '@/components/account/account-forms'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { SignOutButton } from '@/components/site/sign-out-button'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { verifySession } from '@/lib/auth/dal'
import { getSettings } from '@/lib/settings'
import { formatDateOnly } from '@/lib/time'

export const metadata: Metadata = { title: 'Your account' }

const ROLE_LABELS = { client: 'Client', stylist: 'Stylist', admin: 'Admin' } as const

export default function AccountPage({ searchParams }: PageProps<'/account'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account searchParams={searchParams} />
    </Suspense>
  )
}

/*
  No "delete account" (Day 17 had one): every booking keeps its client, so
  accounts are deactivated by an admin, never deleted.
*/
async function Account({ searchParams }: Pick<PageProps<'/account'>, 'searchParams'>) {
  const { user } = await verifySession()
  const [{ timeZone }, { denied }] = await Promise.all([getSettings(), searchParams])

  return (
    <div className="space-y-6">
      {denied === 'verify' && !user.emailVerifiedAt ? (
        <Notice tone="warning" title="Please confirm your email address first">
          <p>The admin pages open once your email address is confirmed. Use the link we sent you, or ask for a new one above.</p>
        </Notice>
      ) : null}
      <div>
        <h1 className="text-4xl">Your account</h1>
        <p className="mt-2 text-muted">
          {ROLE_LABELS[user.role]} · since {formatDateOnly(user.createdAt, timeZone)}
        </p>
      </div>

      <Section id="profile" title="Profile">
        <ProfileForm name={user.name} phone={user.phone} />
        <div className="mt-6 border-t border-line pt-5">
          <p className="font-semibold">Email address</p>
          <p className="mt-0.5 break-all">
            {user.email}{' '}
            <span className={user.emailVerifiedAt ? 'font-semibold text-success' : 'font-semibold text-warning'}>
              ({user.emailVerifiedAt ? 'confirmed' : 'not confirmed yet'})
            </span>
          </p>
          <p className="mt-1 text-sm text-muted">To change it, ask an admin.</p>
        </div>
      </Section>

      <Section id="security" title="Security">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/account/password" className={button.secondary}>
            <Icon name="lock" />
            Change password
          </Link>
          <Link href="/account/sessions" className={button.secondary}>
            <Icon name="laptop" />
            Signed-in devices
          </Link>
          <SignOutButton withLabel />
        </div>
      </Section>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="max-w-2xl rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
      <h2 id={`${id}-title`} className="mb-5 text-2xl">
        {title}
      </h2>
      {children}
    </section>
  )
}
