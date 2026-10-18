'use client'

import { useActionState } from 'react'
import { saveServiceAction, type ServiceField } from '@/app/(app)/admin/services/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SelectField, TextAreaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { koboToInput } from '@/lib/money'
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/studio/categories'
import type { FormState } from '@/lib/validation'

const LABELS: Record<ServiceField, string> = {
  name: 'Name',
  slug: 'Web address',
  category: 'Category',
  description: 'Description',
  durationMinutes: 'Duration',
  bufferMinutes: 'Clean-up time',
  priceKobo: 'Price',
}

type Initial = { id: number; name: string; slug: string; category: string; description: string; durationMinutes: number; bufferMinutes: number; priceKobo: number }

/** Create (no `service`) or edit. Values typed are kept after an error. */
export function ServiceForm({ service }: { service?: Initial }) {
  const [state, action] = useActionState(saveServiceAction, { status: 'idle' } satisfies FormState<ServiceField>)
  const v = (name: ServiceField, fallback: string) => state.values?.[name] ?? fallback
  const e = (name: ServiceField) => state.fieldErrors?.[name]
  return (
    <form action={action} noValidate className="space-y-5">
      <ErrorSummary state={state} labels={LABELS} />
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField name="name" label={LABELS.name} required maxLength={80} defaultValue={v('name', service?.name ?? '')} errors={e('name')} />
        <TextField
          name="slug"
          label={LABELS.slug}
          hint="Used in booking links: /book?service=knotless-braids"
          required
          maxLength={80}
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={v('slug', service?.slug ?? '')}
          errors={e('slug')}
        />
        <SelectField name="category" label={LABELS.category} required defaultValue={v('category', service?.category ?? '')} errors={e('category')}>
          <option value="">Choose…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <TextField
          name="priceKobo"
          label={`${LABELS.priceKobo} (₦)`}
          inputMode="decimal"
          required
          hint="Clients pay at the studio. Existing bookings keep the price they were booked at."
          defaultValue={v('priceKobo', service ? koboToInput(service.priceKobo) : '')}
          errors={e('priceKobo')}
        />
        <TextField
          name="durationMinutes"
          type="number"
          inputMode="numeric"
          min={5}
          max={720}
          step={5}
          label={`${LABELS.durationMinutes} (minutes)`}
          hint="Time in the chair, in multiples of 5."
          required
          defaultValue={v('durationMinutes', String(service?.durationMinutes ?? ''))}
          errors={e('durationMinutes')}
        />
        <TextField
          name="bufferMinutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={120}
          step={5}
          label={`${LABELS.bufferMinutes} (minutes)`}
          hint="Kept free after each booking for sweeping and sterilising."
          required
          defaultValue={v('bufferMinutes', String(service?.bufferMinutes ?? 15))}
          errors={e('bufferMinutes')}
        />
        <TextAreaField
          name="description"
          label={LABELS.description}
          rows={3}
          maxLength={500}
          className="sm:col-span-2"
          defaultValue={v('description', service?.description ?? '')}
          errors={e('description')}
        />
      </div>
      <SubmitButton pendingLabel="Saving…">{service ? 'Save changes' : 'Add service'}</SubmitButton>
    </form>
  )
}
