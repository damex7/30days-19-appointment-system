'use client'

import { useActionState } from 'react'
import { addTimeOffAction } from '@/app/(app)/stylist/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/validation'

type Field = 'fromDate' | 'fromTime' | 'toDate' | 'toTime' | 'reason'
const LABELS: Record<Field, string> = { fromDate: 'From (day)', fromTime: 'From (time)', toDate: 'Until (day)', toTime: 'Until (time)', reason: 'Reason' }

/**
 * Native date and time inputs: every phone shows its own accessible picker.
 * The values are read as STUDIO time by the action (the hint says so), not
 * as the phone's local time.
 */
export function TimeOffForm({ today, zoneLabel }: { today: string; zoneLabel: string }) {
  const [state, action] = useActionState(addTimeOffAction, { status: 'idle' } satisfies FormState<Field>)
  // After a success, start again with empty fields (the key resets them).
  const values = state.status === 'error' ? state.values : undefined
  return (
    <form action={action} noValidate key={state.status === 'success' ? state.submissionId : 'form'}>
      <ErrorSummary state={state} labels={LABELS} />
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saved'} className="mb-5" live /> : null}
      <p className="mb-4 text-sm text-muted">Studio time, {zoneLabel}.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField name="fromDate" type="date" label={LABELS.fromDate} min={today} required defaultValue={values?.fromDate ?? today} errors={state.fieldErrors?.fromDate} />
        <TextField name="fromTime" type="time" label={LABELS.fromTime} required defaultValue={values?.fromTime ?? '09:00'} errors={state.fieldErrors?.fromTime} />
        <TextField name="toDate" type="date" label={LABELS.toDate} min={today} required defaultValue={values?.toDate ?? today} errors={state.fieldErrors?.toDate} />
        <TextField name="toTime" type="time" label={LABELS.toTime} required defaultValue={values?.toTime ?? '18:00'} errors={state.fieldErrors?.toTime} />
        <TextField name="reason" label="Reason (optional)" hint="Only the studio sees this." maxLength={200} defaultValue={values?.reason} errors={state.fieldErrors?.reason} className="sm:col-span-2" />
      </div>
      <SubmitButton className="mt-5" pendingLabel="Saving…">
        Add time off
      </SubmitButton>
    </form>
  )
}
