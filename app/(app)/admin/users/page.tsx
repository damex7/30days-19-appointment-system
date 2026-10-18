import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { changeRoleAction, setActiveAction } from '@/app/(app)/admin/users/actions'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/table-parts'
import { requireRole } from '@/lib/auth/dal'
import { cn } from '@/lib/cn'
import { getSettings } from '@/lib/settings'
import { formatDateOnly, fromNow } from '@/lib/time'
import { hrefWith } from '@/lib/url'
import { ADMIN_PAGE_SIZE, listUsers } from '@/lib/users'
import { adminSearchSchema } from '@/lib/validation'

export const metadata: Metadata = { title: 'Users' }

export default function UsersPage({ searchParams }: PageProps<'/admin/users'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Users searchParams={searchParams} />
    </Suspense>
  )
}

async function Users({ searchParams }: Pick<PageProps<'/admin/users'>, 'searchParams'>) {
  // requireRole redirects clients and stylists (and an admin with an unconfirmed email)
  // before any user data is read.
  const { user: admin } = await requireRole('admin')
  const { timeZone } = await getSettings()
  const { q, page } = adminSearchSchema.parse(await searchParams)
  const { users, total } = await listUsers({ q, page })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Clients sign themselves up; stylist accounts are made on the Stylists page. Every change is recorded with your name. You can’t change your own role or deactivate yourself."
      />

      <section aria-labelledby="people-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="people-title" className="text-2xl">
            People
          </h2>
          {/* A GET form: the search lives in the URL. */}
          <form action="/admin/users" role="search" className="flex items-end gap-2">
            <div>
              <label htmlFor="q" className="mb-1 block text-sm font-semibold">
                Search name or email
              </label>
              <input id="q" name="q" type="search" defaultValue={q} maxLength={100} className="field block min-h-11 w-56 max-w-full px-3" />
            </div>
            <button type="submit" className={button.secondary}>
              <Icon name="search" />
              <span className="sr-only sm:not-sr-only">Search</span>
            </button>
          </form>
        </div>
        <p aria-live="polite" className="text-sm text-muted">
          {total === 0 ? 'No users found' : `${total} ${total === 1 ? 'person' : 'people'}${q ? ` matching “${q}”` : ''}`}
        </p>

        {users.length === 0 ? (
          <EmptyState title="No one matches that search">
            <Link href="/admin/users">Show everyone</Link>
          </EmptyState>
        ) : (
          <ul aria-label="Users" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {users.map((user) => {
              const isSelf = user.id === admin.id
              const deactivated = Boolean(user.deactivatedAt)
              return (
                <li key={user.id} className={cn('rounded-card border bg-raised p-4 shadow-card', deactivated ? 'border-dashed border-line-strong' : 'border-line')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-sans text-lg font-bold">{user.name}</h3>
                    {isSelf ? <span className="text-sm text-muted">(you)</span> : null}
                    <span className={cn('rounded-pill px-2 py-0.5 text-xs font-bold uppercase', user.role === 'admin' ? 'bg-tint text-ink' : 'bg-sunken text-muted')}>{user.role}</span>
                    {deactivated ? (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-danger px-2 py-0.5 text-xs font-bold text-on-danger uppercase">
                        <Icon name="close" className="size-3" /> Deactivated
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm break-all">{user.email}</p>
                  <p className="mt-1 text-sm text-muted">
                    <span className={user.emailVerifiedAt ? 'text-success' : 'text-warning'}>{user.emailVerifiedAt ? '✓ Email confirmed' : '! Email not confirmed'}</span>
                    {user.mustChangePassword ? ' · still on the temporary password' : ''} · last sign-in {user.lastLoginAt ? fromNow(user.lastLoginAt) : 'never'} · since {formatDateOnly(user.createdAt, timeZone)}
                  </p>
                  {isSelf ? null : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!deactivated && user.role !== 'stylist' ? (
                        <ConfirmAction
                          action={changeRoleAction}
                          fields={{ userId: user.id, role: user.role === 'admin' ? 'client' : 'admin' }}
                          trigger={user.role === 'admin' ? 'Make client' : 'Make admin'}
                          icon="shield"
                          title={user.role === 'admin' ? `Make ${user.name} a client?` : `Make ${user.name} an admin?`}
                          body={
                            user.role === 'admin'
                              ? 'They will only see their own bookings, like any client.'
                              : 'They will see every booking and can change services, stylists, hours and settings. Admin pages also need a confirmed email address.'
                          }
                          confirmLabel={user.role === 'admin' ? 'Make client' : 'Make admin'}
                        />
                      ) : null}
                      <ConfirmAction
                        action={setActiveAction}
                        fields={{ userId: user.id, active: deactivated ? 'true' : 'false' }}
                        trigger={deactivated ? 'Reactivate' : 'Deactivate'}
                        icon={deactivated ? 'restore' : 'lock'}
                        danger={!deactivated}
                        title={deactivated ? `Reactivate ${user.name}?` : `Deactivate ${user.name}?`}
                        body={
                          deactivated
                            ? 'They will be able to sign in again with their existing password.'
                            : 'They are signed out on every device straight away and can’t sign in again. Their bookings stay in the studio’s history with their name.'
                        }
                        confirmLabel={deactivated ? 'Reactivate' : 'Deactivate'}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <Pagination page={page} total={total} pageSize={ADMIN_PAGE_SIZE} hrefFor={(p) => hrefWith('/admin/users', { q, page: p }, {}, { page: 1 })} label="User pages" />
      </section>
    </div>
  )
}
