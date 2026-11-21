import { describe, it, expect, vi } from 'vitest'
import { FEEDBACK_MAX, canGiveFeedback, currentContext, feedbackContext, feedbackCopy, feedbackReady, newRequestId, sendFeedback } from './feedback.js'

describe('the words', () => {
  it('speak the language of the code, ignore the region, and fall back to English', () => {
    expect(feedbackCopy('ru').send).toBe('Отправить')
    expect(feedbackCopy('uk-UA').send).toBe('Надіслати')
    expect(feedbackCopy('RU_ru').send).toBe('Отправить')
    expect(feedbackCopy('de').send).toBe('Send')
    expect(feedbackCopy('').send).toBe('Send')
    expect(feedbackCopy(undefined).send).toBeTruthy()
  })
  it('have every line in every language, so no screen shows a hole', () => {
    const en = Object.keys(feedbackCopy('en')).sort()
    for (const l of ['ru', 'uk']) expect(Object.keys(feedbackCopy(l)).sort()).toEqual(en)
    for (const l of ['en', 'ru', 'uk']) for (const v of Object.values(feedbackCopy(l))) expect(v.trim()).not.toBe('')
  })
  it('use no long dashes, as the project asks of user-facing text', () => {
    for (const l of ['en', 'ru', 'uk']) for (const v of Object.values(feedbackCopy(l))) expect(v).not.toMatch(/[—–]/)
  })
})

describe('who sees the button', () => {
  it('only a user the server told "feedback": true', () => {
    expect(canGiveFeedback({ feedback: true })).toBe(true)
    expect(canGiveFeedback({ admin: true })).toBe(false)
    expect(canGiveFeedback({ feedback: 'yes' })).toBe(false)
    expect(canGiveFeedback(null)).toBe(false)
  })
})

describe('the context', () => {
  it('keeps short single lines and leaves out what is empty', () => {
    expect(feedbackContext({ route: '/plan', lang: 'ru', theme: '', screen: undefined, userAgent: 'a  b\nc' })).toEqual({ route: '/plan', lang: 'ru', userAgent: 'a b c' })
    expect(feedbackContext({ userAgent: 'u'.repeat(500) }).userAgent).toHaveLength(200)
    expect(feedbackContext()).toEqual({})
  })
  it('reads the page without throwing', () => {
    const c = currentContext('/history')
    expect(c.route).toBe('/history')
    for (const v of Object.values(c)) expect(typeof v).toBe('string')
  })
})

describe('the text and the id', () => {
  it('is sendable when something is there and it fits', () => {
    expect(feedbackReady('')).toBe(false)
    expect(feedbackReady('   \n')).toBe(false)
    expect(feedbackReady(null)).toBe(false)
    expect(feedbackReady('a')).toBe(true)
    expect(feedbackReady('a'.repeat(FEEDBACK_MAX))).toBe(true)
    expect(feedbackReady('a'.repeat(FEEDBACK_MAX + 1))).toBe(false)
  })
  it('gets an id the server accepts, a new one each time', () => {
    const a = newRequestId(), b = newRequestId()
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(a).not.toBe(b)
  })
})

describe('sending', () => {
  const body = { kind: 'bug', text: '  Start does nothing ', requestId: 'req-12345678', context: { route: '/plan' } }
  it('posts the trimmed text with its id and returns the link', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, id: 'fa-1', link: 'https://orch.example.com/#task-fa-1' })
    const r = await sendFeedback(body, post)
    expect(post).toHaveBeenCalledWith('/api/feedback', { method: 'POST', body: JSON.stringify({ kind: 'bug', text: 'Start does nothing', requestId: 'req-12345678', context: { route: '/plan' } }) })
    expect(r).toEqual({ link: 'https://orch.example.com/#task-fa-1', duplicate: false })
  })
  it('drops a link that is not https and passes a duplicate on', async () => {
    const r = await sendFeedback(body, async () => ({ ok: true, duplicate: true, link: 'javascript:alert(1)' }))
    expect(r).toEqual({ link: null, duplicate: true })
  })
  it('names why it failed, so the screen can say it in words', async () => {
    const fail = (status, data) => async () => { throw Object.assign(new Error('x'), { status, data }) }
    await expect(sendFeedback(body, fail(503, { code: 'feedback-off' }))).rejects.toMatchObject({ kind: 'off' })
    await expect(sendFeedback(body, fail(429, {}))).rejects.toMatchObject({ kind: 'busy' })
    await expect(sendFeedback(body, fail(502, { code: 'orchestrator-down' }))).rejects.toMatchObject({ kind: 'fail' })
    await expect(sendFeedback(body, fail(0, undefined))).rejects.toMatchObject({ kind: 'offline' })
    await expect(sendFeedback(body, fail(undefined, undefined))).rejects.toMatchObject({ kind: 'offline' })
  })
})
