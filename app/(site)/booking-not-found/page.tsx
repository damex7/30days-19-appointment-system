// Where proxy.ts sends a request for a booking that doesn't exist OR isn't
// yours, with a real 404 status. Both cases look exactly the same, on
// purpose: nobody can learn whether booking 43 exists by guessing.
import type { Metadata } from 'next'
import { NotFoundContent } from '@/components/site/not-found-content'

export const metadata: Metadata = { title: 'Not found', robots: { index: false } }

export default function BookingNotFound() {
  return <NotFoundContent />
}
