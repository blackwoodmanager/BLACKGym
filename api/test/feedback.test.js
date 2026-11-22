// The bug button's server half (feedback.js): the configuration it needs, what it keeps of a
// request, and what it sends to the orchestrator. The route in server.js is admin-only; that guard
// and the key never reaching a client are covered in feedback-route.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackConfig, parseFeedback, forwardFeedback, listFeedback, actOnFeedback, parseAct, parseMarks, cleanItem, FeedbackError, MAX_TEXT, MAX_MARKS } from '../feedback.js';

const TOKEN = 'k'.repeat(40);
const ENV = { ORCH_FEEDBACK_URL: 'https://orch.example.com/', ORCH_FEEDBACK_TOKEN: TOKEN };

test('configuration: both variables, a long key, https (plain http only for localhost)', () => {
  assert.deepEqual(feedbackConfig(ENV), { url: 'https://orch.example.com', token: TOKEN });
  assert.equal(feedbackConfig({}), null);
  assert.equal(feedbackConfig({ ORCH_FEEDBACK_URL: ENV.ORCH_FEEDBACK_URL }), null);
  assert.equal(feedbackConfig({ ...ENV, ORCH_FEEDBACK_TOKEN: 'short' }), null);
  assert.equal(feedbackConfig({ ...ENV, ORCH_FEEDBACK_URL: 'http://orch.example.com' }), null);
  assert.equal(feedbackConfig({ ...ENV, ORCH_FEEDBACK_URL: 'not a url' }), null);
  assert.equal(feedbackConfig({ ...ENV, ORCH_FEEDBACK_URL: 'https://u:p@orch.example.com' }), null);
  assert.ok(feedbackConfig({ ...ENV, ORCH_FEEDBACK_URL: 'http://localhost:3000' }));
});

test('a request: kind defaults to bug, text is required and capped, unknown fields are dropped', () => {
  assert.equal(parseFeedback({ text: ' hi ' }).kind, 'bug');
  assert.equal(parseFeedback({ kind: 'idea', text: 'more charts' }).kind, 'idea');
  for (const bad of [{ text: '' }, { text: '   ' }, {}, null, { kind: 'rant', text: 'x' }, { text: 'x'.repeat(MAX_TEXT + 1) }, { text: 'x', requestId: 'no spaces allowed' }]) {
    assert.throws(() => parseFeedback(bad), e => e instanceof FeedbackError && e.status === 400, JSON.stringify(bad)?.slice(0, 40));
  }
  assert.equal(parseFeedback({ text: 'x'.repeat(MAX_TEXT) }).text.length, MAX_TEXT);
  const fb = parseFeedback({ text: 'a\r\nb\u0000c', admin: true, context: { route: '/plan\nx', userAgent: 'u'.repeat(400), secret: 's', version: '' } });
  assert.equal(fb.text, 'a\nbc');
  assert.deepEqual(Object.keys(fb.context).sort(), ['route', 'userAgent']);
  assert.equal(fb.context.route, '/plan x');
  assert.equal(fb.context.userAgent.length, 200);
  assert.ok(!('admin' in fb));
});

const cfg = { url: 'https://orch.example.com', token: TOKEN };
const fb = parseFeedback({ kind: 'bug', text: 'Start does nothing', requestId: 'req-12345678', context: { route: '/plan' } });
const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('forwarding: the key goes in the header, the author comes from the session, never from the request', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { status: 200, ok: true, json: async () => ({ ok: true, id: 'fa-1-abc', link: 'https://orch.example.com/#task-fa-1-abc' }) }; };
  const out = await forwardFeedback({ config: cfg, fb, user: { id: 'u1', name: 'Ada' }, fetchImpl });
  assert.equal(seen.url, 'https://orch.example.com/api/app-feedback');
  assert.equal(seen.init.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(seen.init.redirect, 'error');
  const sent = JSON.parse(seen.init.body);
  assert.deepEqual(sent, { app: 'blackgym', action: 'create', kind: 'bug', text: 'Start does nothing', requestId: 'req-12345678', context: { route: '/plan' }, author: { id: 'u1', name: 'Ada' } });
  assert.deepEqual(out, { id: 'fa-1-abc', link: 'https://orch.example.com/#task-fa-1-abc', duplicate: false });
});

