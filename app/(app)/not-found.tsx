import { NotFoundContent } from '@/components/site/not-found-content'

/**
 * notFound() inside the app (an unknown product id, say). The (app) layout
 * already draws the header and footer, so this is only the message.
 */
export default function AppNotFound() {
  return <NotFoundContent />
}
