// The bug button's server half (feedback.js): the configuration it needs, what it keeps of a
// request, and what it sends to the orchestrator. The route in server.js is admin-only; that guard
// and the key never reaching a client are covered in feedback-route.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackConfig, parseFeedback, forwardFeedback, FeedbackError, MAX_TEXT } from '../feedback.js';

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
  assert.deepEqual(sent, { app: 'blackgym', kind: 'bug', text: 'Start does nothing', requestId: 'req-12345678', context: { route: '/plan' }, author: { id: 'u1', name: 'Ada' } });
  assert.deepEqual(out, { id: 'fa-1-abc', link: 'https://orch.example.com/#task-fa-1-abc', duplicate: false });
});

test('forwarding: a duplicate is passed on; a link that is not https is dropped', async () => {
  const out = await forwardFeedback({ config: cfg, fb, user: {}, fetchImpl: reply(200, { ok: true, duplicate: true, id: 'fa-2', link: 'javascript:alert(1)' }) });
  assert.deepEqual(out, { id: 'fa-2', link: null, duplicate: true });
});

test('forwarding: every failure is a FeedbackError, and none of them repeats what the orchestrator said', async () => {
  const cases = [
    [reply(401, { error: 'Нужен ключ заявок приложений' }), 502, 'orchestrator-refused'],
    [reply(409, { error: 'secret detail' }), 502, 'orchestrator-refused'],
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
