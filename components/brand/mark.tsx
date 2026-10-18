/*
  THE MARK: a single braid plaited into a loop, the way a stylist coils a
  finished braid to show it off, with the loose end tucked out at the
  bottom right and finished with a plum cuff bead.

  Hand-built SVG, no icon pack. The loop is sixteen "stitches", each a short
  tilted lozenge, alternating 99J plum and lavender so they read as two
  strands crossing over each other. A thin charcoal ring behind them is the
  third strand showing through. Colours come from the theme tokens, so the
  mark changes with light and dark mode by itself.
*/

const STITCHES = 16
const CENTRE = 20
const RADIUS = 12.5

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden focusable="false">
      {/* Third strand, glimpsed underneath. */}
      <circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill="none" stroke="var(--color-ink)" strokeOpacity="0.35" strokeWidth="1.2" />
      {Array.from({ length: STITCHES }, (_, i) => {
        const angle = (360 / STITCHES) * i
        const plum = i % 2 === 0
        return (
          <path
            key={angle}
            // A lozenge (pointed oval) drawn at the top of the ring, then
            // rotated into place and tilted 35° so neighbours overlap.
            d={`M ${CENTRE - 4.6} ${CENTRE - RADIUS} Q ${CENTRE} ${CENTRE - RADIUS - 3.6} ${CENTRE + 4.6} ${CENTRE - RADIUS} Q ${CENTRE} ${CENTRE - RADIUS + 3.6} ${CENTRE - 4.6} ${CENTRE - RADIUS} Z`}
            transform={`rotate(${angle} ${CENTRE} ${CENTRE}) rotate(${plum ? 35 : -35} ${CENTRE} ${CENTRE - RADIUS})`}
            fill={plum ? 'var(--color-brand)' : 'var(--color-tint-strong)'}
            stroke="var(--color-brand)"
            strokeWidth={plum ? 0 : 0.8}
          />
        )
      })}
      {/* The loose end, slipping out of the loop. */}
      <path d="M 28.5 29 C 31 31.5, 32 33, 34.5 34.2" fill="none" stroke="var(--color-brand)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M 29.6 27.6 C 32.4 30, 33.6 31.6, 35.6 32.4" fill="none" stroke="var(--color-tint-strong)" strokeWidth="1.6" strokeLinecap="round" />
      {/* The cuff bead. */}
      <rect x="33.2" y="31.4" width="4.6" height="3.6" rx="1.4" transform="rotate(28 35.5 33.2)" fill="var(--color-brand)" />
    </svg>
  )
}
