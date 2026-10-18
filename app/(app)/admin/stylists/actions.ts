// STYLIST ACCOUNTS (admin only).
//
// Only an admin can create a stylist: sign-up always makes a client. The
// new account gets a random TEMPORARY password, shown to the admin once to
// hand over in person; only its argon2id hash is stored, and
// must_change_password makes the stylist choose their own at first sign-in.
'use server'

import { refresh, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { fieldError, readId, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { sendEmail, welcomeMessage } from '@/lib/auth/email'
import { hashPassword } from '@/lib/auth/password'
import { getRequestInfo } from '@/lib/auth/request'
import { generateTemporaryPassword } from '@/lib/auth/temp-password'
import { createEmailToken } from '@/lib/auth/tokens'
import { MENU_TAG } from '@/lib/studio/services'
import { createStylistAccount, setStylistActive, updateStylist } from '@/lib/studio/stylists'
import { newStylistSchema, stylistProfileSchema } from '@/lib/studio/validation'
import { failed, field, invalid, type FormState } from '@/lib/validation'

type NewField = 'name' | 'email' | 'displayName' | 'bio' | 'serviceIds'

/** The answer after creating an account: includes the temporary password, shown ONCE. */
export type CreateStylistState = FormState<NewField> & { created?: { name: string; email: string; tempPassword: string } }

/** The ticked services: checkboxes all named serviceIds. */
function readServiceIds(formData: FormData): string[] {
  return formData.getAll('serviceIds').filter((v): v is string => typeof v === 'string')
}

export async function createStylistAction(_previous: CreateStylistState, formData: FormData): Promise<CreateStylistState> {
  const { user: admin } = await requireRole('admin')
  const values = { name: field(formData, 'name'), email: field(formData, 'email'), displayName: field(formData, 'displayName'), bio: field(formData, 'bio') }
  const parsed = newStylistSchema.safeParse({ ...values, serviceIds: readServiceIds(formData) })
  if (!parsed.success) return invalid(parsed.error, values)

  const tempPassword = generateTemporaryPassword()
  const userId = await createStylistAccount(admin.id, { ...parsed.data, passwordHash: await hashPassword(tempPassword) }, await getRequestInfo())
  // Only an admin sees this, so saying "taken" reveals nothing new.
  if (!userId) return fieldError('email', 'There’s already an account with that email address.', values)

  after(async () => {
    const token = await createEmailToken(userId, 'verify_email')
    await sendEmail(welcomeMessage(parsed.data.email, parsed.data.name, admin.name, token))
  })
  updateTag(MENU_TAG)
  refresh()
  return {
    status: 'success',
    message: `Stylist account created for ${parsed.data.displayName}.`,
    created: { name: parsed.data.name, email: parsed.data.email, tempPassword },
    submissionId: Date.now(),
  }
}

type ProfileField = 'displayName' | 'bio' | 'serviceIds'

export async function updateStylistAction(_previous: FormState<ProfileField>, formData: FormData): Promise<FormState<ProfileField>> {
  await requireRole('admin')
  const id = readId(formData)
  if (id === null) return failed('That request wasn’t valid.')
  const values = { displayName: field(formData, 'displayName'), bio: field(formData, 'bio') }
  const parsed = stylistProfileSchema.safeParse({ ...values, serviceIds: readServiceIds(formData) })
  if (!parsed.success) return invalid(parsed.error, values)
  if (!(await updateStylist(id, parsed.data))) return failed('That stylist wasn’t found.', values)
  updateTag(MENU_TAG)
  redirect('/admin/stylists?notice=saved')
}

export async function setStylistActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (id === null) return failed('That request wasn’t valid.')
  const active = field(formData, 'active') === 'true'
  const result = await setStylistActive(id, active)
  if (result === 'has_bookings') return failed('They still have upcoming bookings. Move or cancel those first, so no client is left without a stylist.')
  if (result === 'unchanged') return failed('Nothing changed.')
  updateTag(MENU_TAG)
  refresh()
  return succeeded(active ? 'Back on the booking page.' : 'Taken off the booking page. Their past bookings are kept.')
}
