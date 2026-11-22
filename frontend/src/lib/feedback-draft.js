// The bug button's draft: what is typed and the places marked, kept between the sheet and the
// marking layer (they are separate screens). It outlives both, so closing the sheet, or going off
// to mark a place, never costs the text; it is cleared only when a request has gone.
import { useSyncExternalStore } from 'react'

export const MAX_MARKS = 10
const fresh = () => ({ kind: 'bug', text: '', marks: [], requestId: null })
let draft = fresh()
const subs = new Set()
const emit = () => subs.forEach(fn => fn())

export const getDraft = () => draft
export const subscribeDraft = fn => { subs.add(fn); return () => subs.delete(fn) }
export const useDraft = () => useSyncExternalStore(subscribeDraft, getDraft)

export function setDraft(patch) { draft = { ...draft, ...patch }; emit() }
export function resetDraft() { draft = fresh(); emit() }

/** Adds a place, numbered after the last one; false when the request is full. */
export function addMark(mark) {
  if (draft.marks.length >= MAX_MARKS) return false
  draft = { ...draft, marks: [...draft.marks, { ...mark, n: draft.marks.length + 1 }] }
  emit()
  return true
}

/** Takes a place out; the ones after it move up, so the numbers on screen and in the request stay 1, 2, 3. */
export function removeMark(n) {
  draft = { ...draft, marks: draft.marks.filter(m => m.n !== n).map((m, i) => ({ ...m, n: i + 1 })) }
  emit()
}

// The sheet starts the marking layer by an event: the layer is mounted for good (App.jsx) and the sheet is not.
export const MARKUP_EVENT = 'bg:markup-start'
export const startMarkup = () => window.dispatchEvent(new Event(MARKUP_EVENT))
