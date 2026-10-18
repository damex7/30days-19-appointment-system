// CLOSURES (admin only): whole days the studio is shut.
'use server'

import { refresh } from 'next/cache'
import { fieldError, formValues, readId, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { addClosure, deleteClosure } from '@/lib/studio/closures'
import { closureSchema } from '@/lib/studio/validation'
import { failed, invalid, type FormState } from '@/lib/validation'

export async function addClosureAction(_previous: FormState<'closedOn' | 'name'>, formData: FormData): Promise<FormState<'closedOn' | 'name'>> {
  await requireRole('admin')
  const values = formValues(formData, ['closedOn', 'name'] as const)
  const parsed = closureSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)
  // The UNIQUE on closed_on decides whether the day is already closed.
  if ((await addClosure(parsed.data.closedOn, parsed.data.name)) === 'duplicate') return fieldError('closedOn', 'That day is already closed.', values)
  refresh()
  return succeeded('Closure added. No new bookings can be made that day; check the list for any already booked.')
}

export async function deleteClosureAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (id === null) return failed('That request wasn’t valid.')
  if (!(await deleteClosure(id))) return failed('That closure wasn’t found.')
  refresh()
  return succeeded('Removed: the day is open for booking again.')
}
