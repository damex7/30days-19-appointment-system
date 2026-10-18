import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { ProfileForm } from '@/components/account/account-forms'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { SignOutButton } from '@/components/site/sign-out-button'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { verifySession } from '@/lib/auth/dal'
import { shortDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Your account' }

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  )
}

/*
  Day 18 leaves out Day 17's "delete account": every stock movement records
  who made it, so accounts are deactivated by an admin, never deleted.
*/
async function Account() {
  const { user } = await verifySession()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl">Your account</h1>
        <p className="mt-2 text-muted">
          {user.role === 'admin' ? 'Admin' : 'Staff'} · since {shortDate(user.createdAt)}
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
