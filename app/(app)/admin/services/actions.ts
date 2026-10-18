// SERVICES CRUD (admin only). Each action starts with requireRole('admin'):
// hiding the admin pages from others is only tidiness, because anyone
// signed in can send this POST.
//
// After a change, updateTag('menu') expires the cached menu, so the home
// page and /book show it on the very next request (read-your-own-writes).
'use server'

import { refresh, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldError, formValues, readArchived, readId, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { isUniqueError } from '@/lib/db-errors'
import { createService, deleteService, MENU_TAG, setServiceArchived, updateService } from '@/lib/studio/services'
import { serviceSchema } from '@/lib/studio/validation'
import { failed, invalid, type FormState } from '@/lib/validation'

const FIELDS = ['name', 'slug', 'category', 'description', 'durationMinutes', 'bufferMinutes', 'priceKobo'] as const
export type ServiceField = (typeof FIELDS)[number]

export async function saveServiceAction(_previous: FormState<ServiceField>, formData: FormData): Promise<FormState<ServiceField>> {
  await requireRole('admin')
  const values = formValues(formData, FIELDS)
  const parsed = serviceSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const id = readId(formData)
  try {
    if (id === null) await createService(parsed.data)
    else if (!(await updateService(id, parsed.data))) return failed('That service wasn’t found.', values)
  } catch (error) {
    // The UNIQUE constraint on slug decides, so two admins can't take the same one.
    if (isUniqueError(error)) return fieldError('slug', 'Another service already uses this web address. Choose a different one.', values)
    throw error
  }
  updateTag(MENU_TAG)
  redirect(`/admin/services?notice=${id === null ? 'created' : 'saved'}`)
}

export async function archiveServiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (id === null) return failed('That request wasn’t valid.')
  const archived = readArchived(formData)
  if (!(await setServiceArchived(id, archived))) return failed('Nothing changed.')
  updateTag(MENU_TAG)
  refresh()
  return succeeded(archived ? 'Archived: it’s off the menu, and old bookings keep it.' : 'Restored to the menu.')
}

/** Delete, only for a service that was never booked; otherwise offer to archive. */
export async function deleteServiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (id === null) return failed('That request wasn’t valid.')
  const result = await deleteService(id)
  if (result === 'in_use') {
    return { status: 'error', message: 'This service has bookings, so it can’t be deleted: their history needs it. Archive it instead to take it off the menu.', offerArchive: true, submissionId: Date.now() }
  }
  if (result === 'not_found') return failed('That service wasn’t found.')
  updateTag(MENU_TAG)
  refresh()
  return succeeded('Deleted.')
}
