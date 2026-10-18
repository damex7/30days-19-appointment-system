import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ServiceForm } from '@/components/admin/service-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'

export const metadata: Metadata = { title: 'Add a service' }

export default function NewServicePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewService />
    </Suspense>
  )
}

async function NewService() {
  await requireRole('admin')
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: '/admin/services', label: 'Services' }} title="Add a service" description="Then tick it for the stylists who offer it, on the Stylists page." />
      <Sheet>
        <ServiceForm />
      </Sheet>
    </div>
  )
}
