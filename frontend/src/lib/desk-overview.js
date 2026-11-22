// The desktop Overview's own sums (BlackGym): the training of the last weeks, a week at a time.
// Counted the way every other screen counts: a workout's volume is sessionVolume (work sets, the
// warm-up and body-weight switches applied), its sets are the ticked work sets (lib/report.js
// workSetsOf), and a week is the profile's own (Monday or Sunday first). Pure; nothing is stored.
import { sessionVolume, workoutDay } from './history.js'
import { workSetsOf } from './report.js'
import { isoOf, startOfWeek, todayISO, weekKey, weekStartOf } from './format.js'

export const OVERVIEW_WEEKS = 12

/**
 * The last `weeks` weeks, oldest first, the one `today` is in last:
 * [{ wk, workouts, volume, sets, current }]. `wk` is the ISO date the week starts on.
 * A week without training is there with zeros, so the bars keep their place in time.
 */
export function weeklyBuckets(S, { weeks = OVERVIEW_WEEKS, today = todayISO() } = {}) {
  const ws = weekStartOf(S)
  const first = startOfWeek(today, ws)
  const out = []
  const at = new Map()
  for (let i = Math.max(1, weeks) - 1; i >= 0; i--) {
    const d = new Date(first)
    d.setDate(d.getDate() - i * 7)
    const row = { wk: isoOf(d), workouts: 0, volume: 0, sets: 0, current: i === 0 }
    at.set(row.wk, row)
    out.push(row)
  }
  for (const w of Array.isArray(S?.workouts) ? S.workouts : []) {
    const d = workoutDay(w)
    const row = d && at.get(weekKey(d, ws))
    if (!row) continue
    row.workouts++
    row.volume += sessionVolume(w, S)
    row.sets += workSetsOf(w)
  }
  return out
}

/** This week's volume against the week before, in percent (rounded to one place), or null when there is nothing to compare with. */
export function weekChange(buckets) {
  const n = Array.isArray(buckets) ? buckets.length : 0
  if (n < 2) return null
  const now = buckets[n - 1].volume, before = buckets[n - 2].volume
  if (!(before > 0)) return null
  return Math.round((now - before) / before * 1000) / 10
}
