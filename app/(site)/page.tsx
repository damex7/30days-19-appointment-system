// THE STUDIO'S HOME PAGE: services by category with prices, the stylists,
// opening hours, address and a WhatsApp link.
//
// Everything here is the same for every visitor, so every read is CACHED
// ('use cache' in lib/settings.ts and lib/studio/*), tagged 'settings' or
// 'menu'. The page is prerendered as static HTML and only rebuilt when an
// admin changes a service, stylist, hours or settings (updateTag). No
// database trip on a normal visit.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Mark } from '@/components/brand/mark'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatNaira } from '@/lib/money'
import { formatPhone, whatsappLink } from '@/lib/phone'
import { getSettings } from '@/lib/settings'
import { CATEGORIES, CATEGORY_BLURBS, CATEGORY_LABELS } from '@/lib/studio/categories'
import { listStudioHours } from '@/lib/studio/hours'
import { listMenu } from '@/lib/studio/services'
import { listPublicStylists } from '@/lib/studio/stylists'
import { formatClock, formatDuration, WEEKDAYS, zoneLabel } from '@/lib/time'

export const metadata: Metadata = { title: { absolute: 'Ìpàdé: hair & beauty appointments in Lekki' } }

// Monday first, the way a week is read on a salon's door.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default async function HomePage() {
  const [settings, menu, stylists, hours] = await Promise.all([getSettings(), listMenu(), listPublicStylists(), listStudioHours()])
  const serviceNames = new Map(menu.map((s) => [s.id, s.name]))
  const whatsapp = whatsappLink(settings.whatsappNumber, `Hello ${settings.studioName}, I’d like to ask about an appointment.`)

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* Hero */}
      <section aria-labelledby="hero-title" className="grid items-center gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-sm font-semibold tracking-[0.16em] text-brand uppercase">Lekki Phase 1 · Lagos</p>
          <h1 id="hero-title" className="mt-3 text-5xl sm:text-6xl">
            {settings.studioName}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Braids, barbing, nails, makeup and natural hair care. Choose a service and a stylist, pick an open time, and you’ll get a confirmation with a
            calendar file straight away.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/book" className={`${button.large} w-full sm:w-auto`}>
              <Icon name="calendar" />
              Book an appointment
            </Link>
            <a href={whatsapp} className={`${button.largeSecondary} w-full sm:w-auto`} rel="noopener noreferrer" target="_blank">
              <Icon name="chat" />
              Chat on WhatsApp
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
        <div className="relative mx-auto grid aspect-square w-full max-w-72 place-items-center rounded-full bg-tint" aria-hidden>
          <Mark className="size-3/4" />
        </div>
      </section>

      {/* Services */}
      <section aria-labelledby="services-title">
        <div className="plait mb-6 max-w-40" aria-hidden />
        <h2 id="services-title" className="text-4xl">
          Services and prices
        </h2>
        <p className="mt-2 text-muted">Prices include the time in the chair. Each booking also reserves a few minutes after for the stylist to clean up.</p>
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
          {CATEGORIES.map((category) => {
            const items = menu.filter((s) => s.category === category)
            if (items.length === 0) return null
            return (
              <section key={category} aria-labelledby={`cat-${category}`}>
                <h3 id={`cat-${category}`} className="text-3xl">
                  {CATEGORY_LABELS[category]}
                </h3>
                <p className="mt-1 text-sm text-muted">{CATEGORY_BLURBS[category]}</p>
                <ul className="mt-4 divide-y divide-line rounded-card border border-line bg-raised shadow-card">
                  {items.map((service) => (
                    <li key={service.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="font-semibold">{service.name}</p>
                        <p className="mt-0.5 text-sm text-muted">{service.description}</p>
                        <p className="figures mt-1 flex items-center gap-1.5 text-sm text-muted">
                          <Icon name="clock" className="size-4" />
                          {formatDuration(service.durationMinutes)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="figures text-lg font-semibold">{formatNaira(service.priceKobo)}</p>
                        <Link href={`/book?service=${service.slug}`} className={button.small} aria-label={`Book ${service.name}`}>
                          Book
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </section>

      {/* Stylists */}
      <section aria-labelledby="stylists-title">
        <div className="plait mb-6 max-w-40" aria-hidden />
        <h2 id="stylists-title" className="text-4xl">
          Our stylists
        </h2>
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stylists.map((stylist) => (
            <li key={stylist.id} className="flex flex-col rounded-card border border-line bg-raised p-5 shadow-card">
              <span className="grid size-14 place-items-center rounded-full bg-tint font-display text-3xl font-semibold text-brand" aria-hidden>
                {stylist.displayName.slice(0, 1)}
              </span>
              <h3 className="mt-3 text-2xl">{stylist.displayName}</h3>
              <p className="mt-1 text-sm text-muted">{stylist.bio}</p>
              <p className="mt-3 text-sm">
                <span className="font-semibold">Offers: </span>
                {stylist.serviceIds
                  .map((id) => serviceNames.get(id))
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <div className="mt-auto pt-4">
                <Link href={`/book?stylist=${stylist.id}`} className={`${button.secondary} w-full`}>
                  Book with {stylist.displayName}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Hours and location */}
      <section aria-labelledby="visit-title" className="grid gap-6 md:grid-cols-2">
        <div className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
          <h2 id="visit-title" className="text-3xl">
            Opening hours
          </h2>
          <p className="mt-1 text-sm text-muted">Lagos time, {zoneLabel(settings.timeZone)}. Individual stylists’ days vary.</p>
          <table className="figures mt-4 w-full text-left">
            <caption className="sr-only">Opening hours by day</caption>
            <tbody className="divide-y divide-line">
              {WEEK_ORDER.map((day) => {
                const open = hours.find((h) => h.dayOfWeek === day)
                return (
                  <tr key={day}>
                    <th scope="row" className="py-2 font-medium">
                      {WEEKDAYS[day]}
                    </th>
                    <td className="py-2 text-right">
                      {open ? (
                        `${formatClock(open.opens)} – ${formatClock(open.closes)}`
                      ) : (
                        <span className="text-muted">Closed</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
          <h2 className="text-3xl">Find us</h2>
          <p className="mt-4 flex items-start gap-2">
            <Icon name="mapPin" className="mt-1 shrink-0 text-brand" />
            <span>{settings.address}</span>
          </p>
          <p className="mt-3 flex items-start gap-2">
            <Icon name="chat" className="mt-1 shrink-0 text-brand" />
            <span>
              WhatsApp <span className="figures">{formatPhone(settings.whatsappNumber)}</span>
            </span>
          </p>
          <a href={whatsapp} className={`${button.primary} mt-6 w-full sm:w-auto`} rel="noopener noreferrer" target="_blank">
            <Icon name="chat" />
            Chat on WhatsApp
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </section>
    </div>
  )
}
