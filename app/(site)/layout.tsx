// PUBLIC PAGES: the home page and the booking flow. Anyone can browse the
// menu and open times; the booking step itself asks for a session.
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-page flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
