import { describe, it, expect } from 'vitest'
import { deskCopy, fill, DESK_LANGS } from './copy.js'

describe('the desktop layer’s words', () => {
  it('speak the language of the code, ignore the region, and fall back to English', () => {
    expect(deskCopy('ru').records).toBe('Рекорды')
    expect(deskCopy('uk-UA').records).toBe('Рекорди')
    expect(deskCopy('RU_ru').pickBase).toBe('Выбрать базовые')
    expect(deskCopy('de').records).toBe('Records')
    expect(deskCopy('').records).toBe('Records')
    expect(deskCopy(undefined).records).toBeTruthy()
  })

  it('have every line in every language, so no screen shows a hole', () => {
    const en = deskCopy('en')
    const keys = Object.keys(en).sort()
    for (const l of DESK_LANGS) {
      const c = deskCopy(l)
      expect(Object.keys(c).sort(), l).toEqual(keys)
      for (const k of keys) expect(typeof c[k] === 'string' && c[k].length > 0, l + '.' + k).toBe(true)
    }
  })

  it('keep the same placeholders in every language', () => {
    const marks = s => (String(s).match(/\{\d+\}/g) || []).sort().join()
    const en = deskCopy('en')
    for (const l of DESK_LANGS) for (const k of Object.keys(en)) expect(marks(deskCopy(l)[k]), l + '.' + k).toBe(marks(en[k]))
  })

  it('use no long dashes: the app’s texts are plain', () => {
    for (const l of DESK_LANGS) expect(JSON.stringify(deskCopy(l))).not.toMatch(/[—–]/)
  })

  it('fills placeholders and leaves an unknown one alone', () => {
    expect(fill('{0} of {1}', 2, 3)).toBe('2 of 3')
    expect(fill('{0} and {2}', 'a')).toBe('a and {2}')
  })
})