test('forwarding: a duplicate is passed on; a link that is not https is dropped', async () => {
  const out = await forwardFeedback({ config: cfg, fb, user: {}, fetchImpl: reply(200, { ok: true, duplicate: true, id: 'fa-2', link: 'javascript:alert(1)' }) });
  assert.deepEqual(out, { id: 'fa-2', link: null, duplicate: true });
});

test('forwarding: every failure is a FeedbackError, and none of them repeats what the orchestrator said', async () => {
  const cases = [
    [reply(401, { error: 'Нужен ключ заявок приложений' }), 502, 'orchestrator-refused'],
    [reply(409, { error: 'secret detail' }), 409, 'wrong-stage'],
    [reply(404, { error: 'secret detail' }), 404, 'not-found'],
    [reply(400, { error: 'secret detail' }), 400, 'orchestrator-refused'],
    [reply(500, null), 502, 'orchestrator-refused'],
    [reply(200, { ok: false }), 502, 'orchestrator-refused'],
    [reply(429, { error: 'x' }), 429, 'orchestrator-busy'],
    [async () => { throw new Error('ECONNRESET https://orch.example.com'); }, 502, 'orchestrator-down']
  ];
  const warn = console.warn; console.warn = () => {};
  try {
    for (const [fetchImpl, status, code] of cases) {
      await assert.rejects(forwardFeedback({ config: cfg, fb, user: {}, fetchImpl }), e => {
        assert.ok(e instanceof FeedbackError);
        assert.equal(e.status, status);
        assert.equal(e.code, code);
        assert.ok(!/secret|ключ|ECONNRESET|orch\.example/.test(e.message), e.message);
        return true;
      });
    }
  } finally { console.warn = warn; }
});

const ID = 'fa-1800000000000-a1b2c3';

test('marks: only the known fields, bounded, and a request may be marks alone', () => {
  assert.deepEqual(parseMarks(undefined), []);
  const [m] = parseMarks([{ n: 2, note: ' a  note ', what: 'button\n"Start"', selector: '#a > b', route: '/plan', html: '<b>x</b>', rect: { x: 1.6, y: 2, w: 3, h: 4 }, viewport: { w: 390, h: 780 }, evil: 'x' }]);
  assert.deepEqual(m, { n: 2, note: 'a  note', what: 'button "Start"', selector: '#a > b', route: '/plan', html: '<b>x</b>', rect: { x: 2, y: 2, w: 3, h: 4 }, viewport: { w: 390, h: 780 } });
  assert.equal(parseMarks([{ n: 1, note: 'x', rect: { x: 'a', y: 1, w: 1, h: 1 } }])[0].rect, undefined, 'a rect with a bad number is dropped whole');
  assert.equal(parseMarks([{ note: 'x'.repeat(900) }])[0].note.length, 500);
  assert.throws(() => parseMarks('x'), e => e instanceof FeedbackError && e.status === 400);
  assert.throws(() => parseMarks(Array.from({ length: MAX_MARKS + 1 }, () => ({ note: 'x' }))), e => e.status === 400);
  assert.equal(parseFeedback({ marks: [{ n: 1, note: 'only a mark' }] }).text, '');
  assert.throws(() => parseFeedback({ marks: [{ n: 1, note: '' }] }), e => e.status === 400, 'a mark without a note is not a request');
});

test('marks go to the orchestrator with the request', async () => {
  let sent;
  const fetchImpl = async (u, init) => { sent = JSON.parse(init.body); return { status: 200, ok: true, json: async () => ({ ok: true, id: 'fa-1-abc' }) }; };
  await forwardFeedback({ config: cfg, fb: parseFeedback({ kind: 'idea', marks: [{ n: 1, note: 'move this', route: '/home' }] }), user: { id: 'u', name: 'A' }, fetchImpl });
  assert.equal(sent.marks.length, 1);
  assert.equal(sent.marks[0].route, '/home');
  assert.equal(sent.kind, 'idea');
});

