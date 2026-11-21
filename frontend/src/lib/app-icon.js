// The home-screen icon of the phone app (Settings → Look & Home → App icon). The phone itself keeps
// the choice: iOS its alternate icon, Android which launcher alias is on (AppIconPlugin.swift /
// AppIconPlugin.java). Nothing goes into the synced state, so two phones can wear different icons.
// A browser has no icon to change: there this answers null and the row stays away, unless the
// deployment ships icons of its own (lib/brand-icons.js), which the same row then offers.
import { MOBILE } from './mobile.js'
import { platformNow } from './platform-now.js'
import { APP_ICON_IDS } from './app-icon-variants.js'
import { brandIcons, brandIconNow, setBrandIcon } from './brand-icons.js'

// Kept inside an object: a Capacitor plugin proxy answers `then` with a native call that never
// settles, so a promise resolved with the bare proxy would hang (the Coach hang, #42).
let pluginP = null
const iconPlugin = () => pluginP || (pluginP = (async () => {
  if (!MOBILE || !platformNow()) return null
  const { registerPlugin } = await import('@capacitor/core')
  return { p: registerPlugin('AppIcon') }
})().catch(() => null))

/** { name } of the icon on the home screen now (or the one about to be), or null without the option. */
export async function appIconState() {
  // A deployment's own icons, in a browser (lib/brand-icons.js): `icons` is then the list to offer.
  if (!MOBILE) {
    const icons = brandIcons()
    return icons ? { name: brandIconNow() || icons[0].id, icons: true } : null
  }
  try {
    const w = await iconPlugin()
    if (!w) return null
    const r = await w.p.getIcon()
    if (!r || !r.supported) return null
    return { name: APP_ICON_IDS.includes(r.name) ? r.name : 'default' }
  } catch {
    return null
  }
}

/**
 * Switches the icon. Resolves { name, later }: `later` on Android, where the launcher only takes
 * the new icon once the app is in the background. Throws when the phone refused.
 */
export async function setAppIcon(name) {
  if (!MOBILE && brandIcons()) return { name: setBrandIcon(name), later: false }
  if (!APP_ICON_IDS.includes(name)) throw new Error('unknown icon')
  const w = await iconPlugin()
  if (!w) throw new Error('no app icon plugin')
  const r = await w.p.setIcon({ name })
  return { name: r?.name || name, later: !!r?.later }
}

export function _resetAppIconForTests() { pluginP = null }
