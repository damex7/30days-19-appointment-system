// SENDING EMAIL. The rest of the app only ever calls sendEmail(); swapping
// Resend for another provider means changing this one file.
//
// - RESEND_API_KEY set: the email goes out through Resend's HTTP API (one
//   POST with fetch, so no SDK is needed).
// - Not set: the email, link included, is printed to the server console.
//   Handy in development: sign up, then copy the link from the terminal.
import 'server-only'

/** A file sent with the email, e.g. the booking's .ics calendar file. */
export type EmailAttachment = { filename: string; content: string; contentType: string }

export type Email = {
  to: string
  subject: string
  text: string
  html: string
  attachments?: EmailAttachment[]
  /**
   * Resend's Idempotency-Key: if the same key is sent twice within 24 hours
   * (a retried request, a cron job run twice), Resend sends the email once.
   */
  idempotencyKey?: string
}

const RESEND_TIMEOUT_MS = 8000

/**
 * The site's public address, used to build every link in every email.
 *
 * Never built from the request's Host header. An attacker can send a
 * "forgot password" request for YOUR email with "Host: evil.example"; if
 * the link were built from that header, the real email in your inbox would
 * point at their site and hand them your reset token when you click it
 * ("password reset poisoning").
 */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}${path}`
}

/** Sends an email. Never throws: a failed send is logged, and the caller carries on. */
export async function sendEmail(email: Email): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(
      [
        '',
        '┌─ EMAIL (not sent: RESEND_API_KEY is not set) ─────────────',
        `│ To:      ${email.to}`,
        `│ Subject: ${email.subject}`,
        '│',
        ...email.text.split('\n').map((line) => `│ ${line}`),
        // Attachments (the .ics calendar file) are printed too, so they can be checked.
        ...(email.attachments ?? []).flatMap((file) => ['│', `│ ── Attachment: ${file.filename} (${file.contentType})`, ...file.content.split(/\r?\n/).filter(Boolean).map((line) => `│ ${line}`)]),
        '└────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    )
    return true
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'Ìpàdé <onboarding@resend.dev>',
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        // Resend wants file contents as base64.
        attachments: email.attachments?.map((file) => ({
          filename: file.filename,
          content: Buffer.from(file.content, 'utf8').toString('base64'),
          content_type: file.contentType,
        })),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Resend answered ${response.status}: ${await response.text()}`)
    return true
  } catch (error) {
    // The email address itself stays out of the logs.
    console.error(`[email] Sending "${email.subject}" failed:`, error instanceof Error ? error.message : error)
    return false
  }
}

// ---------------------------------------------------------------------------
// The messages
// ---------------------------------------------------------------------------

/** Escapes text placed into HTML, so a name like "<script>" is shown, not run. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/**
 * The shared email frame, in the studio's colours (bone paper, 99J plum).
 * Inline styles only: most email apps ignore <style> blocks.
 */
export function layout(heading: string, paragraphs: string[], button?: { label: string; url: string }): string {
  // A block that is already a table (the booking details) isn't wrapped in <p>.
  const body = paragraphs.map((p) => (p.startsWith('<table') ? p : `<p style="margin:0 0 16px;line-height:1.55">${p}</p>`)).join('')
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#5e1b3f;color:#fffcf7;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#5c5450">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(button.url)}</span></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f6f1e9;font-family:system-ui,sans-serif;color:#25211f">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px">
      <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#5e1b3f;letter-spacing:.02em">Ìpàdé</p>
      <div style="background:#fffcf7;border:1px solid #ddd3c7;border-top:4px solid #5e1b3f;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 16px;font-size:20px;color:#25211f">${escapeHtml(heading)}</h1>${body}${cta}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#5c5450">You're receiving this because of an action on an Ìpàdé account. If it wasn't you, you can ignore it.</p>
    </div></body></html>`
}

export function verifyEmailMessage(to: string, name: string, token: string): Email {
  const url = appUrl(`/verify-email?token=${token}`)
  return {
    to,
    subject: 'Confirm your email address',
    text: `Hello ${name},\n\nPlease confirm your email address by opening this link:\n${url}\n\nThe link works once and expires in 24 hours.`,
    html: layout(
      'Confirm your email address',
      [`Hello ${escapeHtml(name)},`, 'Please confirm this is your email address. The link works once and expires in 24 hours.'],
      { label: 'Confirm my email', url },
    ),
  }
}

export function resetPasswordMessage(to: string, name: string, token: string): Email {
  const url = appUrl(`/reset-password?token=${token}`)
  return {
    to,
    subject: 'Reset your password',
    text: `Hello ${name},\n\nSomeone (hopefully you) asked to reset your password. Open this link to choose a new one:\n${url}\n\nThe link works once and expires in 30 minutes. If you didn't ask for this, ignore this email: your password hasn't changed.`,
    html: layout(
      'Reset your password',
      [
        `Hello ${escapeHtml(name)},`,
        'Someone (hopefully you) asked to reset your password. The link works once and expires in 30 minutes.',
        "If you didn't ask for this, ignore this email: your password hasn't changed.",
      ],
      { label: 'Choose a new password', url },
    ),
  }
}


export function existingAccountMessage(to: string, name: string): Email {
  const login = appUrl('/login')
  const forgot = appUrl('/forgot-password')
  return {
    to,
    subject: 'You already have an account',
    text: `Hello ${name},

Someone (hopefully you) tried to create a new account with this email address, but you already have one.

Sign in: ${login}
Forgot your password? ${forgot}

If it wasn't you, you can ignore this email.`,
    html: layout(
      'You already have an account',
      [
        `Hello ${escapeHtml(name)},`,
        'Someone (hopefully you) tried to create a new account with this email address, but you already have one.',
        `Forgot your password? <a href="${escapeHtml(forgot)}" style="color:#5e1b3f">Reset it here</a>.`,
      ],
      { label: 'Sign in', url: login },
    ),
  }
}

/**
 * Sent when an admin creates a STYLIST account. It contains a link to
 * confirm the address, but NOT the temporary password: the admin passes
 * that on in person, so a forwarded or leaked email alone can't open the
 * account.
 */
export function welcomeMessage(to: string, name: string, adminName: string, token: string): Email {
  const url = appUrl(`/verify-email?token=${token}`)
  return {
    to,
    subject: 'Your Ìpàdé stylist account is ready',
    text: `Hello ${name},

${adminName} created an Ìpàdé stylist account for you, so you can see your appointments and book time off. They will give you a temporary password; you'll choose your own the first time you sign in.

Please also confirm your email address by opening this link:
${url}

The link works once and expires in 24 hours.`,
    html: layout(
      'Your stylist account is ready',
      [
        `Hello ${escapeHtml(name)},`,
        `${escapeHtml(adminName)} created an Ìpàdé stylist account for you, so you can see your appointments and book time off. They will give you a temporary password; you’ll choose your own the first time you sign in.`,
        'Please also confirm this is your email address. The link works once and expires in 24 hours.',
      ],
      { label: 'Confirm my email', url },
    ),
  }
}
