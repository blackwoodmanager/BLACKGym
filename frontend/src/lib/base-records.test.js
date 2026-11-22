import { describe, it, expect } from 'vitest'
import {
  CLASSIC_BASE, isBaseLike, baseExerciseIds, baseCandidates, setBaseExercises, toggleBaseExercise,
  exerciseRecords, baseRecords, recentRecordWorkouts, hasOwnBase
} from './base-records.js'

const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const workout = (d, entries, extra = {}) => ({ id: 'w' + d + (extra.n || ''), d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:00:00'), name: 'Session', entries, ...extra })
const entry = (id, sets) => ({ id, sets })

// The owner's own leg press: two sessions, the heaviest set and the biggest set are different sets.
const LEG = '8375', BENCH = '0025', DIPS = '0251', CURL = '0031'
const S = {
  workouts: [
    workout('2026-11-07', [entry(LEG, [set(100, 20), set(150, 20), set(170, 18), set(200, 13), set(170, 12)])]),
    workout('2026-11-10', [entry(BENCH, [set(20, 20), set(40, 15), set(60, 12), set(70, 12), set(80, 8)]), entry(CURL, [set(25, 10)])]),
    workout('2026-11-17', [entry(LEG, [set(75, 21), set(150, 21), set(175, 18), set(200, 15), set(200, 15)])]),
    workout('2026-11-19', [entry(DIPS, [set(0, 16), set(0, 16), set(0, 20)])]),
    workout('2026-11-22', [entry(BENCH, [set(50, 12), set(50, 12)])], { prs: [CURL, DIPS] })
  ]
}

describe('exerciseRecords', () => {
  it('the weight record is the heaviest set, with the most reps done at that weight', () => {
    const r = exerciseRecords(S, LEG)
    expect(r.weight).toEqual({ w: 200, r: 15, d: '2026-11-17' })
    expect(r.sessions).toBe(2)
    expect(r.last).toBe('2026-11-17')
  })

  it('the volume record is the biggest single set, and of two equal ones the heavier', () => {
    // 175 x 18 and 150 x 21 are both 3,150; 200 x 15 is 3,000.
    expect(exerciseRecords(S, LEG).volume).toEqual({ w: 175, r: 18, v: 3150, d: '2026-11-17' })
    // A light weight for many reps can beat the heaviest set.
    expect(exerciseRecords(S, BENCH).volume).toEqual({ w: 70, r: 12, v: 840, d: '2026-11-10' })
    expect(exerciseRecords(S, BENCH).weight).toEqual({ w: 80, r: 8, d: '2026-11-10' })
  })

  it('the ladder holds the best set at each weight, heaviest first, and marks both records', () => {
    const l = exerciseRecords(S, LEG).ladder
    expect(l.map(x => [x.w, x.r])).toEqual([[200, 15], [175, 18], [170, 18], [150, 21], [100, 20], [75, 21]])
    expect(l.filter(x => x.weight).map(x => x.w)).toEqual([200])
    expect(l.filter(x => x.volume).map(x => x.w)).toEqual([175])
    expect(l[3]).toMatchObject({ w: 150, r: 21, v: 3150, d: '2026-11-17' })
  })

  it('one set can hold both records', () => {
    const one = { workouts: [workout('2026-11-19', [entry('0047', [set(40, 15), set(60, 13), set(70, 12), set(70, 10)])])] }
    const r = exerciseRecords(one, '0047')
    expect(r.weight).toEqual({ w: 70, r: 12, d: '2026-11-19' })
    expect(r.volume).toEqual({ w: 70, r: 12, v: 840, d: '2026-11-19' })
    expect(r.ladder[0]).toMatchObject({ weight: true, volume: true })
  })

  it('a lift done with body weight alone is ranked by reps: in a set and in a workout', () => {
    const r = exerciseRecords(S, DIPS)
    expect(r.bodyweight).toBe(true)
    expect(r.weight).toBeNull()
    expect(r.volume).toBeNull()
    expect(r.ladder).toEqual([])
    expect(r.reps).toEqual({ r: 20, d: '2026-11-19' })
    expect(r.session).toEqual({ reps: 52, sets: 3, d: '2026-11-19' })
  })

  it('an exercise never logged has no records', () => {
    const r = exerciseRecords(S, '0043')
    expect(r).toMatchObject({ any: false, sessions: 0, last: null, weight: null, volume: null, reps: null, session: null, ladder: [] })
  })

  it('leaves out warm-ups and sets that were not ticked', () => {
    const w = { workouts: [workout('2026-11-01', [entry(BENCH, [set(120, 5, { warmup: true }), { w: 110, r: 5, done: false }, set(60, 10)])])] }
    const r = exerciseRecords(w, BENCH)
    expect(r.weight).toEqual({ w: 60, r: 10, d: '2026-11-01' })
    expect(r.ladder).toHaveLength(1)
  })

  it('counts each side of a per-side set on its own', () => {
    const side = { sides: { L: { w: 20, r: 12, done: true }, R: { w: 20, r: 9, done: true } } }
    const r = exerciseRecords({ workouts: [workout('2026-11-01', [entry('0293', [side])])] }, '0293')
    expect(r.weight).toEqual({ w: 20, r: 12, d: '2026-11-01' })
    expect(r.session).toEqual({ reps: 21, sets: 2, d: '2026-11-01' })
  })

  it('survives a profile with nothing in it', () => {
    expect(exerciseRecords({}, BENCH).any).toBe(false)
    expect(exerciseRecords(null, BENCH).any).toBe(false)
    expect(baseRecords({}).map(r => r.exId)).toEqual(CLASSIC_BASE)
  })
})

describe('the list of base lifts', () => {
  it('knows a big movement by its catalogue name or machine', () => {
    expect(isBaseLike(BENCH)).toBe(true)     // barbell bench press
    expect(isBaseLike(LEG)).toBe(true)       // a leg press machine
    expect(isBaseLike('0652')).toBe(true)    // pull-up
    expect(isBaseLike('0032')).toBe(true)    // barbell deadlift
    expect(isBaseLike(CURL)).toBe(false)     // barbell curl
    expect(isBaseLike('1067')).toBe(false)   // cable straight arm pulldown: one joint, not a base lift
    expect(isBaseLike('nope')).toBe(false)
  })

  it('starts from the logged base lifts, most trained first, then the classics not logged yet', () => {
    const ids = baseExerciseIds(S)
    expect(ids.slice(0, 3)).toEqual([BENCH, LEG, DIPS])   // bench and leg press twice (bench later), dips once
    expect(ids).not.toContain(CURL)
    expect(ids.slice(3)).toEqual(['0043', '0032', '0652'])
    expect(hasOwnBase(S)).toBe(false)
  })

  it('the owner’s own list replaces the guess, in its order', () => {
    const own = { ...S, baseEx: [LEG, '0652', LEG, '', 7] }
    expect(baseExerciseIds(own)).toEqual([LEG, '0652'])
    expect(hasOwnBase(own)).toBe(true)
    expect(baseRecords(own).map(r => r.exId)).toEqual([LEG, '0652'])
  })

  it('toggling starts from what is shown and keeps the rest', () => {
    const s = { workouts: S.workouts }
    expect(toggleBaseExercise(s, CURL)).toBe(true)
    expect(s.baseEx).toEqual([BENCH, LEG, DIPS, '0043', '0032', '0652', CURL])
    expect(toggleBaseExercise(s, '0043')).toBe(false)
    expect(s.baseEx).toEqual([BENCH, LEG, DIPS, '0032', '0652', CURL])
    setBaseExercises(s, [])
    expect(baseExerciseIds(s)).toEqual([])
  })

  it('the chooser offers the list, everything logged and the classics, each once', () => {
    const c = baseCandidates(S)
    expect(new Set(c).size).toBe(c.length)
    expect(c).toEqual(expect.arrayContaining([BENCH, LEG, DIPS, CURL, ...CLASSIC_BASE]))
  })
})

describe('recentRecordWorkouts', () => {
  it('lists the latest workouts that saved records, newest first', () => {
    const more = { workouts: [...S.workouts, workout('2026-11-05', [entry(CURL, [set(20, 10)])], { prs: [CURL], n: 'x' })] }
    const r = recentRecordWorkouts(more)
    expect(r.map(x => x.d)).toEqual(['2026-11-22', '2026-11-05'])
    expect(r[0].ids).toEqual([CURL, DIPS])
    expect(recentRecordWorkouts(more, 1)).toHaveLength(1)
    expect(recentRecordWorkouts({})).toEqual([])
  })
})
