// Button looks as class strings, so <button>, <Link> and form buttons can
// share them without a wrapper component. Every button is at least 44px
// tall, a comfortable touch target; `large` (56px) is for the actions staff
// repeat all day on a phone: Sell and Receive.

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-[0.95rem] font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export const button = {
  primary: `${base} bg-carbon text-on-carbon hover:bg-carbon-hover`,
  secondary: `${base} border border-line-strong bg-raised text-ink hover:bg-canary`,
  ghost: `${base} text-ink hover:bg-canary`,
  danger: `${base} bg-danger text-on-danger hover:bg-danger-hover`,
  dangerOutline: `${base} border border-danger bg-raised text-danger hover:bg-danger-soft`,
  large: 'inline-flex min-h-14 items-center justify-center gap-2 rounded-control bg-carbon px-5 text-lg font-bold text-on-carbon no-underline transition-colors hover:bg-carbon-hover disabled:cursor-not-allowed disabled:opacity-60',
  largeSecondary:
    'inline-flex min-h-14 items-center justify-center gap-2 rounded-control border border-line-strong bg-raised px-5 text-lg font-bold text-ink no-underline transition-colors hover:bg-canary disabled:cursor-not-allowed disabled:opacity-60',
  small:
    'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-raised px-3 text-sm font-semibold text-ink no-underline transition-colors hover:bg-canary disabled:cursor-not-allowed disabled:opacity-60',
  icon: 'inline-grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-canary hover:text-ink disabled:cursor-not-allowed disabled:opacity-45',
}
