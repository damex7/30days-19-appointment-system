// The five service categories, matching the CHECK on services.category
// (db/migrations/008). Plain data: the home page, the booking flow and the
// admin form all use it, on the server and in the browser.

export const CATEGORIES = ['braids', 'barbing', 'nails', 'makeup', 'hair_care'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  braids: 'Braids',
  barbing: 'Barbing',
  nails: 'Nails',
  makeup: 'Makeup',
  hair_care: 'Hair care',
}

/** A line under each heading on the home page. */
export const CATEGORY_BLURBS: Record<Category, string> = {
  braids: 'Knotless, cornrows and twists, neat and long-lasting.',
  barbing: 'Clean cuts, fades and beard shaping.',
  nails: 'Gel, acrylic and simple manicures and pedicures.',
  makeup: 'From soft glam to full bridal looks.',
  hair_care: 'Washing, treatments and silk press for natural hair.',
}
