// The confirm step of a reschedule. The booking id and the VERSION the
// person saw travel as hidden fields: if anyone changed the booking in the
// meantime, the version no longer matches and nothing is overwritten.
'use client'

import { useActionState, useEffect, useRef } from 'react'
import { rescheduleBookingAction } from '@/app/(app)/appointments/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SubmitButton } from '@/components/forms/submit-button'
import type { FormState } from '@/lib/validation'

export function RescheduleForm({ hidden, summary }: { hidden: Record<string, string>; summary: string }) {
  const [state, action] = useActionState(rescheduleBookingAction, { status: 'idle' } satisfies FormState)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // A new time was just picked: take focus to this step.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  return (
    <form action={action} className="space-y-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-3xl">
        Move it to {summary}?
      </h2>
      <ErrorSummary state={state} labels={{}} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className="text-muted">Your old time is released at the same moment the new one is taken, so you can’t end up with both, or neither.</p>
      <SubmitButton variant="large" pendingLabel="Moving…" className="w-full sm:w-auto">
        Confirm new time
      </SubmitButton>
    </form>
  )
}
