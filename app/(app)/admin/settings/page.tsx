import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SettingsForm } from '@/components/admin/settings-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Flash } from '@/components/ui/flash'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { formatPhone } from '@/lib/phone'
import { getSettings } from '@/lib/settings'

export const metadata: Metadata = { title: 'Studio settings' }

export default function SettingsPage({ searchParams }: PageProps<'/admin/settings'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  )
}

async function Settings({ searchParams }: Pick<PageProps<'/admin/settings'>, 'searchParams'>) {
  await requireRole('admin')
  const [settings, { notice }] = await Promise.all([getSettings(), searchParams])
  return (
    <div className="mx-auto max-w-3xl">
      <Flash message={notice === 'saved' ? 'Settings saved. Every page now uses them.' : null} />
      <PageHeader title="Studio settings" description={`Current time zone: ${settings.timeZone}, ${settings.zoneLabel}.`} />
      <Sheet>
        <SettingsForm
          zones={Intl.supportedValuesOf('timeZone')}
          initial={{
            studioName: settings.studioName,
            timeZone: settings.timeZone,
            slotStepMinutes: String(settings.slotStepMinutes),
            minNoticeHours: String(settings.minNoticeHours),
            bookingWindowDays: String(settings.bookingWindowDays),
            cancellationCutoffHours: String(settings.cancellationCutoffHours),
            whatsappNumber: formatPhone(settings.whatsappNumber),
            address: settings.address,
          }}
        />
      </Sheet>
    </div>
  )
}
