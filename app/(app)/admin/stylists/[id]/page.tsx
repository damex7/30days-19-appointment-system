import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { EditStylistForm } from '@/components/admin/stylist-forms'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { listServicesForAdmin } from '@/lib/studio/services'
import { listStylistsForAdmin } from '@/lib/studio/stylists'

export const metadata: Metadata = { title: 'Edit stylist' }

export default function EditStylistPage({ params }: PageProps<'/admin/stylists/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditStylist params={params} />
    </Suspense>
  )
}

async function EditStylist({ params }: Pick<PageProps<'/admin/stylists/[id]'>, 'params'>) {
  await requireRole('admin')
  const { id } = await params
  const [stylists, services] = await Promise.all([listStylistsForAdmin(), listServicesForAdmin()])
  const stylist = stylists.find((s) => String(s.id) === id)
  if (!stylist) notFound()
  // Archived services stay listed if this stylist still has them ticked.
  const options = services.filter((s) => !s.archivedAt || stylist.serviceIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name, category: s.category }))
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: '/admin/stylists', label: 'Stylists' }} title={`Edit ${stylist.displayName}`} description={`${stylist.name} · ${stylist.email}`} />
      <Sheet>
        <EditStylistForm stylist={stylist} services={options} />
      </Sheet>
    </div>
  )
}
