// @vitest-environment happy-dom
// Settings → Look & Home → App icon in a browser, for a deployment that ships icons of its own
// (lib/brand.js, BlackGym's vercel/branding/): the row is there, offers those icons under the
// names their owner gave them, and the browser keeps the choice. Without such icons a browser has
// no row, as before.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const m = vi.hoisted(() => ({ toast: null }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: m.toast }) } }))

import AppIconRow from './AppIconRow.jsx'
import { appIconState, setAppIcon } from '../lib/app-icon.js'
import { hasBrandIcons, brandIcons, brandIconHint, brandLockup, brandTagline, brandDefault } from '../lib/brand.js'
import BrandLogo, { BrandMark } from './BrandLogo.jsx'
import { setLang } from '../lib/i18n.js'

// What vercel/branding/boot.js leaves on the page.
function brandOnPage() {
  let now = 'kettlebell'
  const calls = []
  window.__BLACKGYM_BRAND__ = {
    name: 'BlackGym', wordmark: [['BLACK', null], ['GYM', '#DC141C']], defaults: { theme: 'system' },
    tagline: { ru: 'Твои тренировки.' },
    icons: [
      { id: 'kettlebell', name: { en: 'Kettlebell', ru: 'Гиря' } },
      { id: 'logo', name: { en: 'Logo', ru: 'Логотип' } },
    ],
    hint: { en: 'Also shown while the app loads.', ru: 'Она же показывается при загрузке.' },
    current: () => now,
    set: id => { calls.push(id); now = id; return id },
  }
  return calls
}

let host, root
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<AppIconRow />) })
  await flush()
}
beforeEach(() => { m.toast = vi.fn() })
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  host?.remove(); root = null; host = null
  delete window.__BLACKGYM_BRAND__
  await act(async () => { await setLang('en') })
})

describe('the app icon row in a browser', () => {
  it('is not there without icons of the deployment\'s own', async () => {
    expect(hasBrandIcons()).toBe(false)
    expect(await appIconState()).toBe(null)
    await mount()
    expect(host.querySelector('.app-icon-row')).toBe(null)
  })

  it('offers the deployment\'s icons, the one in use ringed, and keeps a new choice', async () => {
    const calls = brandOnPage()
    expect(hasBrandIcons()).toBe(true)
    await mount()
    const buttons = [...host.querySelectorAll('.app-icon')]
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Kettlebell', 'Logo'])
    expect(buttons.map(b => b.querySelector('img').getAttribute('src'))).toEqual(['brand/kettlebell-180.png', 'brand/logo-180.png'])
    expect(buttons.map(b => b.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(host.querySelector('.lrow-v').textContent).toBe('Kettlebell')
    expect(host.querySelector('.lrow-s').textContent).toBe('Also shown while the app loads.')
    await act(async () => { buttons[1].click() })
    await flush()
    expect(calls).toEqual(['logo'])
    expect([...host.querySelectorAll('.app-icon')].map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    expect(host.querySelector('.lrow-v').textContent).toBe('Logo')
    expect(m.toast).not.toHaveBeenCalled()
  })

  it('says the names and the hint in the language of the app, in English where the owner wrote none', async () => {
    brandOnPage()
    expect(brandIcons('ru').map(i => i.name)).toEqual(['Гиря', 'Логотип'])
    expect(brandIcons('ru-RU').map(i => i.name)).toEqual(['Гиря', 'Логотип'])
    expect(brandIcons('de').map(i => i.name)).toEqual(['Kettlebell', 'Logo'])
    expect(brandIconHint('ru')).toBe('Она же показывается при загрузке.')
    await act(async () => { await setLang('ru') })
    await mount()
    expect([...host.querySelectorAll('.app-icon')].map(b => b.getAttribute('aria-label'))).toEqual(['Гиря', 'Логотип'])
  })

  it('refuses an icon the deployment does not have', async () => {
    brandOnPage()
    await expect(setAppIcon('default')).rejects.toThrow('unknown icon')
  })

  it('shows the deployment\'s logo where openGym shows its own', async () => {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    await act(async () => { root.render(<><BrandLogo size={36} /><BrandMark height={28} /></>) })
    expect(host.querySelector('.brand-lockup').textContent).toBe('openGym')
    expect(host.querySelector('img')).toBe(null)
    brandOnPage()
    expect(brandLockup()).toEqual({ name: 'BlackGym', parts: [['BLACK', null], ['GYM', '#DC141C']], src: 'brand/kettlebell-180.png' })
    await act(async () => { root.render(<><BrandLogo size={40} /><BrandMark height={28} /></>) })
    const lockup = host.querySelector('.brand-lockup')
    expect(lockup.getAttribute('aria-label')).toBe('BlackGym')
    expect(lockup.textContent).toBe('BLACKGYM')
    expect([...host.querySelectorAll('img')].map(i => i.getAttribute('src'))).toEqual(['brand/kettlebell-180.png', 'brand/kettlebell-180.png'])
    expect(brandTagline('ru')).toBe('Твои тренировки.')
    expect(brandTagline('de')).toBe('Твои тренировки.')
  })
})
