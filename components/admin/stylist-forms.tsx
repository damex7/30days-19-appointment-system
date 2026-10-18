'use client'

import { useActionState } from 'react'
import { createStylistAction, updateStylistAction, type CreateStylistState } from '@/app/(app)/admin/stylists/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { FieldError, TextAreaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { CopyButton } from '@/components/ui/copy-button'
import { Icon } from '@/components/ui/icon'
import { CATEGORY_LABELS, type Category } from '@/lib/studio/categories'
import { EMAIL_MAX, NAME_MAX, type FormState } from '@/lib/validation'

export type ServiceOption = { id: number; name: string; category: Category }

/** Checkboxes for the services a stylist offers, grouped by category, in a fieldset with a legend. */
function ServiceChecklist({ services, checked, errors }: { services: ServiceOption[]; checked: number[]; errors?: string[] }) {
  const categories = [...new Set(services.map((s) => s.category))]
  return (
    <fieldset aria-describedby={errors?.length ? 'serviceIds-error' : undefined}>
      <legend className="mb-2 font-semibold">Services they offer</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {categories.map((category) => (
          <div key={category}>
            <p className="mb-1 text-sm text-muted">{CATEGORY_LABELS[category]}</p>
            <ul className="space-y-1">
              {services
                .filter((s) => s.category === category)
                .map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-tint">
                      <input type="checkbox" name="serviceIds" value={s.id} defaultChecked={checked.includes(s.id)} className="size-5 accent-[var(--color-brand)]" />
                      {s.name}
                    </label>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <FieldError name="serviceIds" errors={errors} />
    </fieldset>
  )
}

/**
 * Create a stylist account. On success the temporary password appears
 * ONCE, with a copy button. It isn't stored anywhere it could be shown again.
 */
export function CreateStylistForm({ services }: { services: ServiceOption[] }) {
  const [state, action] = useActionState<CreateStylistState, FormData>(createStylistAction, { status: 'idle' })
  const value = (name: 'name' | 'email' | 'displayName' | 'bio') => (state.status === 'error' ? state.values?.[name] : undefined) ?? ''
  // A new key after each success clears the form for the next one.
  const reset = state.created ? state.submissionId : 'form'

  return (
    <div className="space-y-5">
      {state.created ? (
        <div role="status" className="rounded-control border-2 border-success bg-success-soft p-4">
          <p className="flex items-center gap-2 font-bold text-success">
            <Icon name="checkCircle" />
            {state.message}
          </p>
          <p className="mt-2 text-[0.95rem]">
            Give {state.created.name} this temporary password in person or on WhatsApp. <strong>It is shown only this once.</strong> They’ll choose
            their own the first time they sign in as <span className="break-all">{state.created.email}</span>, and we’ve emailed them a link to
            confirm the address.
          </p>
          <p className="figures mt-3 rounded-control border border-line-strong bg-raised px-3 py-2 text-lg tracking-wide select-all">{state.created.tempPassword}</p>
          <div className="mt-2">
            <CopyButton text={state.created.tempPassword} label="Copy password" />
          </div>
        </div>
      ) : null}

      <form action={action} noValidate className="space-y-5" key={reset}>
        <ErrorSummary state={state} labels={{ name: 'Full name', email: 'Email', displayName: 'Name clients see', bio: 'Bio', serviceIds: 'Services' }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField name="name" label="Full name" required maxLength={NAME_MAX} autoComplete="off" defaultValue={value('name')} errors={state.fieldErrors?.name} />
          <TextField name="email" label="Email (for signing in)" type="email" required maxLength={EMAIL_MAX} autoComplete="off" defaultValue={value('email')} errors={state.fieldErrors?.email} />
          <TextField name="displayName" label="Name clients see" hint="Usually a first name, like Funmi." required maxLength={60} defaultValue={value('displayName')} errors={state.fieldErrors?.displayName} />
          <TextAreaField name="bio" label="Short bio (optional)" rows={2} maxLength={500} defaultValue={value('bio')} errors={state.fieldErrors?.bio} />
        </div>
        <ServiceChecklist services={services} checked={[]} errors={state.fieldErrors?.serviceIds} />
        <p className="text-sm text-muted">Then set their working hours on the Hours page, or they won’t have any open times.</p>
        <SubmitButton pendingLabel="Creating…">
          <Icon name="plus" />
          Create stylist account
        </SubmitButton>
      </form>
    </div>
  )
}

export function EditStylistForm({ stylist, services }: { stylist: { id: number; displayName: string; bio: string; serviceIds: number[] }; services: ServiceOption[] }) {
  const [state, action] = useActionState(updateStylistAction, { status: 'idle' } satisfies FormState<'displayName' | 'bio' | 'serviceIds'>)
  return (
    <form action={action} noValidate className="space-y-5">
      <ErrorSummary state={state} labels={{ displayName: 'Name clients see', bio: 'Bio', serviceIds: 'Services' }} />
      <input type="hidden" name="id" value={stylist.id} />
      <TextField name="displayName" label="Name clients see" required maxLength={60} defaultValue={state.values?.displayName ?? stylist.displayName} errors={state.fieldErrors?.displayName} />
      <TextAreaField name="bio" label="Short bio" rows={3} maxLength={500} defaultValue={state.values?.bio ?? stylist.bio} errors={state.fieldErrors?.bio} />
      <ServiceChecklist services={services} checked={stylist.serviceIds} errors={state.fieldErrors?.serviceIds} />
      <p className="text-sm text-muted">Unticking a service doesn’t affect bookings already made for it.</p>
      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  )
}
