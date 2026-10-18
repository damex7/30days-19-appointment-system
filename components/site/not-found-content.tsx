import Link from 'next/link'
import { Mark } from '@/components/brand/mark'
import { button } from '@/components/ui/button'

/** The body of every 404: unknown URLs, and a booking that doesn't exist or isn't yours (the two look the same on purpose). */
export function NotFoundContent() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Mark className="mb-5 size-16" />
      <p className="font-semibold tracking-wide text-muted uppercase">404</p>
      <h1 className="mt-1 text-4xl">We couldn’t find that</h1>
      <p className="mt-3 max-w-sm text-muted">There’s nothing at this address that you can see. The link may be mistyped, or it points to a booking on another account.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/start" className={button.primary}>
          Go to my page
        </Link>
        <Link href="/" className={button.secondary}>
          Studio home
        </Link>
      </div>
    </div>
  )
}
