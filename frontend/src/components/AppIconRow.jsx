import { useEffect, useState } from 'react'
import { t, getLang, useLang } from '../lib/i18n.js'
import { appIconState, setAppIcon } from '../lib/app-icon.js'
import { APP_ICON_VARIANTS, offeredIcons } from '../lib/app-icon-variants.js'
import { brandIcons, brandIconHint } from '../lib/brand.js'
import { seasonNow } from '../lib/season-clock.js'
import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'

/* Settings → Look & Home → App icon: the icon on this phone's home screen. The phone keeps the
   choice (lib/app-icon.js), so it is asked here and never synced. In a browser, or on a phone that
   cannot switch icons, the row is not there at all, unless the deployment ships icons of its own
   (lib/brand.js): then the row offers those, and the browser keeps the choice. */
export default function AppIconRow() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  useLang()                 // the deployment's own names follow the language as well
  const lang = getLang()
  useEffect(() => {
    let live = true
    appIconState().then(s => { if (live) setState(s) })
    return () => { live = false }
  }, [])
  if (!state) return null

  const pick = async id => {
    if (busy || id === state.name) return
    setBusy(true)
    try {
      const r = await setAppIcon(id)
      setState(s => ({ ...s, name: r.name }))
      if (r.later) useUI.getState().toast(t('New icon on its way. It shows up once you leave the app.'))
    } catch (e) {
      useUI.getState().toast(t('The icon could not be changed.'))
    } finally { setBusy(false) }
  }
  // The deployment's own icons in a browser (lib/brand.js), else the phone app's.
  const own = state.icons ? brandIcons(lang) : null
  const list = own || offeredIcons(seasonNow(), state.name).map(v => ({ id: v.id, name: t(v.name), src: `app-icons/${v.id}.png` }))
  const current = own ? own.find(v => v.id === state.name) || own[0]
    : { name: t((APP_ICON_VARIANTS.find(v => v.id === state.name) || APP_ICON_VARIANTS[0]).name) }
  const hint = (own && brandIconHint(lang)) || t('Just for this phone. Some home screens take a moment to catch up.')

  return <div className="lrow app-icon-row" style={{ flexWrap: 'wrap', rowGap: 12, paddingBottom: 14 }}>
    <span className="lrow-i" style={{ '--tint': 'var(--indigo)' }}><Icon name="grid" /></span>
    <span className="lrow-m">
      <span className="lrow-t">{t('App icon')}</span>
      <span className="lrow-s">{hint}</span>
    </span>
    <span className="lrow-v">{current.name}</span>
    <div className="app-icons" role="radiogroup" aria-label={t('App icon')}>
      {list.map(v => (
        <button key={v.id} type="button" role="radio" aria-checked={v.id === state.name} disabled={busy}
          className={'app-icon' + (v.id === state.name ? ' on' : '')} onClick={() => pick(v.id)} aria-label={v.name}>
          <img src={v.src} alt="" width="56" height="56" draggable="false" />
        </button>
      ))}
    </div>
  </div>
}
