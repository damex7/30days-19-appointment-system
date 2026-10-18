// SERVER ACTIONS for signing up, signing in, verifying an email and
// resetting a password. (Day 19: sign-up is open again, as on Day 17, and
// always creates a CLIENT. Stylist accounts are made by an admin.)
//
// CSRF: Server Actions are protected by Next.js itself. They can only be
// called with POST, and Next.js compares the request's Origin header with
// the Host and refuses a mismatch, so a form on another site can't submit
// to them. Together with the SameSite=Lax session cookie, that is the CSRF
// protection; there's no token to add by hand. (Route handlers don't get
// this: see app/logout/route.ts.)
//
// Every action: 1) reads the form, 2) validates with Zod, 3) rate-limits,
// 4) does the work, 5) returns a FormState (or redirects).
'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { getCurrentSession, homePathFor } from '@/lib/auth/dal'
import { existingAccountMessage, resetPasswordMessage, sendEmail, verifyEmailMessage } from '@/lib/auth/email'
import { recordEvent } from '@/lib/auth/events'
import { breachedMessage, checkBreachedPassword, hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password'
import { accountKey, checkRateLimit } from '@/lib/auth/rate-limit'
import { getRequestInfo } from '@/lib/auth/request'
import { startSession } from '@/lib/auth/session'
import { createEmailToken } from '@/lib/auth/tokens'
import { safeNextPath } from '@/lib/safe-redirect'
import { createUser, findUserByEmail, findUserWithHashByEmail, resetPasswordWithToken, updatePasswordHash, verifyEmailWithToken } from '@/lib/users'
import {
  emailOnlySchema,
  failed,
  field,
  invalid,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  verifyEmailSchema,
  type FormState,
} from '@/lib/validation'

/** The same words for every failed sign-in, whatever the reason. */
const LOGIN_FAILED = 'Email or password is incorrect.'

/** Shown after "forgot password" whether or not the account exists. */
const RESET_SENT = 'If an active account exists for that address, we’ve sent a link to reset the password. It expires in 30 minutes.'

/** A password from a known breach: a field error with the reason. */
function breached<F extends string>(count: number, values: Partial<Record<F, string>>, fieldName: F): FormState<F> {
  return {
    status: 'error',
    message: 'Please choose a different password.',
    fieldErrors: { [fieldName]: [breachedMessage(count)] } as Partial<Record<F, string[]>>,
    values,
    submissionId: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

type SignUpField = 'name' | 'email' | 'phone' | 'password'

/**
 * NO ACCOUNT ENUMERATION AT SIGN-UP. If "this email is already registered"
 * appeared on screen, anyone could test which addresses have accounts here.
 * So both cases end on the SAME "check your inbox" screen, and the
 * difference only reaches the inbox's owner:
 *   - new address: a "confirm your email" link;
 *   - taken address: a "you already have an account" email.
 * The emails are sent with after(), once the response has gone, so both
 * paths also take the same time to answer.
 *
 * That's also why sign-up doesn't sign you straight in: doing it only for
 * new accounts would give the secret away. You sign in next (the form
 * carries ?next= along, so a client who was halfway through booking lands
 * back on the same step), and confirming the email is required before the
 * first booking is confirmed.
 */
export async function signUp(_previous: FormState<SignUpField>, formData: FormData): Promise<FormState<SignUpField>> {
  const values = { name: field(formData, 'name'), email: field(formData, 'email'), phone: field(formData, 'phone') }
  const parsed = signUpSchema.safeParse({ ...values, password: field(formData, 'password') })
  if (!parsed.success) return invalid(parsed.error, values)
  const { name, email, phone, password } = parsed.data

  const request = await getRequestInfo()
  const limit = await checkRateLimit('signup', request.ip, email)
  if (!limit.ok) return failed(limit.message, values)

  const breach = await checkBreachedPassword(password)
  if (breach.breached) return breached<SignUpField>(breach.count, values, 'password')

  const passwordHash = await hashPassword(password)
  const userId = await createUser({ name, email, phone, passwordHash }, request)

  after(async () => {
    if (userId) {
      const token = await createEmailToken(userId, 'verify_email')
      await sendEmail(verifyEmailMessage(email, name, token))
    } else {
      const existing = await findUserByEmail(email)
      if (existing) await sendEmail(existingAccountMessage(existing.email, existing.name))
    }
  })

  return { status: 'success', values: { email }, submissionId: Date.now() }
}

// ---------------------------------------------------------------------------
// Log in
// ---------------------------------------------------------------------------

type LoginField = 'email' | 'password'

/**
 * NO ACCOUNT ENUMERATION AT LOGIN: "no account with that email" and "wrong
 * password" get the SAME message, and verifyPassword() runs argon2 even
 * when there is no user (against a dummy hash), so they take the same
 * time too. Otherwise the login form would answer "is ada@x.com
 * registered?" for anyone who asks.
 */
export async function login(_previous: FormState<LoginField>, formData: FormData): Promise<FormState<LoginField>> {
  const values = { email: field(formData, 'email') }
  const parsed = loginSchema.safeParse({ ...values, password: field(formData, 'password') })
  if (!parsed.success) return invalid(parsed.error, values)
  const { email, password } = parsed.data

  const request = await getRequestInfo()
  // Counted before the password is checked: a blocked attempt never reaches argon2.
  const limit = await checkRateLimit('login', request.ip, email)
  if (!limit.ok) return failed(limit.message, values)

  const user = await findUserWithHashByEmail(email)
  const ok = await verifyPassword(user?.passwordHash ?? null, password)

  if (!user || !ok) {
    await recordEvent({ type: 'login_failed', userId: user?.id ?? null, request, metadata: { reason: user ? 'wrong_password' : 'no_account' } })
    return failed(LOGIN_FAILED, values)
  }

  // DEACTIVATED (Day 18). Checked only AFTER the password matched, so this
  // clearer message reveals nothing to someone guessing: only the person
  // who knows the password learns the account exists and is switched off.
  if (user.deactivatedAt) {
    await recordEvent({ type: 'login_failed', userId: user.id, request, metadata: { reason: 'deactivated' } })
    return failed('This account has been deactivated. Contact the studio if you need access again.', values)
  }

  // The password was right: upgrade an old-settings hash while we have the
  // plain password in hand (the only moment we ever do).
  if (needsRehash(user.passwordHash)) await updatePasswordHash(user.id, await hashPassword(password))

  // New session (rotation), audit event, and forgetting this account's
  // failed attempts: one transaction, one round trip.
  await startSession(user.id, request, { type: 'logged_in', userId: user.id, request }, (tx) => [
    tx`DELETE FROM rate_limits WHERE key = ${accountKey('login', email)}`,
  ])

  redirect(safeNextPath(field(formData, 'next'), homePathFor(user.role)))
}

// ---------------------------------------------------------------------------
// Verify email
// ---------------------------------------------------------------------------

/**
 * The link in the email opens /verify-email, which shows a "Confirm"
 * button that posts here. Verifying on the GET itself would let email
 * scanners (which open every link to check it for malware) use up the
 * token, and it would break the app's rule that a GET never changes data.
 */
export async function verifyEmail(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifyEmailSchema.safeParse({ token: field(formData, 'token') })
  if (!parsed.success) return failed('This link isn’t valid. Check that you copied all of it.')

  const request = await getRequestInfo()
  const userId = await verifyEmailWithToken(parsed.data.token, request)
  if (!userId) return failed('This link has expired or was already used.')

  const current = await getCurrentSession()
  redirect(current?.user.id === userId ? '/start?notice=verified' : '/login?notice=verified')
}

/** "Send me a new link", from the banner on signed-in pages. */
export async function resendVerification(_previous: FormState, _formData: FormData): Promise<FormState> {
  const current = await getCurrentSession()
  if (!current) redirect('/login')
  const { user } = current
  if (user.emailVerifiedAt) return { status: 'success', message: 'Your email address is already confirmed.', submissionId: Date.now() }

  const request = await getRequestInfo()
  const limit = await checkRateLimit('resend', request.ip, user.id)
  if (!limit.ok) return failed(limit.message)

  const token = await createEmailToken(user.id, 'verify_email')
  const sent = await sendEmail(verifyEmailMessage(user.email, user.name, token))
  if (!sent) return failed('We couldn’t send the email just now. Please try again in a few minutes.')
  return { status: 'success', message: `We sent a new link to ${user.email}. It works for 24 hours.`, submissionId: Date.now() }
}

// ---------------------------------------------------------------------------
// Forgot and reset password
// ---------------------------------------------------------------------------

/**
 * Always answers "if an account exists, we've sent a link", and does the
 * real work (make a token, send the email, log it) in after(), once the
 * response has gone. So the answer and its timing are the same for
 * registered and unregistered addresses.
 */
export async function forgotPassword(_previous: FormState<'email'>, formData: FormData): Promise<FormState<'email'>> {
  const values = { email: field(formData, 'email') }
  const parsed = emailOnlySchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)
  const { email } = parsed.data

  const request = await getRequestInfo()
  const limit = await checkRateLimit('forgot', request.ip, email)
  if (!limit.ok) return failed(limit.message, values)

  after(async () => {
    const user = await findUserByEmail(email)
    // Day 18: nothing is sent to a deactivated account either (same screen).
    if (!user || user.deactivatedAt) return
    const token = await createEmailToken(user.id, 'reset_password')
    await sendEmail(resetPasswordMessage(user.email, user.name, token))
    await recordEvent({ type: 'password_reset_requested', userId: user.id, request })
  })

  return { status: 'success', message: RESET_SENT, values, submissionId: Date.now() }
}

/**
 * Sets a new password from a reset link. The token is checked again here
 * (and used up atomically by resetPasswordWithToken): the page's earlier
 * check only decided whether to show the form. Every existing session is
 * signed out, then this browser gets a fresh one.
 */
export async function resetPassword(_previous: FormState<'password'>, formData: FormData): Promise<FormState<'password'>> {
  const parsed = resetPasswordSchema.safeParse({ token: field(formData, 'token'), password: field(formData, 'password') })
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === 'token')) return failed('This reset link isn’t valid. Please request a new one.')
    return invalid(parsed.error, {})
  }
  const { token, password } = parsed.data

  const breach = await checkBreachedPassword(password)
  if (breach.breached) return breached(breach.count, {}, 'password')

  const request = await getRequestInfo()
  const userId = await resetPasswordWithToken(token, await hashPassword(password), request)
  if (!userId) return failed('This reset link has expired or was already used. Please request a new one.')

  await startSession(userId, request, { type: 'logged_in', userId, request, metadata: { via: 'password_reset' } })
  redirect('/start?notice=password-reset')
}
