// @vitest-environment happy-dom
// BlackGym: the provider row on the first Settings page (components/ProviderLinkRow.jsx).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { setLang } from '../lib/i18n.js'

const apiMock = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: apiMock.api }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; apiMock.api.mockReset() })

async function mount({ config, user }) {
  setLang('en')
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)), user, config })
  const { default: ProviderLinkRow } = await import('./ProviderLinkRow.jsx')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<ProviderLinkRow />) })
}

describe('the provider row on the first Settings page', () => {
  it('shows "Sign in with Telegram" and whether it is linked, once the passkeys are known', async () => {
    apiMock.api.mockImplementation(async url => (url === '/api/account/passkeys' ? { passkeys: [{ id: 'p1' }], password: false } : {}))
    await mount({ config: { oidc: { label: 'Telegram' } }, user: { id: 'u', name: 'A' } })
    expect(container.textContent).toContain('Sign in with Telegram')
    expect(container.textContent).toContain('Not linked yet.')
    act(() => root.unmount()); root = null
    await mount({ config: { oidc: { label: 'Telegram' } }, user: { id: 'u', name: 'A', oidc: true } })
    expect(container.textContent).toContain('Linked. Telegram signs you in here.')
  })

  it('is not there without a provider, without a session, or before the passkeys are in', async () => {
    apiMock.api.mockImplementation(async () => ({ passkeys: [], password: false }))
    await mount({ config: {}, user: { id: 'u', name: 'A' } })
    expect(container.textContent).toBe('')
    expect(apiMock.api).not.toHaveBeenCalled()
    act(() => root.unmount()); root = null
    await mount({ config: { oidc: { label: 'Telegram' } }, user: null })
    expect(container.textContent).toBe('')
    act(() => root.unmount()); root = null
    apiMock.api.mockImplementation(() => new Promise(() => {}))
    await mount({ config: { oidc: { label: 'Telegram' } }, user: { id: 'u', name: 'A' } })
    expect(container.textContent).toBe('')
  })
})
