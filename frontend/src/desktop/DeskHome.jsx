import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, useLang } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import { fmtDate, fmtNum, fmtVol, todayISO } from '../lib/format.js'
import { isOn } from '../lib/modules.js'
import { workoutsLeft } from '../lib/week-left.js'
import { weeklyMuscleSets, mostRoom, roundSets, TARGET_MAX } from '../lib/muscle-targets.js'
import { streakWeeks } from '../lib/history.js'
import { weeklyBuckets, weekChange, OVERVIEW_WEEKS } from '../lib/desk-overview.js'
import { WorkoutRow, workoutDetailSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Home from '../views/Home.jsx'
import { deskCopy, fill } from './copy.js'

// The Overview: Home on a computer. The week in numbers and charts on the left; on the right,
// openGym's own Home as it is on the phone (today's workout, the week strip, challenges, the
// weight card…), so nothing Home does is missing here and nothing is built twice.

const MUSCLE_ROWS = 6
// The bars share one scale: a muscle far past its range still fits, and the range stays readable.
const scaleOf = rows => Math.max(24, ...rows.map(r => Math.min(TARGET_MAX, Math.max(r.hi, r.sets))))

function Kpi({ label, value, sub }) {
  return <div className="tile dk-kpi"><div className="l">{label}</div><div className="v">{value}</div>{sub && <div className="dk-kpi-s">{sub}</div>}</div>
}

function VolumeCard({ S, buckets, c }) {
  const [pick, setPick] = useState(null)
  const sel = buckets[pick == null ? buckets.length - 1 : Math.min(pick, buckets.length - 1)]
  const top = Math.max(1, ...buckets.map(b => b.volume))
  const any = buckets.some(b => b.workouts > 0)
  return (
    <section className="card dk-card" aria-label={c.volumeByWeek}>
      <div className="dk-card-h">
        <h2>{c.volumeByWeek}</h2>
        <span className="dk-dim">{fill(c.volumeHint, buckets.length)}</span>
      </div>
      {any ? <>
        <div className="dk-readout" aria-live="polite">
          <span className="dk-big">{fmtVol(Math.round(sel.volume), S.unit)}</span>
          <span className="dk-dim">{fill(c.weekOf, fmtDate(sel.wk))} · {fill(c.workoutsN, sel.workouts)} · {fill(c.setsN, sel.sets)}</span>
        </div>
        <div className="dk-bars" onMouseLeave={() => setPick(null)}>
          {buckets.map((b, i) => (
            <button type="button" key={b.wk} className={'dk-bar' + (b === sel ? ' on' : '')}
              aria-label={fill(c.weekOf, fmtDate(b.wk)) + ': ' + fmtVol(Math.round(b.volume), S.unit) + ', ' + fill(c.workoutsN, b.workouts)}
              onMouseEnter={() => setPick(i)} onFocus={() => setPick(i)} onClick={() => setPick(i)}>
              <span style={{ height: Math.max(b.volume > 0 ? 2 : 0, Math.round(b.volume / top * 100)) + '%' }} />
            </button>
          ))}
        </div>
        <div className="dk-bars-x" aria-hidden="true">
          {buckets.map((b, i) => <span key={b.wk}>{i % 2 === (buckets.length - 1) % 2 ? fmtDate(b.wk) : ''}</span>)}
        </div>
      </> : <div className="muted small">{c.noTraining}</div>}
    </section>
  )
}

function MusclesCard({ S, c }) {
  const [all, setAll] = useState(false)
  const rows = useMemo(() => weeklyMuscleSets(S), [S])
  const trained = rows.filter(r => r.sets > 0)
  const sorted = [...rows].sort((a, b) => b.sets - a.sets)
  const shown = all ? sorted : sorted.slice(0, MUSCLE_ROWS)
  const max = scaleOf(rows)
  const room = trained.length ? mostRoom(rows) : null
  const words = { in: c.inRange, below: c.below, above: c.above }
  return (
    <section className="card dk-card" aria-label={c.musclesWeek}>
      <div className="dk-card-h">
        <h2>{c.musclesWeek}</h2>
        <span className="dk-legend">
          <span><i className="dk-lg-done" aria-hidden="true" />{c.done}</span>
          <span><i className="dk-lg-range" aria-hidden="true" />{c.range}</span>
        </span>
      </div>
      {trained.length ? <>
        <div className="dk-mus">
          {shown.map(r => (
            <div className="dk-mus-row" key={r.slug}>
              <span className="dk-mus-n">{t(r.name)}</span>
              <div className="dk-track" role="img" aria-label={t(r.name) + ': ' + fill(c.setsOf, fmtNum(r.sets), r.lo + '–' + r.hi) + ', ' + words[r.status]}>
                <span className="dk-band" style={{ insetInlineStart: (r.lo / max * 100) + '%', width: ((r.hi - r.lo) / max * 100) + '%' }} />
                <span className="dk-val" style={{ width: (Math.min(max, r.sets) / max * 100) + '%' }} />
              </div>
              <span className="dk-mus-v">{fill(c.setsOf, fmtNum(r.sets), r.lo + '–' + r.hi)}</span>
              <span className={'dk-st ' + r.status}><i aria-hidden="true" />{words[r.status]}</span>
            </div>
          ))}
        </div>
        {sorted.length > MUSCLE_ROWS && <Button size="sm" variant="ghost" trailingIcon={all ? 'chevronUp' : 'chevronDown'} aria-expanded={all}
          onClick={() => setAll(v => !v)}>{all ? c.fewerMuscles : c.allMuscles}</Button>}
        {room && <div className="dk-note">{fill(c.room, t(room.name), fmtNum(roundSets(room.lo - room.sets)))}</div>}
      </> : <div className="muted small">{c.noSetsYet}</div>}
    </section>
  )
}

export default function DeskHome() {
  useLang()
  const c = deskCopy()
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const today = todayISO()
  const buckets = useMemo(() => weeklyBuckets(S, { weeks: OVERVIEW_WEEKS, today }), [S, today])
  const cur = buckets[buckets.length - 1]
  const change = weekChange(buckets)
  const left = workoutsLeft(S, today)
  const recent = useMemo(() => [...(S.workouts || [])].reverse().slice(0, 5), [S.workouts])
  const dateLine = new Date(today + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
  const changeText = change === null ? c.noCompare : change === 0 ? c.sameAsLast : fill(c.vsLast, (change > 0 ? '+' : '') + fmtNum(change) + ' %')

  return (
    <div className="dk-page dk-home">
      <div className="dk-main">
        <div className="hdr"><div><h1>{t('Overview')}</h1><div className="sub capitalize">{dateLine}</div></div></div>
        <div className="dk-kpis">
          <Kpi label={c.weekWorkouts} value={left ? fill(c.ofPlan, left.done, left.of) : cur.workouts} />
          <Kpi label={c.weekVolume} value={fmtVol(Math.round(cur.volume), S.unit)} sub={changeText} />
          <Kpi label={c.weekSets} value={cur.sets} />
          {isOn(S, 'motivation') && <Kpi label={c.streak} value={streakWeeks(S, today)} />}
        </div>
        <VolumeCard S={S} buckets={buckets} c={c} />
        <MusclesCard S={S} c={c} />
        {recent.length > 0 && <section className="dk-card" aria-label={t('Recent workouts')}>
          <div className="dk-card-h">
            <h2>{t('Recent workouts')}</h2>
            <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {S.workouts.length}</Button>
          </div>
          <div className="list">{recent.map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
        </section>}
      </div>
      <aside className="dk-today" aria-label={c.todayCol}>
        <Home />
      </aside>
    </div>
  )
}
