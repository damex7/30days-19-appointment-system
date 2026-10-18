import Link from 'next/link'
import { site } from '@/lib/site'
import { Mark } from './mark'

/** The receipt-book mark and the wordmark, linking to the dashboard. */
export function Logo() {
  return (
    <Link href="/dashboard" className="flex shrink-0 items-center gap-2 rounded-control py-1 pr-1 no-underline">
      <Mark className="size-8 sm:size-9" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.3rem] font-extrabold sm:text-[1.45rem] [font-stretch:82%]">{site.name}</span>
        <span className="mt-0.5 text-[0.7rem] font-semibold tracking-[0.12em] text-muted uppercase max-sm:hidden">{site.tagline}</span>
      </span>
    </Link>
  )
}
