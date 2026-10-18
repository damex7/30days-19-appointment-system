// The last step of /book: an optional note and the Confirm button.
// The choices travel as hidden fields; the action checks every one again.
'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { bookAppointment, type BookState } from '@/app/(site)/book/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextAreaField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { NOTE_MAX } from '@/lib/booking/flow'

export function ConfirmForm({ hidden }: { hidden: Record<string, string> }) {
  const [state, action] = useActionState(bookAppointment, { status: 'idle' } satisfies BookState)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Arriving at this step (a time was just picked) moves focus to the
  // step's heading, so a screen reader user hears where they are and
  // keyboard users continue from here, not from the top of the page.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <form action={action} noValidate className="space-y-5">
      <h2 ref={headingRef} tabIndex={-1} className="text-3xl">
        Confirm your booking
      </h2>
      <ErrorSummary state={state} labels={{ note: 'Note' }}>
        {state.alternatives ? (
          state.alternatives.length > 0 ? (
            <div className="mt-3 text-sm">
              <p>These times are still open:</p>
              <ul className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {state.alternatives.map((alt) => (
                  <li key={alt.href}>
                    <Link href={alt.href} className="figures inline-flex min-h-11 items-center rounded-control border border-brand bg-tint px-3 font-semibold text-brand no-underline hover:bg-tint-strong">
                      {alt.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm">There are no other open times soon. Please try another stylist or another day.</p>
          )
        ) : null}
      </ErrorSummary>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <TextAreaField
        name="note"
        label="Note for your stylist (optional)"
        hint="Anything they should know: hair length, the colour you’d like, allergies."
        rows={3}
        maxLength={NOTE_MAX}
        defaultValue={state.values?.note}
        errors={state.fieldErrors?.note}
      />
      <SubmitButton variant="large" pendingLabel="Booking…" className="w-full sm:w-auto">
        Confirm booking
      </SubmitButton>
    </form>
  )
}
