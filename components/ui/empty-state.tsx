import type { ReactNode } from 'react'
import { Mark } from '@/components/brand/mark'

/** A calm, centred message for empty lists, on a ruled sheet with the receipt-book mark. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ruled flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
      <Mark className="mb-4 size-14" />
      <h2 className="text-xl">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-muted [&_a]:font-semibold [&_a]:text-ink [&_a]:underline">{children}</div> : null}
    </div>
  )
}
