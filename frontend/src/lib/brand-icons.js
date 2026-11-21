// A deployment's own home-screen icons, in a browser (BlackGym: vercel/branding/).
//
// openGym's web app has no icon to change, and lib/app-icon.js says so. A deployment that ships
// icons of its own loads a small script before the app (vercel/branding/boot.js), which keeps the
// choice in this browser, points the page's icon links at it and leaves this object behind:
//
//   window.__BLACKGYM_BRAND__ = { icons: [{ id, name: { en, ru, … } }], hint: { en, … } | null,
//                                 current(): id, set(id): id }
//
// Without that script there is nothing here and every caller behaves as it always has.
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
