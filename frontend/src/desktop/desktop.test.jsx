// @vitest-environment happy-dom
// BlackGym's desktop layer: the sidebar and Records as a person meets them.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { setLang } from '../lib/i18n.js'

const apiMock = vi.hoisted(() => ({ api: vi.fn(() => Promise.resolve({})) }))
vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: apiMock.api }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))
const set = (w, r) => ({ w, r, done: true })

let root, container
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; document.body.className = ''; apiMock.api.mockReset(); apiMock.api.mockImplementation(() => Promise.resolve({})) })

async function mount(View, { S: patch = {}, user = null, path = '/records', props = {} } = {}) {
  setLang('en')
  const S = Object.assign(clone(DEF), {
    workouts: [
      { id: 'a', d: '2026-11-10', start: Date.parse('2026-11-10T10:00:00'), end: Date.parse('2026-11-10T11:00:00'), name: 'Chest', entries: [{ id: '0025', sets: [set(60, 12), set(70, 12), set(80, 8)] }] },
      { id: 'b', d: '2026-11-17', start: Date.parse('2026-11-17T10:00:00'), end: Date.parse('2026-11-17T11:00:00'), name: 'Legs', prs: ['8375'], entries: [{ id: '8375', sets: [set(150, 21), set(175, 18), set(200, 15)] }] }
    ]
  }, patch)
  useStore.setState({ S, user })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><View {...props} /></MemoryRouter>) })
}
const texts = sel => [...container.querySelectorAll(sel)].map(e => e.textContent)

describe('Records', () => {
  it('shows each base lift with its weight record and its volume record', async () => {
    const { default: Records } = await import('./Records.jsx')
    await mount(Records)
    const cards = [...container.querySelectorAll('.dk-rec')]
    // Logged base lifts first (the later one first on a tie), then the classics not logged yet.
    expect(cards.map(c => c.querySelector('.dk-rec-n').textContent)).toEqual(['Lever Angled Leg Press', 'Barbell Bench Press', 'Barbell Full Squat', 'Barbell Deadlift', 'Pull-Up'])
    const leg = cards[0].textContent
    expect(leg).toContain('200 kg × 15')    // the heaviest set
    expect(leg).toContain('3,150 kg')       // the biggest set: 175 × 18 (150 × 21 is as big, and lighter)
    expect(leg).toContain('175 kg × 18')
    expect(cards[1].textContent).toContain('80 kg × 8')
    expect(cards[1].textContent).toContain('840 kg')
    expect(cards[2].textContent).toContain('Not logged yet')
  })

  it('opens the ladder of the lift that is picked, with both records marked', async () => {
    const { default: Records } = await import('./Records.jsx')
    await mount(Records)
    expect(container.querySelector('.dk-ladder')).toBeTruthy()
    expect(texts('.dk-rung-w')).toEqual(['200 kg', '175 kg', '150 kg'])
    expect(texts('.dk-rung .dk-tag')).toEqual(['Weight record', 'Volume record'])
    await act(async () => { container.querySelectorAll('.dk-rec')[1].click() })
    expect(texts('.dk-rung-w')).toEqual(['80 kg', '70 kg', '60 kg'])
    expect(container.querySelectorAll('.dk-rec')[1].getAttribute('aria-pressed')).toBe('true')
  })

  it('follows the owner’s own list, and lists the workouts that set records', async () => {
    const { default: Records } = await import('./Records.jsx')
    await mount(Records, { S: { baseEx: ['0652', '0025'] } })
    expect(texts('.dk-rec-n')).toEqual(['Pull-Up', 'Barbell Bench Press'])
    expect(texts('.dk-fresh-row')).toEqual(['Lever Angled Leg Press'])
  })

  it('says so when no base lift is chosen', async () => {
    const { default: Records } = await import('./Records.jsx')
    await mount(Records, { S: { baseEx: [] } })
    expect(container.querySelector('.dk-rec')).toBeNull()
    expect(container.textContent).toContain('No base lifts chosen')
  })
})

describe('the sidebar', () => {
  const labels = () => texts('#desknav .dk-item-t')
  it('lists the screens, lights the one that is open, and keeps "My fixes" for the one who has the bug button', async () => {
    const { default: DesktopNav } = await import('./DesktopNav.jsx')
    await mount(DesktopNav, { path: '/records', props: { onStart: () => {}, onPick: () => {} } })
    expect(labels()).toEqual(expect.arrayContaining(['Overview', 'Plan', 'Exercises', 'History', 'Stats', 'Records', 'Muscles', 'Journal', 'Settings']))
    expect(labels()).not.toContain('My fixes')
    expect(labels()).not.toContain('Admin')
    expect(container.querySelector('.dk-item.on').textContent).toBe('Records')
    act(() => root.unmount()); root = null
    await mount(DesktopNav, { path: '/tools', user: { id: 'u', name: 'A', admin: true, feedback: true }, props: { onStart: () => {}, onPick: () => {} } })
    expect(labels()).toEqual(expect.arrayContaining(['My fixes', 'Admin']))
    // A screen without an entry of its own lights the one it is opened from.
    expect(container.querySelector('.dk-item.on').textContent).toBe('Stats')
  })

  it('starts today’s workout, or opens the workout screen when nothing is planned', async () => {
    const { default: DesktopNav } = await import('./DesktopNav.jsx')
    const onStart = vi.fn()
    await mount(DesktopNav, { props: { onStart, onPick: () => {} } })
    await act(async () => { container.querySelector('.dk-start').click() })
    expect(onStart).not.toHaveBeenCalled()   // no routine on today's plan: the workout screen decides
    expect(container.querySelector('.dk-start').textContent).toBe('Start')
  })

  it('folds down to its icons and remembers it', async () => {
    const { default: DesktopNav } = await import('./DesktopNav.jsx')
    localStorage.removeItem('bg_desk_mini')
    await mount(DesktopNav, { props: { onStart: () => {}, onPick: () => {} } })
    await act(async () => { container.querySelector('.dk-fold').click() })
    expect(document.body.classList.contains('desk-mini')).toBe(true)
    expect(labels()).toEqual([])
    expect(container.querySelector('.dk-item[aria-label="Records"]')).toBeTruthy()
    expect(localStorage.getItem('bg_desk_mini')).toBe('1')
    await act(async () => { container.querySelector('.dk-fold').click() })
    expect(document.body.classList.contains('desk-mini')).toBe(false)
  })
})

describe('who gets the desktop layout', () => {
  it('a window that is wide and has a mouse, and nothing else', async () => {
    const { isDesktop, DESKTOP_QUERY } = await import('./use-desktop.js')
    const real = window.matchMedia
    window.matchMedia = q => ({ matches: q === DESKTOP_QUERY, addEventListener() {}, removeEventListener() {} })
    expect(isDesktop()).toBe(true)
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    expect(isDesktop()).toBe(false)
    window.matchMedia = undefined
    expect(isDesktop()).toBe(false)
    window.matchMedia = real
    expect(DESKTOP_QUERY).toMatch(/min-width: 1100px/)
    expect(DESKTOP_QUERY).toMatch(/hover: hover/)
  })
})
