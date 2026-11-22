import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { useLang } from '../lib/i18n.js'
import { fmtAgo } from '../lib/format.js'
import { actFeedback, feedbackCopy, groupItems, stageLabel } from '../lib/feedback.js'
import { refreshFixes, useFixes } from '../lib/feedback-fixes.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// "My fixes": the requests made with the bug button, where each one stands, and the owner's part in
// them: an answer when the agent asks, a check when a fix is ready (accept it, or send it back with
// a reason). It asks the server every 30 seconds while it is open.
const POLL_MS = 30000
const short = title => { const i = title.indexOf(' — '); return i > 0 && i < 40 ? title.slice(i + 3) : title }
const toast = msg => useUI.getState().toast(msg)

function Card({ it, c }) {
  const needs = it.stage === 'waiting' || it.stage === 'review'
  const [open, setOpen] = useState(needs)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(null)   // 'rework' while the reason is written
  const [note, setNote] = useState('')
  const [reply, setReply] = useState('')

  const run = async (args, ok) => {
    if (busy) return
    setBusy(true)
    try {
      await actFeedback({ id: it.id, ...args })
      toast(ok); setMode(null); setNote(''); setReply('')
    } catch (e) {
      toast(e.kind === 'stage' ? c.changed : e.kind === 'busy' ? c.busy : e.kind === 'offline' ? c.offline : c.actFail)
    } finally {
      setBusy(false)
      refreshFixes()
    }
  }
  const cancel = () => confirmSheet({ title: c.cancelAsk, confirmText: c.cancelYes, cancelText: c.keep, danger: true, onConfirm: () => run({ action: 'cancel' }, c.cancelled) })

  return <div className={'fx-card st-' + it.stage + (needs ? ' needs' : '')} data-fix={it.id}>
    <button type="button" className="fx-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <span className="fx-kind" aria-hidden="true"><Icon name={it.kind === 'idea' ? 'sparkles' : 'bug'} /></span>
      <span className="grow"><span className="fx-title">{short(it.title) || it.title}</span>
        <span className="fx-sub"><span className={'fx-chip st-' + it.stage}>{stageLabel(c, it.stage)}</span>{it.createdAt ? ' · ' + fmtAgo(it.createdAt) : ''}</span></span>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} className="chev" />
    </button>
    {open && <div className="fx-body">
      {it.stage === 'running' && <div className="fx-bar" role="progressbar" aria-valuenow={it.progress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: it.progress + '%' }} /></div>}
      {it.summary && <p className="fx-sum"><b>{c.whatDone}: </b>{it.summary}</p>}

      {it.stage === 'waiting' && it.ask && <div className="fx-ask">
        <p>{it.ask}</p>
        <div className="fx-opts">
          {it.askOptions?.map(o => <Button key={o} variant="tinted" disabled={busy} onClick={() => run({ action: 'reply', choice: o }, c.answered)}>{o}</Button>)}
        </div>
        {it.askKind === 'question' && <div className="fx-reply">
          <textarea className="input" rows={2} maxLength={1000} placeholder={c.replyHint} aria-label={c.replyHint} value={reply} onChange={e => setReply(e.target.value)} />
          <Button variant="primary" disabled={busy || !reply.trim()} onClick={() => run({ action: 'reply', text: reply.trim() }, c.answered)}>{c.replySend}</Button>
        </div>}
      </div>}

      {it.stage === 'review' && <div className="fx-review">
        <p className="muted small">{c.checkHint}</p>
        {mode === 'rework' ? <>
          <textarea className="input" rows={3} maxLength={1000} autoFocus placeholder={c.reworkWhy} aria-label={c.reworkWhy} value={note} onChange={e => setNote(e.target.value)} />
          <div className="fx-opts">
            <Button variant="plain" disabled={busy} onClick={() => { setMode(null); setNote('') }}>{c.markStop}</Button>
            <Button variant="primary" disabled={busy || !note.trim()} onClick={() => run({ action: 'rework', note: note.trim() }, c.sentBack)}>{c.reworkSend}</Button>
          </div>
        </> : <div className="fx-opts">
          <Button variant="primary" icon="check" disabled={busy} onClick={() => run({ action: 'accept' }, c.accepted)}>{c.accept}</Button>
          <Button variant="tinted" icon="undo" disabled={busy} onClick={() => setMode('rework')}>{c.rework}</Button>
        </div>}
      </div>}

      {it.review?.state === 'rework' && it.stage !== 'closed' && it.review.note && <p className="fx-note"><b>{c.rework}: </b>{it.review.note}</p>}
      {it.marks.length > 0 && <ol className="fb-marks fx-marks" aria-label={c.placesOf}>
        {it.marks.map(m => <li key={m.n}><span className="fb-pin" aria-hidden="true">{m.n}</span>
          <span className="grow"><b>{m.note}</b>{m.what && <span className="fb-what"> {m.what}</span>}{m.route && <span className="fb-what"> {m.route}</span>}</span></li>)}
      </ol>}
      {it.links.length > 0 && <div className="fx-links">
        {it.links.map(l => <a key={l.url} className="fb-link" href={l.url} target="_blank" rel="noopener noreferrer">{l.title || l.url.replace(/^https:\/\//, '')}</a>)}
      </div>}
      <div className="fx-foot">
        {it.link && <a className="fb-link" href={it.link} target="_blank" rel="noopener noreferrer">{c.board}</a>}
        {['queued', 'running', 'waiting', 'paused'].includes(it.stage) && <button type="button" className="fx-cancel" disabled={busy} onClick={cancel}>{c.cancelReq}</button>}
      </div>
    </div>}
  </div>
}

export default function Fixes() {
  useLang()
  const nav = useNavigate()
  const c = feedbackCopy()
  const { items, error, loading } = useFixes()
  useEffect(() => {
    refreshFixes()
    const id = setInterval(() => { if (document.visibilityState === 'visible') refreshFixes() }, POLL_MS)
    return () => clearInterval(id)
  }, [])
  const groups = useMemo(() => groupItems(items), [items])
  const label = id => ({ attention: c.secAttention, progress: c.secProgress, closed: c.secClosed })[id]

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={c.back}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{c.myFixes}</h1></div>
      <button className={'iconbtn' + (loading ? ' spin' : '')} onClick={() => refreshFixes()} aria-label={c.refresh}><Icon name="reset" /></button>
    </div>
    {items === null && !error && <p className="muted" role="status">{c.fixesLoading}</p>}
    {error && <p className="fb-err" role="alert">{c.fixesFail}</p>}
    {items && items.length === 0 && <p className="muted">{c.fixesEmpty}</p>}
    {groups.map(g => <section key={g.id} className="fx-sec" aria-label={label(g.id)}>
      <h2 className="fx-h">{label(g.id)}<span className="fx-count">{g.items.length}</span></h2>
      {g.items.map(it => <Card key={it.id + ':' + it.stage} it={it} c={c} />)}
    </section>)}
  </div>
}
