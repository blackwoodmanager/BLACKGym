import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useLang } from '../lib/i18n.js'
import { useSheetKeyboard } from '../lib/use-sheet-keyboard.js'
import { FEEDBACK_MAX, currentContext, feedbackCopy, feedbackReady, newRequestId, sendFeedback } from '../lib/feedback.js'
import Icon from './Icon.jsx'
import { Button, Segmented } from './ui.jsx'

// The bug button: a small tab on the screen's edge (App.jsx shows it to the one person the server
// calls `feedback: true`, lib/feedback.js). A tap opens a sheet; what is typed there goes to the
// orchestrator as a task. The draft outlives the sheet, so a closed sheet or a failed send never
// costs the text, and a retry keeps its request id, so it cannot queue the same request twice.
let draft = { kind: 'bug', text: '', requestId: null }

function FeedbackSheet({ route, close }) {
  const c = feedbackCopy()
  const [kind, setKind] = useState(draft.kind)
  const [text, setText] = useState(draft.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const taRef = useRef(null)
  const onFocus = useSheetKeyboard(taRef)
  const alive = useRef(true)
  // Set on every mount, not only cleared on unmount: React's dev double-mount runs the cleanup once before the real mount.
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const edit = (k, v) => { draft = { ...draft, kind: k, text: v } }
  const send = async () => {
    if (busy || !feedbackReady(text)) return
    if (!draft.requestId) draft = { ...draft, requestId: newRequestId() }
    setBusy(true); setError(null)
    try {
      const r = await sendFeedback({ kind, text, requestId: draft.requestId, context: currentContext(route) })
      draft = { kind, text: '', requestId: null }
      // The sheet says it itself; a toast is only for a sheet closed while the request was out.
      if (alive.current) { setDone(r); setText('') }
      else useUI.getState().toast(r.duplicate ? c.again : c.sent)
    } catch (e) {
      if (alive.current) setError(e.kind || 'fail')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  if (done) return <>
    <h3>{c.title}</h3>
    <p className="fb-done" role="status">{done.duplicate ? c.again : c.sent}</p>
    {done.link && <a className="fb-link" href={done.link} target="_blank" rel="noopener noreferrer">{c.follow}</a>}
    <div style={{ height: 16 }} />
    <Button variant="primary" icon="check" onClick={close}>{c.close}</Button>
  </>

  return <>
    <h3>{c.title}</h3>
    <Segmented value={kind} onChange={k => { setKind(k); edit(k, text) }}
      options={[{ value: 'bug', icon: 'bug', label: c.bug }, { value: 'idea', icon: 'sparkles', label: c.idea }]} />
    <div style={{ height: 12 }} />
    <textarea ref={taRef} className="input" rows={6} maxLength={FEEDBACK_MAX} value={text} autoFocus
      placeholder={kind === 'bug' ? c.bugHint : c.ideaHint} aria-label={c.title}
      onFocus={onFocus} onChange={e => { setText(e.target.value); edit(kind, e.target.value) }} />
    {error && <p className="fb-err" role="alert">{c[error] || c.fail}</p>}
    <div style={{ height: 16 }} />
    <Button variant="primary" icon="check" onClick={send} disabled={busy || !feedbackReady(text)}>{busy ? c.sending : c.send}</Button>
  </>
}

export const openFeedback = route =>
  useUI.getState().openSheet(close => <FeedbackSheet route={route} close={close} />)

export default function FeedbackBug({ path }) {
  useLang()
  const label = feedbackCopy().open
  return <button type="button" id="fbbug" aria-label={label} title={label} onClick={() => openFeedback(path)}>
    <Icon name="bug" />
  </button>
}
