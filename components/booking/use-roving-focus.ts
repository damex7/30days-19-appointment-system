// ROVING TABINDEX: a row or grid of buttons is ONE Tab stop, and the arrow
// keys move between the buttons inside it (the pattern WAI-ARIA describes
// for toolbars and grids). Without it, reaching the 40th time slot would
// take 40 presses of Tab; with it, Tab jumps past the whole grid.
//
// Exactly one button has tabIndex={0} (the selected one, or the first);
// the rest have -1, so Tab skips them. Left/Right move by one; in a grid,
// Up/Down move by a row, worked out from where the buttons actually sit on
// screen (the number of columns changes with the screen width). Home/End
// go to the first and last.
'use client'

import { useCallback, type KeyboardEvent } from 'react'

export function useRovingFocus(options: { grid?: boolean } = {}) {
  const { grid = false } = options
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const container = event.currentTarget
      const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-roving]'))
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      if (index === -1) return

      let next = index
      if (event.key === 'ArrowRight') next = index + 1
      else if (event.key === 'ArrowLeft') next = index - 1
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = items.length - 1
      else if (grid && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        // The columns in a row: how many buttons share the first one's top.
        const top = items[0]?.offsetTop ?? 0
        const columns = Math.max(1, items.filter((item) => item.offsetTop === top).length)
        next = index + (event.key === 'ArrowDown' ? columns : -columns)
      } else return

      event.preventDefault()
      const target = items[Math.min(items.length - 1, Math.max(0, next))]
      if (!target) return
      for (const item of items) item.tabIndex = item === target ? 0 : -1
      target.focus()
      // A date strip scrolls sideways: keep the focused day in view.
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
    [grid],
  )
}
