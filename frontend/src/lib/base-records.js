// Records of the base lifts (BlackGym, the desktop Records screen): for each exercise the owner
// calls a base lift, the two bests that say the most about it, and the ladder between them.
//
//   weight   the heaviest set ever: the most weight, and at that weight the most reps
//            ("100 kg for 5"). On an assistance machine the least help, as everywhere else.
//   volume   the biggest single set, weight x reps ("70 kg for 30 = 2,100 kg"). Two sets of the
//            same size: the heavier one holds the record.
//   ladder   the best set at every weight ever used, heaviest first, so the two records are seen
//            among the sets around them.
//
// A lift done with body weight alone has no weight to rank by: its records are the most reps in a
// set and the most reps in one workout.
//
// What counts is what counts everywhere: ticked work sets, warm-ups left out, each side of a
// per-side set on its own (history.js metricRowsForEntry, the reader the set trophies use).
// Nothing here writes to the state except setBaseExercises, and nothing is stored but the list.
//
//   S.baseEx = ['0025', '8375', …]   the owner's own list, in the order shown. No key: the
//                                    defaults below. A plain setting to the sync (newest wins).
import { EXIDX, isAssisted } from './exercises.js'
import { metricRowsForEntry, workoutDay, workoutAt } from './history.js'
import { isSideSet } from './workout-model.js'

// Shown to everyone, logged or not: bench press, squat, deadlift, pull-up.
export const CLASSIC_BASE = ['0025', '0043', '0032', '0652']
// A logged exercise is offered as a base lift when its catalogue name says it is one of the big
// movements. A guess to start from: the owner's own list replaces it.
const BASE_NAME = /\b(bench press|overhead press|shoulder press|military press|leg press|squat|deadlift|pull[- ]?ups?|chin[- ]?ups?|rows?|pull ?downs?|dips?)\b/i

const num = v => Number(v) || 0
const sidesOf = s => (isSideSet(s) ? [s.sides.L, s.sides.R] : [s])

// The same words in a small movement's name: a straight-arm pulldown and a pullover are one joint,
// a calf raise on the leg press is not a leg press, a supported squat is a mobility drill.
const NOT_BASE = /\b(straight[- ]arm|pull[- ]?over|calf|calves|supported|assisted|stretch)\b/i

/** Whether the catalogue calls this a big compound movement (a press, a squat, a pull, a row). */
export function isBaseLike(exId) {
  const ex = EXIDX[exId]
  if (!ex) return false
  const name = String(ex.n || '')
  if (NOT_BASE.test(name)) return false
  return ex.mk === 'leg-press' || BASE_NAME.test(name)
}

// id -> { sessions, last } over the whole log, counting a workout once per exercise.
function usage(S) {
  const u = new Map()
  for (const w of Array.isArray(S?.workouts) ? S.workouts : []) {
    const d = workoutDay(w) || ''
    const seen = new Set()
    for (const en of w?.entries || []) {
      if (!en || en.id == null || seen.has(en.id)) continue
      if (!metricRowsForEntry(en).length) continue
      seen.add(en.id)
      const row = u.get(en.id) || { sessions: 0, last: '' }
      row.sessions++
      if (d > row.last) row.last = d
      u.set(en.id, row)
    }
  }
  return u
}

const byUse = u => (a, b) => (u.get(b).sessions - u.get(a).sessions) || (u.get(b).last < u.get(a).last ? -1 : u.get(b).last > u.get(a).last ? 1 : 0)

/** Whether the owner has picked the list themselves. */
export const hasOwnBase = S => Array.isArray(S?.baseEx)

/**
 * The base lifts, in the order shown: the owner's own list, or, until there is one, the logged
 * exercises that look like base lifts (most trained first) followed by the classics not logged yet.
 */
export function baseExerciseIds(S) {
  if (hasOwnBase(S)) return [...new Set(S.baseEx.filter(id => typeof id === 'string' && id))]
  const u = usage(S)
  const logged = [...u.keys()].filter(isBaseLike).sort(byUse(u))
  return [...logged, ...CLASSIC_BASE.filter(id => !logged.includes(id))]
}

/** Every exercise the chooser offers: the current list, everything logged (most trained first), the classics. */
export function baseCandidates(S) {
  const u = usage(S)
  return [...new Set([...baseExerciseIds(S), ...[...u.keys()].sort(byUse(u)), ...CLASSIC_BASE])]
}

