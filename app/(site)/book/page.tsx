// /book: service → stylist (or "any") → day → time → confirm.
//
// Every step's choice is in the URL (lib/booking/flow.ts), so this page is
// worked out entirely from searchParams: the back button, a refresh and the
// login detour all land on the same step.
//
// The page CHECKS each value before using it. A service that doesn't
// exist, a stylist who doesn't offer it, a day outside the booking window,
// a time that isn't open: each falls back to the step where it can be fixed,
// with a note saying why. Nothing here trusts the URL, and the booking
// action checks everything again anyway.
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'
import { ResendVerificationForm } from '@/components/auth/verify-forms'
import { ConfirmForm } from '@/components/booking/confirm-form'
import { SlotPicker } from '@/components/booking/slot-picker'
import { dayItems, EmptyDay, groupTimes, TimeGroups } from '@/components/booking/when-picker'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { getCurrentSession } from '@/lib/auth/dal'
import { openDays, openTimes } from '@/lib/booking/availability'
import { bookHref, currentStep, parseChoice, type BookingChoice } from '@/lib/booking/flow'
import { cn } from '@/lib/cn'
import { formatNaira } from '@/lib/money'
import { getSettings } from '@/lib/settings'
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/studio/categories'
import { closedDatesBetween } from '@/lib/studio/closures'
import { listMenu } from '@/lib/studio/services'
import { listPublicStylists } from '@/lib/studio/stylists'
import { addDays, formatClock, formatDayLong, formatDuration, formatTime, localTimeOf, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'Book an appointment' }

export default function BookPage({ searchParams }: PageProps<'/book'>) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-5xl">Book an appointment</h1>
      {/* The steps depend on the URL and on live availability, so they stream in. */}
      <Suspense fallback={<BookingSkeleton />}>
        <BookingFlow searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

const STEP_NAMES = ['Service', 'Stylist', 'Day', 'Time', 'Confirm'] as const

