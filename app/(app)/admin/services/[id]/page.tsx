import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ServiceForm } from '@/components/admin/service-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { getServiceById } from '@/lib/studio/services'

export const metadata: Metadata = { title: 'Edit service' }

export default function EditServicePage({ params }: PageProps<'/admin/services/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditService params={params} />
    </Suspense>
  )
}

async function EditService({ params }: Pick<PageProps<'/admin/services/[id]'>, 'params'>) {
  await requireRole('admin')
  const { id } = await params
  if (!/^\d{1,9}$/.test(id)) notFound()
  const service = await getServiceById(Number(id))
  if (!service) notFound()
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: '/admin/services', label: 'Services' }} title={`Edit ${service.name}`} />
      <Sheet>
        <ServiceForm service={service} />
      </Sheet>
    </div>
  )
}
