// CLIENT COMPONENT: it highlights the current page with usePathname.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { Role } from '@/lib/validation'

type NavLink = { href: string; label: string; icon: IconName }

/**
 * Each role gets its own set of tabs. Hiding a tab is only tidiness: every
 * page and action behind these links checks the role on the server
 * (requireRole) and the record's owner in SQL, so typing a URL gets
 * nobody anywhere they shouldn't be.
 */
const LINKS: Record<Role, NavLink[]> = {
  client: [
    { href: '/book', label: 'Book', icon: 'plus' },
    { href: '/appointments', label: 'My appointments', icon: 'calendar' },
    { href: '/account', label: 'Account', icon: 'user' },
  ],
  stylist: [
    { href: '/stylist', label: 'Today', icon: 'clock' },
    { href: '/stylist/week', label: 'My week', icon: 'calendar' },
    { href: '/stylist/time-off', label: 'Time off', icon: 'door' },
    { href: '/account', label: 'Account', icon: 'user' },
  ],
  admin: [
    { href: '/admin', label: 'Day view', icon: 'dashboard' },
    { href: '/admin/bookings', label: 'Bookings', icon: 'list' },
    { href: '/admin/services', label: 'Services', icon: 'tag' },
    { href: '/admin/stylists', label: 'Stylists', icon: 'users' },
    { href: '/admin/hours', label: 'Hours', icon: 'clock' },
    { href: '/admin/closures', label: 'Closures', icon: 'door' },
    { href: '/admin/settings', label: 'Settings', icon: 'shield' },
    { href: '/admin/users', label: 'People', icon: 'user' },
  ],
}

/** The section roots match only themselves, so "Day view" isn't lit up on every /admin/… page. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin' || href === '/stylist') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The strip of tabs under the header. On a phone it scrolls sideways
 * (one row, no hidden menu to open).
 */
export function AppNav({ role }: { role: Role }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="border-b border-line bg-paper">
      <ul className="mx-auto flex max-w-page gap-0.5 overflow-x-auto px-2 [scrollbar-width:thin] sm:px-4">
        {LINKS[role].map((link) => {
          const active = isActive(pathname, link.href)
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // A plum underline marks "you are here"; aria-current says it to screen readers.
                  'relative flex min-h-12 items-center gap-2 rounded-control px-3 text-[0.95rem] font-semibold no-underline transition-colors',
                  active
                    ? 'text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-pill after:bg-brand'
                    : 'text-muted hover:bg-tint hover:text-ink',
                )}
              >
                <Icon name={link.icon} className={cn('size-[1.1rem]', active && 'text-brand')} />
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
