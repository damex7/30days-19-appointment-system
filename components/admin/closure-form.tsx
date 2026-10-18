'use client'

import { useActionState } from 'react'
import { addClosureAction } from '@/app/(app)/admin/closures/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/validation'

export function ClosureForm({ today }: { today: string }) {
  const [state, action] = useActionState(addClosureAction, { status: 'idle' } satisfies FormState<'closedOn' | 'name'>)
  const values = state.status === 'error' ? state.values : undefined
  return (
    <form action={action} noValidate key={state.status === 'success' ? state.submissionId : 'form'}>
      <ErrorSummary state={state} labels={{ closedOn: 'Date', name: 'Name' }} />
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saved'} className="mb-5" live /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
        <TextField name="closedOn" type="date" label="Date" min={today} required defaultValue={values?.closedOn} errors={state.fieldErrors?.closedOn} />
        <TextField name="name" label="Name" hint="For example, Independence Day." required maxLength={100} defaultValue={values?.name} errors={state.fieldErrors?.name} />
      </div>
      <SubmitButton className="mt-4" pendingLabel="Saving…">
        Add closure
      </SubmitButton>
    </form>
  )
}