async function BookingFlow({ searchParams }: Pick<PageProps<'/book'>, 'searchParams'>) {
  // Availability depends on "now" (minimum notice, today's date), so this
  // part is rendered per request, never prerendered.
  await connection()
  const requested = parseChoice(await searchParams)
  const [settings, menu, stylists] = await Promise.all([getSettings(), listMenu(), listPublicStylists()])
  const tz = settings.timeZone
  const today = todayIn(tz)
  const lastDay = addDays(today, settings.bookingWindowDays)
  const notes: string[] = []

  // --- Check each step in order; a bad value clears it and everything after.
  const choice: BookingChoice = { ...requested }
  const service = menu.find((s) => s.slug === choice.service) ?? null
  if (choice.service && !service) {
    notes.push('That service isn’t on the menu any more. Please choose another.')
    Object.assign(choice, { service: null, date: null, time: null })
  }
  const stylist = typeof choice.stylist === 'number' ? (stylists.find((s) => s.id === choice.stylist) ?? null) : null
  if (typeof choice.stylist === 'number' && (!stylist || (service && !stylist.serviceIds.includes(service.id)))) {
    if (service && stylist) notes.push(`${stylist.displayName} doesn’t offer ${service.name}. Choose another stylist, or anyone available.`)
    else if (!stylist) notes.push('That stylist isn’t taking bookings. Please choose another.')
    // Keep a stylist chosen from the home page while the service is still to be picked.
    if (service || !stylist) Object.assign(choice, { stylist: null, date: null, time: null })
  }
  if (choice.date && (choice.date < today || choice.date > lastDay)) {
    notes.push(`Bookings can be made from today up to ${formatDayLong(lastDay)}.`)
    Object.assign(choice, { date: null, time: null })
  }

  const stylistId = typeof choice.stylist === 'number' ? choice.stylist : null
  const step = currentStep(choice)

  // Live availability for the day strip and the chosen day.
  let days: Map<string, number> = new Map()
  let closed: Map<string, string> = new Map()
  let times: Awaited<ReturnType<typeof openTimes>> = []
  if (service && choice.stylist !== null) {
    ;[days, closed] = await Promise.all([openDays(service.id, stylistId, today, lastDay), closedDatesBetween(today, lastDay)])
    if (choice.date) times = await openTimes(service.id, stylistId, choice.date)
  }
  if (choice.time && !times.some((t) => localTimeOf(t.startsAt, tz) === choice.time)) {
    notes.push(`${formatClock(choice.time)} isn’t open any more on ${choice.date ? formatDayLong(choice.date) : 'that day'}. Please pick another time.`)
    choice.time = null
  }

  const stylistName = choice.stylist === 'any' ? 'Any available stylist' : (stylist?.displayName ?? null)

  return (
    <div className="mt-6 space-y-8">
      <Progress step={currentStep(choice)} />

      {notes.map((note) => (
        <Notice key={note} tone="warning" title={note} live />
      ))}

      {/* What has been chosen so far, each with a way back. */}
      {step > 1 ? (
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
          {service ? (
            <Chosen label="Service" change={bookHref({ service: null, stylist: choice.stylist, date: null, time: null })}>
              {service.name} · <span className="figures">{formatDuration(service.durationMinutes)} · {formatNaira(service.priceKobo)}</span>
            </Chosen>
          ) : null}
          {stylistName && service ? (
            <Chosen label="Stylist" change={bookHref({ ...choice, stylist: null })}>
              {stylistName}
            </Chosen>
          ) : null}
        </dl>
      ) : null}

      {/* STEP 1: service */}
      {!service ? (
        <StepSection title={stylist ? `What would you like ${stylist.displayName} to do?` : 'What would you like done?'}>
          <div className="space-y-8">
            {CATEGORIES.map((category) => {
              const items = menu.filter((s) => s.category === category && (!stylist || stylist.serviceIds.includes(s.id)))
              if (items.length === 0) return null
              return (
                <section key={category} aria-labelledby={`cat-${category}`}>
                  <h3 id={`cat-${category}`} className="text-2xl">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {items.map((s) => (
                      <li key={s.id}>
                        <OptionLink href={bookHref({ service: s.slug, stylist: stylist ? stylist.id : null, date: null, time: null })}>
                          <span className="font-semibold">{s.name}</span>
                          <span className="figures mt-1 block text-sm text-muted">
                            {formatDuration(s.durationMinutes)} · {formatNaira(s.priceKobo)}
                          </span>
                        </OptionLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </StepSection>
      ) : null}

      {/* STEP 2: stylist */}
      {service && choice.stylist === null ? (
        <StepSection title="Who would you like?">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <li>
              <OptionLink href={bookHref({ ...choice, stylist: 'any' })}>
                <span className="font-semibold">Any available stylist</span>
                <span className="mt-1 block text-sm text-muted">See every open time. We’ll match you with whoever is free, sharing work fairly across the team.</span>
              </OptionLink>
            </li>
            {stylists
              .filter((s) => s.serviceIds.includes(service.id))
              .map((s) => (
                <li key={s.id}>
                  <OptionLink href={bookHref({ ...choice, stylist: s.id })}>
                    <span className="font-semibold">{s.displayName}</span>
                    <span className="mt-1 block text-sm text-muted">{s.bio}</span>
                  </OptionLink>
                </li>
              ))}
          </ul>
        </StepSection>
      ) : null}

      {/* STEPS 3 and 4: day, then time (on the same screen) */}
      {service && choice.stylist !== null && step <= 4 ? (
        <StepSection title="When?">
          <p className="mb-4 text-sm text-muted">
            All times are studio time in Lagos, {settings.zoneLabel}, whatever your phone is set to.
          </p>
          <h3 className="mb-2 font-sans text-base font-semibold">Choose a day</h3>
          <SlotPicker layout="strip" label="Days" items={dayItems(today, lastDay, days, closed, choice.date, (date) => bookHref({ ...choice, date, time: null }))} />

          {choice.date ? (
            <div className="mt-6">
              <h3 className="mb-2 font-sans text-base font-semibold">Open times on {formatDayLong(choice.date)}</h3>
              {times.length > 0 ? (
                <TimeGroups
                  groups={groupTimes(
                    times.map((t) => t.startsAt),
                    tz,
                  )}
                  makeItem={(instant) => {
                    const time = localTimeOf(instant, tz)
                    return {
                      key: time,
                      href: bookHref({ ...choice, time }),
                      label: `${formatDayLong(choice.date!)}, ${formatTime(instant, tz)}, available`,
                      lines: [formatTime(instant, tz)],
                      state: 'open',
                    }
                  }}
                />
              ) : (
                <EmptyDay date={choice.date} days={days} closed={closed.get(choice.date)} href={(date) => bookHref({ ...choice, date, time: null })} />
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Pick a day to see its open times. Days marked “Unavailable” are fully booked or closed.</p>
          )}
        </StepSection>
      ) : null}

      {/* STEP 5: confirm */}
      {service && stylistName && choice.date && choice.time ? (
        <section className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
          <SummaryCard
            rows={[
              ['Service', `${service.name} (${formatDuration(service.durationMinutes)})`],
              ['Stylist', choice.stylist === 'any' ? 'Any available stylist (we’ll assign one when you book)' : stylistName],
              ['When', `${formatDayLong(choice.date)}, ${formatClock(choice.time)} (${settings.zoneLabel})`],
              ['Price', `${formatNaira(service.priceKobo)}, paid at the studio`],
            ]}
            change={bookHref({ ...choice, time: null })}
          />
          <div className="mt-6">
            <Suspense fallback={<div className="skeleton h-40 w-full" />}>
              <ConfirmStep choice={choice} cutoffHours={settings.cancellationCutoffHours} />
            </Suspense>
          </div>
        </section>
      ) : null}
    </div>
  )
}

/**
 * Who is about to book. Signed out → sign in or create an account, with
 * ?next= bringing them back to THIS step. Unconfirmed email → confirm
 * first (the choices stay in the URL meanwhile). Staff → their own tools.
 */
async function ConfirmStep({ choice, cutoffHours }: { choice: BookingChoice; cutoffHours: number }) {
  const current = await getCurrentSession()
  const next = encodeURIComponent(bookHref(choice))
  if (!current) {
    return (
      <div className="space-y-4">
        <h2 className="text-3xl">Sign in to confirm</h2>
        <p>Your choices are saved in this page’s address, so you’ll come straight back here.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={`/login?next=${next}`} className={`${button.large} w-full sm:w-auto`}>
            Sign in
          </Link>
          <Link href={`/signup?next=${next}`} className={`${button.largeSecondary} w-full sm:w-auto`}>
            Create an account
          </Link>
        </div>
      </div>
    )
  }
  if (current.user.role !== 'client') {
    return (
      <Notice tone="info" title="You’re signed in as staff">
        <p>
          {current.user.role === 'admin' ? (
            <>
              To book for a client, use <Link href="/admin/bookings/new">New booking</Link> in the admin area.
            </>
          ) : (
            'Stylist accounts can’t book appointments. Ask the admin to book for a client.'
          )}
        </p>
      </Notice>
    )
  }
  if (!current.user.emailVerifiedAt) {
    return (
      <div className="space-y-4">
        <Notice tone="warning" title="Please confirm your email address first">
          <p>
            We sent a link to <strong className="break-all">{current.user.email}</strong>. Open it, then come back to this page and{' '}
            <Link href={bookHref(choice)}>refresh</Link>: your choices are kept.
          </p>
        </Notice>
        <ResendVerificationForm compact />
      </div>
    )
  }
  return (
    <>
      <ConfirmForm
        hidden={{
          service: choice.service ?? '',
          stylist: String(choice.stylist ?? ''),
          date: choice.date ?? '',
          time: choice.time ?? '',
        }}
      />
      <p className="mt-4 text-sm text-muted">You can reschedule or cancel online up to {cutoffHours} hours before your appointment.</p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Progress({ step }: { step: number }) {
  return (
    <nav aria-label="Booking steps">
      <ol className="flex gap-1.5">
        {STEP_NAMES.map((name, index) => {
          const n = index + 1
          return (
            <li
              key={name}
              aria-current={n === step ? 'step' : undefined}
              className={cn('flex-1 border-t-4 pt-1.5 text-xs font-semibold sm:text-sm', n < step ? 'border-brand text-ink' : n === step ? 'border-brand text-brand' : 'border-line text-muted')}
            >
              <span className="sr-only">{n < step ? 'Done: ' : n === step ? 'Current step: ' : 'Next: '}</span>
              <span className="figures">{n}.</span> <span className="max-[420px]:sr-only">{name}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function StepSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title" className="mb-4 text-3xl">
        {title}
      </h2>
      {children}
    </section>
  )
}

function OptionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="flex h-full min-h-16 items-center justify-between gap-3 rounded-card border border-line-strong bg-raised p-4 text-ink no-underline shadow-card transition-colors hover:border-brand hover:bg-tint"
    >
      <span className="min-w-0">{children}</span>
      <Icon name="chevronRight" className="shrink-0 text-brand" />
    </Link>
  )
}

function Chosen({ label, change, children }: { label: string; change: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-raised p-4">
      <div className="min-w-0">
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="mt-0.5 font-medium">{children}</dd>
      </div>
      <Link href={change} scroll={false} className="shrink-0 text-sm font-semibold text-brand">
        Change<span className="sr-only"> {label.toLowerCase()}</span>
      </Link>
    </div>
  )
}

function SummaryCard({ rows, change }: { rows: [string, string][]; change: string }) {
  return (
    <div>
      <dl className="figures grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <Link href={change} scroll={false} className="mt-3 inline-block text-sm font-semibold text-brand">
        Choose a different time
      </Link>
    </div>
  )
}

function BookingSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-hidden>
      <div className="flex gap-1.5">
        {STEP_NAMES.map((name) => (
          <div key={name} className="skeleton h-6 flex-1" />
        ))}
      </div>
      <div className="skeleton h-9 w-64" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
    </div>
  )
}

