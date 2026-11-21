// A deployment's own name, logo and home-screen icons, in a browser (BlackGym: vercel/branding/).
//
// openGym's web app has no icon to change, and lib/app-icon.js says so. A deployment that ships
// icons of its own loads a small script before the app (vercel/branding/boot.js), which keeps the
// choice in this browser, points the page's icon links at it and leaves this object behind:
//
//   window.__BLACKGYM_BRAND__ = { name, wordmark: [[text, colour | null], …] | null,
//                                 tagline: { en, … } | null, defaults: { theme, accent } | null,
//                                 icons: [{ id, name: { en, ru, … } }], hint: { en, … } | null,
//                                 current(): id, set(id): id }
//
// Without that script there is nothing here and every caller behaves as it always has: openGym's
// own logo, its own line under it, its own defaults.
const brand = () => {
  try {
    const b = typeof window !== 'undefined' ? window.__BLACKGYM_BRAND__ : null
    return b && Array.isArray(b.icons) && b.icons.length && typeof b.current === 'function' && typeof b.set === 'function' ? b : null
  } catch { return null }
}

/** Whether this build carries icons of its own to choose from. */
export const hasBrandIcons = () => !!brand()

// The names and the hint come with the icons, in the languages their owner wrote them in: they
// are the deployment's words, not openGym's, so they do not go through t().
const said = (texts, lang) => {
  if (!texts || typeof texts !== 'object') return typeof texts === 'string' ? texts : ''
  const l = String(lang || '').toLowerCase()
  return texts[l] || texts[l.split('-')[0]] || texts.en || Object.values(texts)[0] || ''
}

/** The icons as the picker shows them: [{ id, name, src }], or null without any. */
export function brandIcons(lang) {
  const b = brand()
  if (!b) return null
  return b.icons.filter(i => i && typeof i.id === 'string' && /^[a-z0-9-]{1,32}$/.test(i.id))
    .map(i => ({ id: i.id, name: said(i.name, lang) || i.id, src: `brand/${i.id}-180.png` }))
}

/** What to say under the row's title, or '' to keep openGym's own line. */
export const brandIconHint = lang => said(brand()?.hint, lang)

/** The icon this browser wears, or null without any. */
export function brandIconNow() {
  const b = brand()
  if (!b) return null
  try { return b.current() } catch { return null }
}

/** Wears `id` from now on. Throws on an icon this build does not have. */
export function setBrandIcon(id) {
  const b = brand()
  if (!b || !b.icons.some(i => i.id === id)) throw new Error('unknown icon')
  return b.set(id)
}

/** The deployment's logo where openGym shows its own: { name, parts: [[text, colour | null]], src }, or null. */
export function brandLockup() {
  const b = brand()
  if (!b || typeof b.name !== 'string' || !b.name) return null
  const parts = Array.isArray(b.wordmark) ? b.wordmark.filter(p => Array.isArray(p) && typeof p[0] === 'string' && p[0])
    .map(p => [p[0], typeof p[1] === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(p[1]) ? p[1] : null]) : []
  const id = brandIconNow()
  return { name: b.name, parts: parts.length ? parts : [[b.name, null]], src: id && /^[a-z0-9-]{1,32}$/.test(id) ? `brand/${id}-180.png` : null }
}

/** The line under the logo on the sign-in screen, or '' to keep openGym's. */
export const brandTagline = lang => said(brand()?.tagline, lang)

/**
 * What a profile started on this device begins with, where the deployment says: 'theme' (one the
 * app has) and 'accent' (a colour of the deployment's own, '#rrggbb'). Anything else is null.
 */
export function brandDefault(key) {
  const d = brand()?.defaults
  if (!d || typeof d !== 'object') return null
  if (key === 'theme') return ['dark', 'light', 'system'].includes(d.theme) ? d.theme : null
  if (key === 'accent') return typeof d.accent === 'string' && /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent.toLowerCase() : null
  return null
}
