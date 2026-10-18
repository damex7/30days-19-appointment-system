'use client'

import { useActionState, useState } from 'react'
import { adminBookAction, type AdminBookField } from '@/app/(app)/admin/bookings/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextAreaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { NOTE_MAX } from '@/lib/booking/flow'
import { EMAIL_MAX, PHONE_MAX, type FormState } from '@/lib/validation'

const LABELS: Record<AdminBookField, string> = {
  clientKind: 'Who it’s for',
  email: 'Client’s email',
  walkInName: 'Client’s name',
  walkInPhone: 'Client’s phone',
  note: 'Note',
}

/** Who the booking is for: an existing client account, or a walk-in/phone client by name. */
export function AdminBookForm({ hidden }: { hidden: Record<string, string> }) {
  const [state, action] = useActionState(adminBookAction, { status: 'idle' } satisfies FormState<AdminBookField>)
  const [kind, setKind] = useState<'account' | 'walk_in'>(state.values?.clientKind === 'account' ? 'account' : 'walk_in')
  return (
    <form action={action} noValidate className="space-y-5">
      <ErrorSummary state={state} labels={LABELS} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset>
        <legend className="mb-2 font-semibold">{LABELS.clientKind}</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(
            [
              ['walk_in', 'Walk-in or phone client'],
              ['account', 'Client with an account'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line-strong bg-raised px-3 has-[:checked]:border-brand has-[:checked]:bg-tint">
              <input type="radio" name="clientKind" value={value} checked={kind === value} onChange={() => setKind(value)} className="size-5 accent-[var(--color-brand)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === 'account' ? (
        <TextField name="email" type="email" label={LABELS.email} hint="They’ll get the confirmation email and calendar file." required maxLength={EMAIL_MAX} defaultValue={state.values?.email} errors={state.fieldErrors?.email} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField name="walkInName" label={LABELS.walkInName} required maxLength={100} autoComplete="off" defaultValue={state.values?.walkInName} errors={state.fieldErrors?.walkInName} />
          <TextField name="walkInPhone" type="tel" inputMode="tel" label={`${LABELS.walkInPhone} (optional)`} maxLength={PHONE_MAX} defaultValue={state.values?.walkInPhone} errors={state.fieldErrors?.walkInPhone} />
        </div>
      )}
      <TextAreaField name="note" label="Note (optional)" rows={2} maxLength={NOTE_MAX} defaultValue={state.values?.note} errors={state.fieldErrors?.note} />
      <SubmitButton variant="large" pendingLabel="Booking…">
        Book it
      </SubmitButton>
    </form>
  )
}
