// STUDIO SETTINGS (admin only). updateTag('settings') expires the cached
// settings, so every page shows the change on the next request. A new
// time zone changes how wall-clock hours map to instants from then on:
// existing bookings are instants and stay exactly when they were.
'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { formValues } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { MENU_TAG } from '@/lib/studio/services'
import { SETTINGS_TAG, updateSettings } from '@/lib/settings'
import { settingsSchema } from '@/lib/studio/validation'
import { invalid, type FormState } from '@/lib/validation'

const FIELDS = ['studioName', 'timeZone', 'slotStepMinutes', 'minNoticeHours', 'bookingWindowDays', 'cancellationCutoffHours', 'whatsappNumber', 'address'] as const
export type SettingsField = (typeof FIELDS)[number]

export async function saveSettingsAction(_previous: FormState<SettingsField>, formData: FormData): Promise<FormState<SettingsField>> {
  await requireRole('admin')
  const values = formValues(formData, FIELDS)
  const parsed = settingsSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)
  // The trigger in db/migrations/007 checks the time zone against
  // PostgreSQL's own list as a second guard.
  await updateSettings(parsed.data)
  updateTag(SETTINGS_TAG)
  updateTag(MENU_TAG)
  redirect('/admin/settings?notice=saved')
}
