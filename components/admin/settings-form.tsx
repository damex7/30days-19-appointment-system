'use client'

import { useActionState } from 'react'
import { saveSettingsAction, type SettingsField } from '@/app/(app)/admin/settings/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SelectField, TextAreaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import type { FormState } from '@/lib/validation'

const LABELS: Record<SettingsField, string> = {
  studioName: 'Studio name',
  timeZone: 'Time zone',
  slotStepMinutes: 'Slot step',
  minNoticeHours: 'Minimum notice',
  bookingWindowDays: 'Booking window',
  cancellationCutoffHours: 'Cancellation cut-off',
  whatsappNumber: 'WhatsApp number',
  address: 'Address',
}

export function SettingsForm({ initial, zones }: { initial: Record<SettingsField, string>; zones: string[] }) {
  const [state, action] = useActionState(saveSettingsAction, { status: 'idle' } satisfies FormState<SettingsField>)
  const v = (name: SettingsField) => state.values?.[name] ?? initial[name]
  const e = (name: SettingsField) => state.fieldErrors?.[name]
  return (
    <form action={action} noValidate className="space-y-5">
      <ErrorSummary state={state} labels={LABELS} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField name="studioName" label={LABELS.studioName} required maxLength={100} defaultValue={v('studioName')} errors={e('studioName')} />
        <SelectField
          name="timeZone"
          label={LABELS.timeZone}
          hint="Every time is shown and entered in this zone, whatever a visitor’s phone says."
          defaultValue={v('timeZone')}
          errors={e('timeZone')}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </SelectField>
        <SelectField name="slotStepMinutes" label={LABELS.slotStepMinutes} hint="Start times are offered on this grid." defaultValue={v('slotStepMinutes')} errors={e('slotStepMinutes')}>
          {[5, 10, 15, 20, 30, 60].map((n) => (
            <option key={n} value={n}>
              Every {n} minutes
            </option>
          ))}
        </SelectField>
        <TextField name="minNoticeHours" type="number" inputMode="numeric" min={0} max={168} label={`${LABELS.minNoticeHours} (hours)`} hint="No online bookings sooner than this." required defaultValue={v('minNoticeHours')} errors={e('minNoticeHours')} />
        <TextField name="bookingWindowDays" type="number" inputMode="numeric" min={1} max={365} label={`${LABELS.bookingWindowDays} (days)`} hint="How far ahead clients can book." required defaultValue={v('bookingWindowDays')} errors={e('bookingWindowDays')} />
        <TextField
          name="cancellationCutoffHours"
          type="number"
          inputMode="numeric"
          min={0}
          max={168}
          label={`${LABELS.cancellationCutoffHours} (hours)`}
          hint="Clients can reschedule or cancel online until this long before."
          required
          defaultValue={v('cancellationCutoffHours')}
          errors={e('cancellationCutoffHours')}
        />
        <TextField name="whatsappNumber" type="tel" inputMode="tel" label={LABELS.whatsappNumber} required defaultValue={v('whatsappNumber')} errors={e('whatsappNumber')} />
        <TextAreaField name="address" label={LABELS.address} rows={2} maxLength={300} required defaultValue={v('address')} errors={e('address')} />
      </div>
      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  )
}
