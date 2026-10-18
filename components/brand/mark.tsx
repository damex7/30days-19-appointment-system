import { cn } from '@/lib/cn'

/*
  THE MARK: a receipt book, drawn by hand in SVG (no icon pack).

  Three sheets, slightly askew the way a well-used pad sits on a counter:
  the canary triplicate at the back, the rose duplicate in the middle and
  the white top copy in front, held by a carbon-black binding strip with a
  perforated tear line. Ruled lines and a heavier "total" line are on the
  top copy.

  The sheets use FIXED colours in both themes: it's a physical object, and
  the light sheets stand out on the dark carbon-paper background as they
  would on a real desk. The paths are slightly irregular on purpose (no
  perfect rectangles), so it reads as drawn, not generated.
*/
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Triplicate (canary), furthest back, turned a little clockwise. */}
      <path d="M11.2 5.6 27.4 7.1c.5 0 .8.5.8 1l-1.6 19.6c0 .5-.5.9-1 .8L9.4 27c-.5-.1-.9-.5-.8-1l1.6-19.6c.1-.5.5-.9 1-.8Z" fill="#f3e48c" stroke="#18181b" strokeWidth="1.1" strokeLinejoin="round" />
      {/* Duplicate (rose). */}
      <path d="M8.3 4.9 24.6 5.4c.6 0 1 .5 1 1l-.4 20c0 .6-.5 1-1 1L7.9 27.1c-.6 0-1-.5-1-1l.4-20.2c0-.6.5-1 1-1Z" fill="#f2b3ca" stroke="#18181b" strokeWidth="1.1" strokeLinejoin="round" />
      {/* Top copy (white), with a slightly wavy right edge. */}
      <path d="M5.6 4.4h16.6c.6 0 1 .4 1 1l.1 9.6-.2 11.4c0 .6-.4 1-1 1H5.7c-.6 0-1-.4-1-1L4.6 5.4c0-.6.4-1 1-1Z" fill="#fffdf7" stroke="#18181b" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Carbon binding strip across the top. */}
      <path d="M4.6 5.3c0-.5.4-.9 1-.9h16.6c.6 0 1 .4 1 .9v3.1H4.6Z" fill="#18181b" />
      {/* The perforated tear line under the strip. */}
      <path d="M5.4 10.1h17" stroke="#18181b" strokeWidth="0.9" strokeDasharray="1.1 1.1" strokeLinecap="round" />
      {/* Ruled lines, hand-drawn (each one a touch uneven). */}
      <path d="M7.4 14.1c3.3-.1 8.4.1 13.2 0M7.4 17.6c4.1 0 8.6-.1 13.2.1M7.4 21.1c2.9-.1 6.1 0 8.6 0" stroke="#8a8476" strokeWidth="0.9" strokeLinecap="round" fill="none" />
      {/* The total, underlined twice in biro-black. */}
      <path d="M16.8 23.6h3.9M16.8 24.9h3.9" stroke="#18181b" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
