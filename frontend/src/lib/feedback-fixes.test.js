import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetFixesForTests, getFixes, refreshFixes, subscribeFixes } from './feedback-fixes.js'

describe('the shared "My fixes" list', () => {
  beforeEach(() => _resetFixesForTests())

  it('starts empty and not loading, and tells subscribers when it changes', async () => {
    expect(getFixes()).toMatchObject({ items: null, error: false, loading: false })
    const seen = vi.fn()
    const off = subscribeFixes(seen)
    await refreshFixes(async () => [{ id: 'a' }], () => 123)
    expect(getFixes()).toMatchObject({ items: [{ id: 'a' }], error: false, loading: false, at: 123 })
    expect(seen).toHaveBeenCalled()
    off()
  })

  it('asks once when two screens ask at the same time', async () => {
    const get = vi.fn(async () => [])
    await Promise.all([refreshFixes(get), refreshFixes(get), refreshFixes(get)])
    expect(get).toHaveBeenCalledTimes(1)
    await refreshFixes(get)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('keeps the list it had when a refresh fails, and says so', async () => {
    await refreshFixes(async () => [{ id: 'a' }])
    await refreshFixes(async () => { throw new Error('offline') })
    expect(getFixes()).toMatchObject({ items: [{ id: 'a' }], error: true, loading: false })
    await refreshFixes(async () => [{ id: 'b' }])
    expect(getFixes()).toMatchObject({ items: [{ id: 'b' }], error: false })
  })
})