/** Writes the owner's list into a state draft. */
export function setBaseExercises(s, ids) {
  s.baseEx = [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))]
}

/** Flips one exercise in the owner's list, starting from what is shown now. Returns whether it is on afterwards. */
export function toggleBaseExercise(s, id) {
  const cur = baseExerciseIds(s)
  const on = !cur.includes(id)
  setBaseExercises(s, on ? [...cur, id] : cur.filter(x => x !== id))
  return on
}

/**
 * The records of one exercise:
 *   { exId, any, sessions, last, bodyweight,
 *     weight:  { w, r, d } | null,       the heaviest set
 *     volume:  { w, r, v, d } | null,    the biggest set, v = w x r
 *     reps:    { r, d } | null,          the most reps in one set
 *     session: { reps, sets, d } | null, the most reps in one workout
 *     ladder:  [{ w, r, v, d, weight, volume }] }   heaviest first; the flags mark the two records
 * `any` is false for an exercise never logged, and everything else is then empty.
 */
export function exerciseRecords(S, exId) {
  const assisted = isAssisted(exId)
  const sets = []
  let sessions = 0, last = null, session = null, reps = null
  for (const w of Array.isArray(S?.workouts) ? S.workouts : []) {
    const d = workoutDay(w)
    const t = workoutAt(w)
    let n = 0, total = 0
    for (const en of w?.entries || []) {
      if (en?.id !== exId) continue
      for (const row of metricRowsForEntry(en, 'reps')) {
        for (const s of sidesOf(row)) {
          const r = Math.round(num(s?.r))
          if (s?.done !== true || r < 1) continue
          sets.push({ w: num(s.w), r, d, t })
          n++; total += r
          if (!reps || r > reps.r || (r === reps.r && t < reps.t)) reps = { r, d, t }
        }
      }
    }
    if (!n) continue
    sessions++
    if (d && (!last || d > last)) last = d
    if (!session || total > session.reps) session = { reps: total, sets: n, d }
  }
  const out = { exId, any: sets.length > 0, sessions, last, bodyweight: false, weight: null, volume: null, reps: reps && { r: reps.r, d: reps.d }, session, ladder: [] }
  if (!sets.length) return out
  const loaded = sets.filter(s => s.w > 0)
  if (!loaded.length) { out.bodyweight = true; return out }

  // The best set at each weight: the most reps, the earliest of equals.
  const rungs = new Map()
  for (const s of loaded) {
    const cur = rungs.get(s.w)
    if (!cur || s.r > cur.r || (s.r === cur.r && s.t < cur.t)) rungs.set(s.w, s)
  }
  const ladder = [...rungs.values()].sort((a, b) => (assisted ? a.w - b.w : b.w - a.w))
  const heaviest = ladder[0]
  let biggest = null
  for (const s of ladder) {
    const v = s.w * s.r
    const bv = biggest ? biggest.w * biggest.r : -1
    // Equal sizes: the heavier set (on an assistance machine, the one with less help).
    if (v > bv + 1e-9 || (Math.abs(v - bv) <= 1e-9 && (assisted ? s.w < biggest.w : s.w > biggest.w))) biggest = s
  }
  out.weight = { w: heaviest.w, r: heaviest.r, d: heaviest.d }
  out.volume = { w: biggest.w, r: biggest.r, v: biggest.w * biggest.r, d: biggest.d }
  out.ladder = ladder.map(s => ({ w: s.w, r: s.r, v: s.w * s.r, d: s.d, weight: s === heaviest, volume: s === biggest }))
  return out
}

/** The records of every base lift, in the list's order. */
export const baseRecords = S => baseExerciseIds(S).map(id => exerciseRecords(S, id))

/**
 * The latest workouts that set records (the ones each workout saved when it was finished, `prs`):
 * [{ id, d, name, ids }], newest first.
 */
export function recentRecordWorkouts(S, limit = 3) {
  const ws = (Array.isArray(S?.workouts) ? S.workouts : []).filter(w => Array.isArray(w?.prs) && w.prs.length)
  return ws
    .map((w, i) => ({ w, i, d: workoutDay(w) || '' }))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.i - a.i))
    .slice(0, Math.max(0, limit))
    .map(({ w, d }) => ({ id: w.id, d, name: w.name || '', ids: [...new Set(w.prs.filter(id => typeof id === 'string'))] }))
}
