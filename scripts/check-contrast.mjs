// npm run check:contrast
//
// Reads the colour tokens from app/globals.css (both sides of every
// light-dark() pair) and checks the text/background pairs the UI actually
// uses against WCAG 2.2 contrast minimums, in light AND dark mode:
//   text  4.5:1  normal-size text
//   ui    3:1    non-text UI: focus rings, input borders, the key mark
// Exits with code 1 if any pair fails, so it can run in CI.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const tokens = {}
for (const m of css.matchAll(/--color-([a-z-]+):\s*(?:light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)|(#[0-9a-f]{6}))/gi)) {
  const [, name, light, dark, both] = m
  tokens[name] = { light: light ?? both, dark: dark ?? both }
}

// [foreground, background, kind, where it's used]
const PAIRS = [
  ['ink', 'paper', 'text', 'body text, headings'],
  ['ink', 'raised', 'text', 'text on sheets, tables and inputs'],
  ['ink', 'sunken', 'text', 'text in wells'],
  ['ink', 'canary', 'text', 'table headers, selected rows'],
  ['ink', 'canary-strong', 'text', 'hovered table row'],
  ['ink', 'rose-soft', 'text', 'highlighted text, active nav item'],
  ['muted', 'paper', 'text', 'hints, dates, helper text'],
  ['muted', 'raised', 'text', 'hints on sheets'],
  ['muted', 'sunken', 'text', 'muted text in wells'],
  ['muted', 'canary', 'text', 'muted text in table headers'],
  ['on-carbon', 'carbon', 'text', 'primary button label'],
  ['on-carbon', 'carbon-hover', 'text', 'primary button label (hover)'],
  ['rose', 'paper', 'text', 'rose accent text on the page'],
  ['rose', 'raised', 'text', 'rose accent text on sheets'],
  ['rose', 'rose-soft', 'text', 'active nav item text'],
  ['danger', 'paper', 'text', 'error messages under fields'],
  ['danger', 'raised', 'text', 'errors on sheets'],
  ['danger', 'danger-soft', 'text', 'error summary heading'],
  ['ink', 'danger-soft', 'text', 'body text in the error summary'],
  ['on-danger', 'danger', 'text', 'the Out badge, delete buttons'],
  ['on-danger', 'danger-hover', 'text', 'delete button (hover)'],
  ['danger', 'canary', 'text', 'an out-of-stock quantity in a selected row'],
  ['warning', 'raised', 'text', 'low quantities in tables'],
  ['warning', 'warning-soft', 'text', 'the Low badge, warning banner heading'],
  ['ink', 'warning-soft', 'text', 'body text in warning banners'],
  ['warning', 'canary', 'text', 'Low in a selected row'],
  ['on-warning', 'warning', 'text', 'solid low-stock counter'],
  ['success', 'raised', 'text', 'In stock text in tables'],
  ['success', 'success-soft', 'text', 'success banner heading'],
  ['ink', 'success-soft', 'text', 'body text in success banners'],
  ['on-success', 'success', 'text', 'solid success badge'],
  ['line-strong', 'paper', 'ui', 'input and button borders'],
  ['line-strong', 'raised', 'ui', 'input borders on sheets'],
  ['focus', 'paper', 'ui', 'focus ring'],
  ['focus', 'raised', 'ui', 'focus ring on sheets'],
  ['focus', 'canary', 'ui', 'focus ring inside table headers'],
  ['danger', 'raised', 'ui', 'invalid input border'],
  ['carbon', 'paper', 'ui', 'primary button against the page'],
]
const MIN = { text: 4.5, large: 3, ui: 3 }

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

let failures = 0
for (const mode of ['light', 'dark']) {
  console.log(`\n${mode.toUpperCase()} MODE`)
  for (const [fg, bg, kind, where] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`  ✗ missing token: ${!tokens[fg] ? fg : bg}`)
      failures++
      continue
    }
    const r = ratio(tokens[fg][mode], tokens[bg][mode])
    const ok = r >= MIN[kind]
    if (!ok) failures++
    console.log(`  ${ok ? '✓' : '✗'} ${r.toFixed(2).padStart(5)}:1  ${`${fg} on ${bg}`.padEnd(30)} ${kind.padEnd(5)} ${where}`)
  }
}
console.log(failures ? `\n${failures} pair(s) below the WCAG AA minimum.` : '\nEvery pair meets WCAG AA.')
process.exit(failures ? 1 : 0)
