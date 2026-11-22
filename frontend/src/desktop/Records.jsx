import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, useLang } from '../lib/i18n.js'
import { exerciseNameText, fmtDate, fmtNum, fmtVol } from '../lib/format.js'
import { EXIDX, allExercises, searchExercises } from '../lib/exercises.js'
import { baseRecords, baseExerciseIds, baseCandidates, toggleBaseExercise, recentRecordWorkouts } from '../lib/base-records.js'
import { exerciseHistorySheet } from '../sheets.jsx'
import { Button, Check, SearchField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { deskCopy, fill } from './copy.js'

// Records (BlackGym): the base lifts and their two bests, the heaviest set and the biggest set
// (lib/base-records.js), with the ladder of the best set at every weight in between. Which lifts
// are "base" is the owner's own list (S.baseEx), chosen in the sheet below.

const nameOf = id => (EXIDX[id] ? exerciseNameText(EXIDX[id]) : String(id))
const SEARCH_ROWS = 30

// The chooser: the lifts on the list, everything logged, the classics; a search reaches the rest
// of the library. Each tick is saved at once, so closing the sheet is all there is to do.
function BaseChooser({ close }) {
  const c = deskCopy()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [q, setQ] = useState('')
  const on = new Set(baseExerciseIds(S))
  // The list as it was when the sheet opened: a row stays where it is when it is unticked.
  const [offered] = useState(() => baseCandidates(S))
  const found = q.trim() ? searchExercises(allExercises(S), q).slice(0, SEARCH_ROWS).map(e => e.id) : offered
  return <>
    <h3>{c.baseTitle}</h3>
    <p className="muted small" style={{ marginBottom: 12 }}>{c.baseHint}</p>
    <SearchField value={q} onChange={setQ} onClear={() => setQ('')} placeholder={t('Search…')} aria-label={t('Search…')} />
    <div className="dk-choose">
      {found.length ? found.map(id => (
        <label className="dk-choose-row" key={id}>
          <Check checked={on.has(id)} label={nameOf(id)} onChange={() => update(s => { toggleBaseExercise(s, id) })} />
          <span>{nameOf(id)}</span>
        </label>
      )) : <div className="muted small">{t('No match')}</div>}
    </div>
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="check" onClick={close}>{t('Done')}</Button>
  </>
}

export const baseChooserSheet = () => useUI.getState().openSheet(close => <BaseChooser close={close} />)

function Best({ label, big, sub }) {
  return <span className="dk-best"><span className="dk-best-l">{label}</span><span className="dk-best-v">{big}</span><span className="dk-best-s">{sub}</span></span>
}

function RecordCard({ r, unit, on, onPick, c }) {
  const w = v => fmtNum(v) + ' ' + unit
  let body
  if (!r.any) body = <span className="dk-rec-empty"><b>{c.notYet}</b><span>{c.notYetHint}</span></span>
  else if (r.bodyweight) body = <span className="dk-bests">
    <Best label={c.repsRec} big={r.reps.r} sub={c.inOneSet + ' · ' + fmtDate(r.reps.d)} />
    <Best label={c.sessionRec} big={r.session.reps} sub={fill(c.repsInSets, r.session.sets) + ' · ' + fmtDate(r.session.d)} />
  </span>
  else {
    const same = r.weight.w === r.volume.w && r.weight.r === r.volume.r
    body = <span className="dk-bests">
      <Best label={c.weightRec} big={w(r.weight.w) + ' × ' + r.weight.r} sub={fmtDate(r.weight.d)} />
      <Best label={c.volumeRec} big={fmtVol(Math.round(r.volume.v), unit)}
        sub={same ? c.sameSet : w(r.volume.w) + ' × ' + r.volume.r + ' · ' + fmtDate(r.volume.d)} />
    </span>
  }
  return (
    <button type="button" className={'dk-rec' + (on ? ' on' : '') + (r.any ? '' : ' none')} aria-pressed={on} onClick={onPick}>
      <span className="dk-rec-h">
        <span className="dk-rec-n">{nameOf(r.exId)}</span>
        {r.last && <span className="dk-rec-s">{fill(c.lastTime, fmtDate(r.last))}</span>}
      </span>
      {body}
    </button>
  )
}

function Ladder({ r, unit, c }) {
  const top = Math.max(1, ...r.ladder.map(l => l.v))
  return (
    <section className="card dk-card" aria-label={fill(c.ladder, nameOf(r.exId))}>
      <div className="dk-card-h">
        <div><h2>{fill(c.ladder, nameOf(r.exId))}</h2><span className="dk-dim">{c.ladderHint}</span></div>
        {r.any && <Button size="sm" variant="ghost" icon="history" onClick={() => exerciseHistorySheet(r.exId)}>{c.history}</Button>}
      </div>
      {!r.any ? <div className="muted small">{c.notYetHint}</div>
        : r.bodyweight ? <div className="muted small">{c.bodyweightNote}</div>
        : <div className="dk-ladder">
          {r.ladder.map(l => {
            const tag = l.weight && l.volume ? c.bothRec : l.weight ? c.weightRec : l.volume ? c.volumeRec : ''
            return (
              <div className="dk-rung" key={l.w}>
                <span className="dk-rung-w">{fmtNum(l.w)} {unit}</span>
                <div className="dk-track flat" role="img" aria-label={fmtNum(l.w) + ' ' + unit + ' × ' + l.r + ' = ' + fmtVol(Math.round(l.v), unit)}>
                  <span className="dk-val full" style={{ width: (l.v / top * 100) + '%' }} />
                </div>
                <span className="dk-rung-r">× {l.r} <span className="dk-dim">= {fmtVol(Math.round(l.v), unit)}</span></span>
                <span className="dk-rung-t">{tag && <span className="dk-tag"><Icon name="trophy" />{tag}</span>}</span>
              </div>
            )
          })}
        </div>}
    </section>
  )
}

export default function Records() {
  useLang()
  const c = deskCopy()
  const S = useStore(s => s.S)
  const rows = useMemo(() => baseRecords(S), [S])
  const fresh = useMemo(() => recentRecordWorkouts(S, 3), [S])
  const [pick, setPick] = useState(null)
  const sel = rows.find(r => r.exId === pick) || rows.find(r => r.any) || rows[0] || null
  const unit = S.unit

  return (
    <div className="dk-page dk-records">
      <div className="hdr">
        <div><h1>{c.records}</h1><div className="sub">{c.recordsSub}</div></div>
        <Button size="sm" icon="slider" onClick={baseChooserSheet}>{c.pickBase}</Button>
      </div>
      <p className="dk-explain"><span>{c.explainWeight}</span><span>{c.explainVolume}</span></p>

      {rows.length ? <>
        <div className="dk-recs">
          {rows.map(r => <RecordCard key={r.exId} r={r} unit={unit} c={c} on={sel?.exId === r.exId} onPick={() => setPick(r.exId)} />)}
        </div>
        <div className="dk-cols">
          {sel && <Ladder r={sel} unit={unit} c={c} />}
          <section className="card dk-card dk-side" aria-label={c.newRecords}>
            <div className="dk-card-h"><h2>{c.newRecords}</h2></div>
            {fresh.length ? fresh.map(w => (
              <div className="dk-fresh" key={w.id}>
                <div className="dk-fresh-h"><b>{fmtDate(w.d)}{w.name ? ' · ' + w.name : ''}</b>
                  <span className="dk-dim">{w.ids.length === 1 ? c.recordIn : fill(c.recordsIn, w.ids.length)}</span></div>
                {w.ids.map(id => <button type="button" className="dk-fresh-row" key={id} onClick={() => exerciseHistorySheet(id)}>
                  <Icon name="trophy" /><span>{nameOf(id)}</span></button>)}
              </div>
            )) : <div className="muted small">{c.noNewRecords}</div>}
          </section>
        </div>
      </> : <EmptyState icon="trophy" text={c.emptyBase}>
        <Button variant="tinted" icon="slider" onClick={baseChooserSheet}>{c.pickBase}</Button>
      </EmptyState>}
    </div>
  )
}
