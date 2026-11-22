// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { FEEDBACK_MAX, FEEDBACK_IGNORE, SECTIONS, actFeedback, attentionCount, canGiveFeedback, currentContext, describeElement, feedbackContext, feedbackCopy, feedbackReady, groupItems, isHuge, listFeedback, markFrom, newRequestId, selectorOf, sendFeedback, stageLabel, targetAt, wireMark } from './feedback.js'
import { MAX_MARKS, addMark, getDraft, removeMark, resetDraft, setDraft } from './feedback-draft.js'

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

describe('a request made of marks', () => {
  it('is sendable with words, or with a marked place that has a note, and never over the limit', () => {
    expect(feedbackReady('', [])).toBe(false)
    expect(feedbackReady('', [{ note: '' }, { note: '  ' }])).toBe(false)
    expect(feedbackReady('', [{ note: 'move it' }])).toBe(true)
    expect(feedbackReady('x'.repeat(FEEDBACK_MAX + 1), [{ note: 'a' }])).toBe(false)
  })
  it('sends the places with the request, without the page position kept here', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true })
    const marks = [{ n: 1, note: 'here', what: 'button "Start"', selector: '#a', route: '/plan', html: '<b>', rect: { x: 1, y: 2, w: 3, h: 4 }, viewport: { w: 1, h: 1 }, docX: 9, docY: 9 }]
    await sendFeedback({ kind: 'bug', text: '', requestId: 'req-12345678', context: {}, marks }, post)
    const sent = JSON.parse(post.mock.calls[0][1].body)
    expect(sent.marks[0]).toEqual(wireMark(marks[0]))
    expect(sent.marks[0].docX).toBeUndefined()
    await sendFeedback({ kind: 'bug', text: 'x', requestId: 'req-12345678', context: {} }, post)
    expect('marks' in JSON.parse(post.mock.calls[1][1].body)).toBe(false)
  })
})

describe('the draft', () => {
  it('keeps text and places across screens, numbers them 1, 2, 3 and renumbers after a removal', () => {
    resetDraft()
    setDraft({ text: 'hello', kind: 'idea' })
    addMark({ note: 'a' }); addMark({ note: 'b' }); addMark({ note: 'c' })
    expect(getDraft().marks.map(m => m.n)).toEqual([1, 2, 3])
    removeMark(2)
    expect(getDraft().marks.map(m => [m.n, m.note])).toEqual([[1, 'a'], [2, 'c']])
    expect(getDraft().text).toBe('hello')
    resetDraft()
    expect(getDraft()).toEqual({ kind: 'bug', text: '', marks: [], requestId: null })
  })
  it('takes no more places than a request can hold', () => {
    resetDraft()
    for (let i = 0; i < MAX_MARKS; i++) expect(addMark({ note: String(i) })).toBe(true)
    expect(addMark({ note: 'one too many' })).toBe(false)
    expect(getDraft().marks).toHaveLength(MAX_MARKS)
    resetDraft()
  })
})

describe('naming a place', () => {
  const page = html => { document.body.innerHTML = html; return document.body }
  it('says what it is in the words on it: a button, a link, a heading, a field', () => {
    page('<div id="box"><button class="btn primary" id="go">Start workout</button><a href="#" id="lnk">History</a><h2 id="hd">This week</h2><span id="sp">plain</span></div>')
    expect(describeElement(document.getElementById('go'))).toBe('button "Start workout"')
    expect(describeElement(document.getElementById('lnk'))).toBe('link "History"')
    expect(describeElement(document.getElementById('hd'))).toBe('heading "This week"')
    expect(describeElement(document.getElementById('sp'))).toBe('"plain"')
    expect(describeElement(null)).toBe('')
  })
  it('takes the nearest short label above a bare child, and cuts a long one', () => {
    page('<button id="b"><svg id="i"></svg><span id="t">Save</span></button>')
    expect(describeElement(document.getElementById('t'))).toBe('"Save"')
    page(`<p id="p">${'word '.repeat(40)}</p>`)
    expect(describeElement(document.getElementById('p')).length).toBeLessThanOrEqual(80)
  })
  it('gives a path an agent can search for: an id stops it, classes name it, a bare tag gets its place among siblings', () => {
    page('<div id="app"><main><ul><li>a</li><li class="row hot" id="x2">b</li><li>c</li></ul></main></div>')
    expect(selectorOf(document.getElementById('x2'))).toBe('li#x2')
    page('<div id="app"><main><section class="card big"><ul><li>a</li><li>b</li></ul></section></main></div>')
    const li = document.querySelectorAll('li')[1]
    expect(selectorOf(li)).toBe('main > section.card.big > ul > li:nth-of-type(2)')
    expect(selectorOf(li).length).toBeLessThanOrEqual(200)
  })
  it('never picks the marking layer itself', () => {
    page(`<button id="under">Real</button><div ${FEEDBACK_IGNORE} id="layer"></div>`)
    const under = document.getElementById('under'), layer = document.getElementById('layer')
    const doc = { elementsFromPoint: () => [layer, under] }
    expect(targetAt(5, 5, doc)).toBe(under)
    expect(targetAt(5, 5, { elementsFromPoint: () => [layer] })).toBe(null)
  })
  it('makes a mark: the note, the words, the path, the screen and the area; the page position adds the scroll', () => {
    page('<button id="go">Start</button>')
    const el = document.getElementById('go')
    el.getBoundingClientRect = () => ({ left: 10.4, top: 20.6, width: 100, height: 40 })
    const win = { innerWidth: 390, innerHeight: 780, scrollX: 0, scrollY: 300 }
    const m = markFrom(el, { x: 50, y: 40, route: '/plan', note: '  too small  ', win })
    expect(m).toMatchObject({ note: 'too small', what: 'button "Start"', selector: 'button#go', route: '/plan', rect: { x: 10, y: 21, w: 100, h: 40 }, viewport: { w: 390, h: 780 }, docX: 50, docY: 340 })
    expect(m.html).toContain('<button')
    expect(markFrom(null, { x: 1, y: 1, route: '/', note: 'n', win }).selector).toBe('')
  })
  it('calls a block that fills the screen too big to outline', () => {
    const win = { innerWidth: 400, innerHeight: 800 }
    expect(isHuge({ width: 400, height: 700 }, win)).toBe(true)
    expect(isHuge({ width: 100, height: 40 }, win)).toBe(false)
  })
})

