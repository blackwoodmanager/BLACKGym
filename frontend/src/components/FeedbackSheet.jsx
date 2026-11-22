import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useLang } from '../lib/i18n.js'
import { closeThenNav } from '../lib/nav.js'
import { useSheetKeyboard } from '../lib/use-sheet-keyboard.js'
import { FEEDBACK_MAX, currentContext, feedbackCopy, feedbackReady, newRequestId, sendFeedback, attentionCount } from '../lib/feedback.js'
import { MAX_MARKS, getDraft, removeMark, resetDraft, setDraft, startMarkup, useDraft } from '../lib/feedback-draft.js'
import { refreshFixes, useFixes } from '../lib/feedback-fixes.js'
import Icon from './Icon.jsx'
import { Button, Segmented } from './ui.jsx'

// The bug button's sheet: what went wrong (or what to add), the places marked on the screen, and the
// way to "My fixes". The draft lives in lib/feedback-draft.js, so closing the sheet, going off to
// mark a place or a failed send never costs the text; a retry keeps its request id, so a second tap
// cannot queue the same request twice.
function FeedbackSheet({ route, close }) {
  useLang()
  const c = feedbackCopy()
  const draft = useDraft()
  const fixes = useFixes()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const taRef = useRef(null)
  const onFocus = useSheetKeyboard(taRef)
  const alive = useRef(true)
  // Set on every mount, not only cleared on unmount: React's dev double-mount runs the cleanup once before the real mount.
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { refreshFixes() }, [])

  const { kind, text, marks } = draft
  const ready = feedbackReady(text, marks)
  const waiting = attentionCount(fixes.items)

  const send = async () => {
    if (busy || !ready) return
    if (!getDraft().requestId) setDraft({ requestId: newRequestId() })
    setBusy(true); setError(null)
    try {
      const r = await sendFeedback({ kind, text, marks, requestId: getDraft().requestId, context: currentContext(route) })
      resetDraft()
      refreshFixes()
      // The sheet says it itself; a toast is only for a sheet closed while the request was out.
      if (alive.current) setDone(r)
      else useUI.getState().toast(r.duplicate ? c.again : c.sent)
    } catch (e) {
      if (alive.current) setError(e.kind || 'fail')
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const mark = () => { close(); setTimeout(startMarkup, 260) }
  const fixesRow = <button type="button" className="fb-row" onClick={() => closeThenNav(close, '/fixes')}>
    <Icon name="list" /><span className="grow">{c.myFixes}</span>
    {waiting > 0 && <span className="fb-badge" aria-label={String(waiting)}>{waiting}</span>}
    <Icon name="chevronRight" className="chev" />
  </button>

  if (done) return <>
    <h3>{c.title}</h3>
    <p className="fb-done" role="status">{done.duplicate ? c.again : c.sent}</p>
    {done.link && <a className="fb-link" href={done.link} target="_blank" rel="noopener noreferrer">{c.follow}</a>}
    <div style={{ height: 12 }} />
    {fixesRow}
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="check" onClick={close}>{c.close}</Button>
  </>

  return <>
    <h3>{c.title}</h3>
    <Segmented value={kind} onChange={k => setDraft({ kind: k })}
      options={[{ value: 'bug', icon: 'bug', label: c.bug }, { value: 'idea', icon: 'sparkles', label: c.idea }]} />
    <div style={{ height: 12 }} />
    <textarea ref={taRef} className="input" rows={marks.length ? 3 : 5} maxLength={FEEDBACK_MAX} value={text}
      placeholder={kind === 'bug' ? c.bugHint : c.ideaHint} aria-label={c.title}
      onFocus={onFocus} onChange={e => setDraft({ text: e.target.value })} />
    {marks.length > 0 && <ol className="fb-marks" aria-label={c.marks}>
      {marks.map(m => <li key={m.n}>
        <span className="fb-pin" aria-hidden="true">{m.n}</span>
        <span className="grow"><b>{m.note || c.markNote}</b>{m.what && <span className="fb-what"> {m.what}</span>}</span>
        <button type="button" className="fb-x" onClick={() => removeMark(m.n)} aria-label={c.remove}><Icon name="xmark" /></button>
      </li>)}
    </ol>}
    <div style={{ height: 10 }} />
    <button type="button" className="fb-row" onClick={mark} disabled={marks.length >= MAX_MARKS}>
      <Icon name="target" /><span className="grow">{c.mark}</span><Icon name="chevronRight" className="chev" />
    </button>
    {fixesRow}
    {error && <p className="fb-err" role="alert">{c[error] || c.fail}</p>}
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="check" onClick={send} disabled={busy || !ready}>{busy ? c.sending : c.send}</Button>
  </>
}

export const openFeedback = route =>
  useUI.getState().openSheet(close => <FeedbackSheet route={route} close={close} />)