test('the list: asked for, cut down to what the screen draws, and anything odd is dropped', async () => {
  let sent;
  const items = [
    { id: ID, title: 'T'.repeat(300), kind: 'idea', stage: 'waiting', progress: 140, summary: 'ok', ask: 'Deploy?', askOptions: ['Yes', 'No', 'a', 'b', 'c'], askKind: 'question', links: [{ url: 'https://x.dev/pr/1', title: 'PR' }, { url: 'javascript:1', title: 'bad' }], marks: [{ n: 1, note: 'n', what: 'w', route: '/r', brief: 'LEAK' }], review: { state: 'accepted', note: 'fine', at: 5 }, open: true, createdAt: 1, brief: 'LEAK', secretsBox: 'LEAK', link: 'http://insecure' },
    { id: 'bad id', title: 'dropped' },
    { id: 'fa-1800000000001-ffffff', stage: 'nonsense' }
  ];
  const fetchImpl = async (u, init) => { sent = JSON.parse(init.body); return { status: 200, ok: true, json: async () => ({ ok: true, items }) }; };
  const out = await listFeedback({ config: cfg, fetchImpl });
  assert.deepEqual(sent, { app: 'blackgym', action: 'list' });
  assert.equal(out.items.length, 2, 'the item with a bad id is dropped');
  const [a, b] = out.items;
  assert.equal(a.title.length, 160);
  assert.equal(a.progress, 100);
  assert.deepEqual(a.askOptions, ['Yes', 'No', 'a', 'b']);
  assert.deepEqual(a.links, [{ url: 'https://x.dev/pr/1', title: 'PR' }]);
  assert.deepEqual(a.marks, [{ n: 1, note: 'n', what: 'w', route: '/r' }]);
  assert.equal(a.link, null, 'a link that is not https is dropped');
  assert.ok(!JSON.stringify(out).includes('LEAK'));
  assert.equal(b.stage, 'queued', 'an unknown stage reads as queued');
  assert.equal(cleanItem(null).stage, 'queued');
});

test('an action: known, with a good id, a reason for sending back and an answer for a reply', () => {
  assert.deepEqual(parseAct({ action: 'accept', id: ID }), { action: 'accept', id: ID, note: '', choice: '', text: '' });
  assert.equal(parseAct({ action: 'rework', id: ID, note: ' no ' }).note, 'no');
  assert.equal(parseAct({ action: 'reply', id: ID, choice: 'Yes' }).choice, 'Yes');
  for (const bad of [{ action: 'drop', id: ID }, { action: 'accept', id: 'x' }, { action: 'accept' }, { action: 'rework', id: ID }, { action: 'reply', id: ID }, { action: 'accept', id: ID, note: 5 }, { action: 'accept', id: ID, note: 'x'.repeat(1001) }, null]) {
    assert.throws(() => parseAct(bad), e => e instanceof FeedbackError && e.status === 400, JSON.stringify(bad)?.slice(0, 50));
  }
});

test('an action goes on with only what was given, and the stage comes back', async () => {
  let sent;
  const fetchImpl = async (u, init) => { sent = JSON.parse(init.body); return { status: 200, ok: true, json: async () => ({ ok: true, stage: 'queued' }) }; };
  const out = await actOnFeedback({ config: cfg, act: parseAct({ action: 'rework', id: ID, note: 'the button does nothing' }), fetchImpl });
  assert.deepEqual(sent, { app: 'blackgym', action: 'rework', id: ID, note: 'the button does nothing' });
  assert.deepEqual(out, { stage: 'queued' });
  await assert.rejects(actOnFeedback({ config: cfg, act: parseAct({ action: 'accept', id: ID }), fetchImpl: async () => ({ status: 409, ok: false, json: async () => ({ ok: false, stage: 'running', error: 'secret' }) }) }),
    e => e.status === 409 && e.code === 'wrong-stage' && e.stage === 'running' && !e.message.includes('secret'));
});
