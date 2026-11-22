// The "My fixes" list, kept for the whole app: the screen shows it, and the bug tab's dot and the
// sheet's badge count what in it waits for the owner. One copy, refreshed when asked: the screen
// every 30 seconds while it is open, the rest when the app comes back to the front.
import { useSyncExternalStore } from 'react'
import { listFeedback } from './feedback.js'

let state = { items: null, error: false, loading: false, at: 0 }
const subs = new Set()
const set = patch => { state = { ...state, ...patch }; subs.forEach(fn => fn()) }

export const getFixes = () => state
export const subscribeFixes = fn => { subs.add(fn); return () => subs.delete(fn) }
export const useFixes = () => useSyncExternalStore(subscribeFixes, getFixes)
export const _resetFixesForTests = () => { state = { items: null, error: false, loading: false, at: 0 }; subs.clear() }

let inflight = null
/** Fetches the list. Two asks at once share one call; a failure keeps the list that was there and says so. */
export function refreshFixes(get = listFeedback, now = Date.now) {
  if (inflight) return inflight
  set({ loading: true })
  inflight = get().then(items => { set({ items, error: false, loading: false, at: now() }) })
    .catch(() => { set({ error: true, loading: false }) })
    .finally(() => { inflight = null })
  return inflight
}
