import { PageSkeleton } from '@/components/site/page-skeleton'

/**
 * Shown instantly while the next signed-in page loads (for navigations
 * between pages); each page also has its own <Suspense> skeleton for its
 * data. The header and nav strip stay in place around it.
 */
export default function Loading() {
  return <PageSkeleton />
}
