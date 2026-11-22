// BlackGym on a computer. Everything under desktop/ is BlackGym's own layer over openGym: a
// sidebar in place of the tab bar and a few wide screens (Overview, Records) for a
// window that has the room and a mouse. A phone, a tablet in the hand and the phone apps never
// see any of it: they keep openGym's screens exactly as they are.
import { useSyncExternalStore } from 'react'
import { MOBILE } from '../lib/mobile.js'

// Wide enough for the sidebar and two columns, and driven by a pointer that hovers: a tablet in
// landscape is wide too, but its charts cannot be hovered and its rows want a finger.
export const DESKTOP_QUERY = '(min-width: 1100px) and (hover: hover) and (pointer: fine)'

const query = () => {
  if (MOBILE || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  try { return window.matchMedia(DESKTOP_QUERY) } catch { return null }
}

const subscribe = fn => {
  const mql = query()
  if (!mql) return () => {}
  // Safari before 14 only has the older pair.
  if (mql.addEventListener) { mql.addEventListener('change', fn); return () => mql.removeEventListener('change', fn) }
  mql.addListener?.(fn)
  return () => mql.removeListener?.(fn)
}

/** Whether this window gets the desktop layout right now. */
export const isDesktop = () => query()?.matches === true

/** The same, kept up to date as the window is resized. */
export const useDesktop = () => useSyncExternalStore(subscribe, isDesktop, () => false)

// The sidebar folded down to its icons, remembered on this computer only.
const MINI_KEY = 'bg_desk_mini'
export const readMini = () => { try { return localStorage.getItem(MINI_KEY) === '1' } catch { return false } }
export const writeMini = on => { try { localStorage.setItem(MINI_KEY, on ? '1' : '0') } catch { /* private window: it just is not remembered */ } }
