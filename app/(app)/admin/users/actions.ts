// USER ADMIN SERVER ACTIONS (admin only).
//
// Each one starts with requireRole('admin'): hiding the buttons from others
// is only tidiness, because anyone signed in can send this POST with any
// user id. Every change is written to auth_events with the admin as actor.
'use server'

import { refresh } from 'next/cache'
import { succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { getRequestInfo } from '@/lib/auth/request'
import { setActive, setRole } from '@/lib/users'
import { changeRoleSchema, failed, field, setActiveSchema, type FormState } from '@/lib/validation'

export async function changeRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user: admin } = await requireRole('admin')
  const parsed = changeRoleSchema.safeParse({ userId: field(formData, 'userId'), role: field(formData, 'role') })
  if (!parsed.success) return failed('That request wasn’t valid.')
  // Checked here for a clear message, and again in SQL (setRole's
  // `id <> actorId`), which is the check that can't be skipped.
  if (parsed.data.userId === admin.id) return failed('You can’t change your own role.')

  const changed = await setRole(admin.id, parsed.data.userId, parsed.data.role, await getRequestInfo())
  if (!changed) return failed('Nothing changed: they may already have that role.')
  refresh()
  return succeeded(parsed.data.role === 'admin' ? 'Now an admin.' : 'Now a client.')
}

/**
 * Deactivate (sign out everywhere, no more logins) or reactivate. Never
 * yourself: `id <> actorId` in setActive's SQL, so even a hand-made request
 * can't lock out the admin who sends it, and there is always an admin left.
 */
export async function setActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user: admin } = await requireRole('admin')
  const parsed = setActiveSchema.safeParse({ userId: field(formData, 'userId'), active: field(formData, 'active') })
  if (!parsed.success) return failed('That request wasn’t valid.')
  if (parsed.data.userId === admin.id) return failed('You can’t deactivate your own account.')

  const changed = await setActive(admin.id, parsed.data.userId, parsed.data.active, await getRequestInfo())
  if (!changed) return failed('Nothing changed.')
  refresh()
  return succeeded(parsed.data.active ? 'Reactivated. They can sign in again.' : 'Deactivated and signed out everywhere.')
}
