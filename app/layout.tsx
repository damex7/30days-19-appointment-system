// ROOT LAYOUT: only what every page needs: <html>/<body>, fonts, the
// no-flash theme script and the skip link. Headers live one level down, in
// each route group's layout.

import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Work_Sans } from 'next/font/google'
import { site } from '@/lib/site'
import { themeScript } from '@/lib/theme'
import './globals.css'

// next/font downloads the fonts at build time and serves them from this
// site: no request to Google from the visitor's browser and no layout jump.
//
// GLYPH CHECK: each candidate font's character map was parsed for ₦
// (U+20A6), Ì, à, é, ọ, ẹ, ṣ and the combining grave and dot below, and its
// GSUB table for `tnum` (tabular figures). Cormorant Garamond and Work Sans
// have all of them. Fraunces, Playfair Display, Figtree, Outfit and DM Sans
// were ruled out (no ₦ or no ọ/ẹ/ṣ); Mulish and Lexend have no `tnum`.
// The "vietnamese" subset holds ọ, ẹ and the combining marks.
const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-cormorant',
})
const workSans = Work_Sans({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-work-sans',
})

export const metadata: Metadata = {
  title: {
    default: `${site.name}: ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f1e9' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1120' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // The <head> script sets data-theme before React loads, so the server's
      // <html> and the browser's may differ ON PURPOSE. This silences that
      // one expected warning, for this element's attributes only.
      suppressHydrationWarning
      className={`${cormorant.variable} ${workSans.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh text-base leading-relaxed antialiased">
        {/* SKIP LINK: the first Tab stop on every page. */}
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-brand px-4 py-2 font-semibold text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