describe('My fixes', () => {
  const it_ = (id, stage) => ({ id, stage })
  it('sorts requests into what needs the owner, what is under way and what is over, keeping the order given', () => {
    const items = [it_('a', 'closed'), it_('b', 'review'), it_('c', 'running'), it_('d', 'waiting'), it_('e', 'failed'), it_('f', 'queued'), it_('g', 'shipping')]
    expect(groupItems(items).map(g => [g.id, g.items.map(i => i.id)])).toEqual([['attention', ['b', 'd']], ['progress', ['c', 'f', 'g']], ['closed', ['a', 'e']]])
    expect(groupItems([])).toEqual([])
    expect(groupItems(null)).toEqual([])
    expect(SECTIONS.flatMap(s => s.stages).sort()).toEqual(['closed', 'failed', 'cancelled', 'paused', 'queued', 'review', 'running', 'shipping', 'waiting'].sort())
  })
  it('counts what waits for the owner', () => {
    expect(attentionCount([it_('a', 'review'), it_('b', 'waiting'), it_('c', 'running'), it_('d', 'closed')])).toBe(2)
    expect(attentionCount(undefined)).toBe(0)
  })
  it('has a word for every stage, in every language', () => {
    for (const l of ['en', 'ru', 'uk']) for (const sec of SECTIONS) for (const st of sec.stages) {
      const c = feedbackCopy(l)
      expect(stageLabel(c, st), `${l} ${st}`).toBeTruthy()
      if (st !== 'queued') expect(stageLabel(c, st)).not.toBe(c.stageQueued)
    }
  })
  it('reads the list from the server, and an answer that is not a list is an empty one', async () => {
    expect(await listFeedback(async () => ({ ok: true, items: [{ id: 'a' }] }))).toEqual([{ id: 'a' }])
    expect(await listFeedback(async () => ({ ok: true }))).toEqual([])
  })
  it('sends a decision with only what it carries, and names why one failed', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, stage: 'closed' })
    expect(await actFeedback({ id: 'fa-1', action: 'accept' }, post)).toEqual({ stage: 'closed' })
    expect(post.mock.calls[0][0]).toBe('/api/feedback/act')
    expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({ id: 'fa-1', action: 'accept' })
    await actFeedback({ id: 'fa-1', action: 'rework', note: 'no' }, post)
    expect(JSON.parse(post.mock.calls[1][1].body)).toEqual({ id: 'fa-1', action: 'rework', note: 'no' })
    const fail = (status, data) => async () => { throw Object.assign(new Error('x'), { status, data }) }
    await expect(actFeedback({ id: 'a', action: 'accept' }, fail(409, { code: 'wrong-stage' }))).rejects.toMatchObject({ kind: 'stage' })
    await expect(actFeedback({ id: 'a', action: 'accept' }, fail(404, {}))).rejects.toMatchObject({ kind: 'stage' })
    await expect(actFeedback({ id: 'a', action: 'accept' }, fail(429, {}))).rejects.toMatchObject({ kind: 'busy' })
    await expect(actFeedback({ id: 'a', action: 'accept' }, fail(502, {}))).rejects.toMatchObject({ kind: 'fail' })
    await expect(actFeedback({ id: 'a', action: 'accept' }, fail(0, undefined))).rejects.toMatchObject({ kind: 'offline' })
  })
})
