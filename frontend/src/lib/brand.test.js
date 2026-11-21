// @vitest-environment happy-dom
// What a deployment with a name of its own changes for a profile started on this device
// (lib/brand.js): the theme it begins in. Without such a deployment, openGym's own defaults.
import { afterEach, describe, expect, it } from 'vitest'
import { brandDefault } from './brand.js'
import { freshState } from '../store/useStore.js'

const brand = defaults => { window.__BLACKGYM_BRAND__ = { name: 'BlackGym', defaults, icons: [{ id: 'a', name: { en: 'A' } }], current: () => 'a', set: id => id } }
afterEach(() => { delete window.__BLACKGYM_BRAND__ })

describe('a deployment\'s defaults', () => {
  it('leaves openGym as it is when there is no deployment brand', () => {
    expect(brandDefault('theme')).toBe(null)
    expect(freshState().theme).toBe('dark')
  })

  it('starts a new profile in the theme the deployment asks for', () => {
    brand({ theme: 'system' })
    expect(brandDefault('theme')).toBe('system')
    expect(freshState().theme).toBe('system')
  })

  it('ignores a theme the app does not have, and anything that is not a theme', () => {
    brand({ theme: 'neon', lang: 'xx' })
    expect(brandDefault('theme')).toBe(null)
    expect(brandDefault('lang')).toBe(null)
    expect(freshState().theme).toBe('dark')
  })
})
