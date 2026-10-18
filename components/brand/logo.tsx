import Link from 'next/link'
import { site } from '@/lib/site'
import { Mark } from './mark'

/** The braid mark and the wordmark, linking to the studio's home page. */
export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-control py-1 pr-1 no-underline">
      <Mark className="size-9 sm:size-10" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.65rem] font-semibold sm:text-[1.85rem]">{site.name}</span>
        <span className="mt-0.5 text-[0.68rem] font-medium tracking-[0.14em] text-muted uppercase max-sm:hidden">{site.tagline}</span>
      </span>
    </Link>
  )
}
