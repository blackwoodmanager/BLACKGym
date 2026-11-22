import { describe, it, expect } from 'vitest'
import { weeklyBuckets, weekChange, OVERVIEW_WEEKS } from './desk-overview.js'

const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const workout = (d, sets) => ({ id: 'w' + d, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:00:00'), entries: [{ id: '0025', sets }] })

// 2026-11-22 is a Sunday: with a Monday start its week began on the 16th, with a Sunday start on the 22nd.
const S = {
  unit: 'kg',
  workouts: [
    workout('2026-11-02', [set(50, 10)]),
    workout('2026-11-10', [set(60, 10), set(60, 10)]),
    workout('2026-11-16', [set(80, 5), set(100, 5, { warmup: true })]),
    workout('2026-11-22', [set(70, 10), { w: 70, r: 10, done: false }])
  ]
}

describe('weeklyBuckets', () => {
  it('gives the last weeks oldest first, with the current one last', () => {
    const b = weeklyBuckets(S, { weeks: 4, today: '2026-11-22' })
    expect(b.map(x => x.wk)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'])
    expect(b.map(x => x.current)).toEqual([false, false, false, true])
  })

  it('adds up workouts, ticked work sets and volume per week, and keeps an empty week', () => {
    const b = weeklyBuckets(S, { weeks: 4, today: '2026-11-22' })
    expect(b[0]).toMatchObject({ workouts: 0, volume: 0, sets: 0 })
    expect(b[1]).toMatchObject({ workouts: 1, volume: 500, sets: 1 })
    expect(b[2]).toMatchObject({ workouts: 1, volume: 1200, sets: 2 })
    // The warm-up and the set that was not ticked count for nothing.
    expect(b[3]).toMatchObject({ workouts: 2, volume: 1100, sets: 2 })
  })

  it('follows the profile’s week start', () => {
    const b = weeklyBuckets({ ...S, weekStart: 0 }, { weeks: 2, today: '2026-11-22' })
    expect(b.map(x => x.wk)).toEqual(['2026-11-15', '2026-11-22'])
    expect(b.map(x => x.workouts)).toEqual([1, 1])
  })

  it('leaves out what is older than the window, and survives an empty profile', () => {
    expect(weeklyBuckets(S, { weeks: 1, today: '2026-11-22' })).toHaveLength(1)
    expect(weeklyBuckets({}, { today: '2026-11-22' })).toHaveLength(OVERVIEW_WEEKS)
    expect(weeklyBuckets(null, { weeks: 3, today: '2026-11-22' }).every(x => x.volume === 0)).toBe(true)
  })
})

describe('weekChange', () => {
  it('is this week against the one before, in percent', () => {
    expect(weekChange([{ volume: 1000 }, { volume: 1100 }])).toBe(10)
    expect(weekChange([{ volume: 1200 }, { volume: 1100 }])).toBe(-8.3)
  })
  it('says nothing without a week to compare with', () => {
    expect(weekChange([{ volume: 0 }, { volume: 500 }])).toBeNull()
    expect(weekChange([{ volume: 500 }])).toBeNull()
    expect(weekChange(null)).toBeNull()
  })
})
