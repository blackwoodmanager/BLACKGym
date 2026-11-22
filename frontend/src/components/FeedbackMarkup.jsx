import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUI } from '../store/useUI.js'
import { useLang } from '../lib/i18n.js'
import { FEEDBACK_IGNORE, feedbackCopy, isHuge, markFrom, targetAt } from '../lib/feedback.js'
import { MARKUP_EVENT, MAX_MARKS, addMark, getDraft, removeMark, useDraft } from '../lib/feedback-draft.js'
import { openFeedback } from './FeedbackSheet.jsx'
import Icon from './Icon.jsx'

// Marking places on the screen, the way the admin panel does it: the bug sheet sends you here, a
// tap on anything outlines it and asks what is wrong with it, and "Done" takes you back to the
// sheet with the places listed. "Scroll" hands the page back (to scroll, or to open another
// screen and mark that); "Mark" takes it again. A place carries the words on the element, a path
// to it, its area and the screen, so whoever fixes it can find the component, not guess.
//
// Everything this layer draws carries data-fb-ignore, so a tap never lands on the layer itself.
const ig = { [FEEDBACK_IGNORE]: '' }

export default function FeedbackMarkupLayer({ path }) {
  useLang()
  const c = feedbackCopy()
  const draft = useDraft()
  const [active, setActive] = useState(false)
  const [picking, setPicking] = useState(true)
  const [hover, setHover] = useState(null)
  const [pending, setPending] = useState(null)
  const [empty, setEmpty] = useState(false)
  const noteRef = useRef(null)
  const startCount = useRef(0)

  useEffect(() => {
    const on = () => { startCount.current = getDraft().marks.length; setActive(true); setPicking(true); setPending(null); setHover(null) }
    window.addEventListener(MARKUP_EVENT, on)
    return () => window.removeEventListener(MARKUP_EVENT, on)
  }, [])

  useEffect(() => {
    if (!pending) return
    noteRef.current?.focus()
    const id = requestAnimationFrame(() => { if (document.activeElement !== noteRef.current) noteRef.current?.focus() })
    return () => cancelAnimationFrame(id)
  }, [pending])

  useEffect(() => {
    if (!active) return
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); if (pending) setPending(null); else setPicking(p => !p) } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [active, pending])

  if (!active) return null

  const leave = (keep) => {
    // Cancel takes back the places added in this visit; Done keeps them.
    if (!keep) for (let n = getDraft().marks.length; n > startCount.current; n--) removeMark(n)
    setActive(false); setPending(null); setHover(null)
    openFeedback(path)
  }
  const move = e => {
    if (pending || e.pointerType !== 'mouse') return
    const el = targetAt(e.clientX, e.clientY)
    const box = el?.getBoundingClientRect()
    setHover(box && !isHuge(box) ? { left: box.left, top: box.top, width: box.width, height: box.height } : null)
  }
  const place = e => {
    // A tap on the frozen page must not take focus from the note, or typing and dictation go nowhere.
    e.preventDefault()
    if (pending) { noteRef.current?.focus(); return }
    if (getDraft().marks.length >= MAX_MARKS) { useUI.getState().toast(c.markFull); return }
    const el = targetAt(e.clientX, e.clientY)
    const box = el?.getBoundingClientRect()
    setHover(null); setEmpty(false)
    setPending({ el, x: e.clientX, y: e.clientY, rect: box && !isHuge(box) ? { left: box.left, top: box.top, width: box.width, height: box.height } : null })
  }
  const confirm = e => {
    e?.preventDefault()
    const note = noteRef.current?.value.trim() ?? ''
    if (!note) { setEmpty(true); noteRef.current?.focus(); return }
    addMark(markFrom(pending.el, { x: pending.x, y: pending.y, route: path, note }))
    setPending(null)
  }

  const W = typeof window !== 'undefined' ? window.innerWidth : 360
  const H = typeof window !== 'undefined' ? window.innerHeight : 640
  const boxW = Math.min(320, W - 16)
  const left = pending ? Math.min(Math.max(8, pending.x - boxW / 2), W - boxW - 8) : 0
  // Above the tap when it is in the lower part of the screen, where a phone's keyboard would cover the box.
  const above = pending ? pending.y > H * 0.45 : false

  return createPortal(<div {...ig}>
    {draft.marks.filter(m => m.route === path).map(m =>
      <span key={m.n} className="fbm-pin" style={{ left: m.docX, top: m.docY }} aria-hidden="true">{m.n}</span>)}
    {pending && <span className="fbm-pin" style={{ left: pending.x + window.scrollX, top: pending.y + window.scrollY }} aria-hidden="true">{draft.marks.length + 1}</span>}

    <div {...ig} className="fbm-bar" role="toolbar" aria-label={c.mark}>
      <span className="fbm-hint">{picking ? c.markOn : c.markScroll}</span>
      <button type="button" className={'fbm-btn' + (picking ? ' on' : '')} onClick={() => { setPicking(p => !p); setPending(null) }} aria-pressed={picking}>{picking ? c.markPick : c.markScroll}</button>
      <button type="button" className="fbm-btn go" onClick={() => leave(true)}><Icon name="check" />{c.markDone}{draft.marks.length > 0 && <span className="fbm-n">{draft.marks.length}</span>}</button>
      <button type="button" className="fbm-btn" onClick={() => leave(false)} aria-label={c.markStop}><Icon name="xmark" /></button>
    </div>

    {picking && <div {...ig} className="fbm-catch" onPointerMove={move} onPointerDown={place} onPointerLeave={() => setHover(null)}>
      {hover && <span className="fbm-box" style={{ left: hover.left - 3, top: hover.top - 3, width: hover.width + 6, height: hover.height + 6 }} />}
      {pending?.rect && <span className="fbm-box" style={{ left: pending.rect.left - 3, top: pending.rect.top - 3, width: pending.rect.width + 6, height: pending.rect.height + 6 }} />}
    </div>}

    {pending && <form {...ig} className="fbm-note" style={{ left, width: boxW, ...(above ? { bottom: H - pending.y + 22 } : { top: pending.y + 22 }) }}
      onPointerDown={e => e.stopPropagation()} onSubmit={confirm}>
      <textarea ref={noteRef} className="input" rows={3} maxLength={500} placeholder={c.markNote} aria-label={c.markNote}
        aria-invalid={empty || undefined} onChange={() => empty && setEmpty(false)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirm(e) }} />
      <div className="fbm-note-b">
        <button type="button" className="fbm-btn" onClick={() => setPending(null)}>{c.markStop}</button>
        <button type="submit" className="fbm-btn go"><Icon name="check" />{c.markAdd}</button>
      </div>
    </form>}
  </div>, document.body)
}
