/* POST /api/feedback, the real server.js in a child with a stand-in orchestrator beside it:
   who may use it, what the orchestrator is sent, and that its key reaches nobody else. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const KEY = 'orchestrator-key-'.padEnd(40, 'z');
const ORIGIN = 'http://localhost:8080';
const ADMIN = 'u_adm_1', MEMBER = 'u_mem_1';

function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const as = uid => ({ Cookie: `gymsid=${mintSession(uid)}`, 'Content-Type': 'application/json', Origin: ORIGIN });

/** A stand-in orchestrator: records what arrives, answers with `reply`. */
async function fakeOrchestrator(t, reply = () => ({ status: 200, body: { ok: true, id: 'fa-1-abc', link: 'https://orch.example.com/#task-fa-1-abc' } })) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', d => raw += d);
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(raw || '{}') });
      const r = reply(seen.length, seen[seen.length - 1].body);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  return { seen, url: `http://127.0.0.1:${srv.address().port}` };
}

async function startServer(t, extraEnv = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-feedback-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: ADMIN, name: 'Adminna', created: new Date().toISOString(), admin: true },
      { id: MEMBER, name: 'Member', created: new Date().toISOString() }
    ], creds: [], subs: [], invites: []
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', ...extraEnv }
  });
  const h = { log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.post = async (uid, body) => {
    const r = await fetch(`${h.api}/api/feedback`, { method: 'POST', headers: uid ? as(uid) : { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  };
  h.get = async (uid, p) => { const r = await fetch(`${h.api}${p}`, { headers: uid ? as(uid) : {} }); return { status: r.status, text: await r.text() }; };
  h.act = async (uid, body) => {
    const r = await fetch(`${h.api}/api/feedback/act`, { method: 'POST', headers: uid ? as(uid) : { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  };
  h.me = async uid => (await (await fetch(`${h.api}/api/me`, { headers: as(uid) })).json()).user;
  return h;
}

test('an admin sends a bug; the orchestrator gets it with the key, the author from the session and the context', async t => {
  const orch = await fakeOrchestrator(t);
  const h = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  const r = await h.post(ADMIN, { kind: 'bug', text: 'Start does nothing', requestId: 'req-12345678', context: { route: '/plan', platform: 'web' }, author: { id: 'someone-else', name: 'Mallory' } });
  assert.equal(r.status, 200, r.text);
  const out = JSON.parse(r.text);
  assert.deepEqual(out, { ok: true, id: 'fa-1-abc', link: 'https://orch.example.com/#task-fa-1-abc', duplicate: false });
  assert.equal(orch.seen.length, 1);
  assert.equal(orch.seen[0].url, '/api/app-feedback');
  assert.equal(orch.seen[0].auth, `Bearer ${KEY}`);
  assert.deepEqual(orch.seen[0].body, {
    app: 'blackgym', action: 'create', kind: 'bug', text: 'Start does nothing', requestId: 'req-12345678', context: { route: '/plan', platform: 'web' },
    author: { id: ADMIN, name: 'Adminna' }
  });
  assert.ok(!r.text.includes(KEY), 'the key is never in an answer');
});

test('nobody else can use it: no session is 401, a member is 403, and nothing reaches the orchestrator', async t => {
  const orch = await fakeOrchestrator(t);
  const h = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  assert.equal((await h.post(null, { text: 'x' })).status, 401);
  assert.equal((await h.post(MEMBER, { text: 'x' })).status, 403);
  assert.equal(orch.seen.length, 0);
});

test('/api/me says "feedback" to an admin on a wired server, and to nobody else', async t => {
  const orch = await fakeOrchestrator(t);
  const on = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  assert.equal((await on.me(ADMIN)).feedback, true);
  assert.equal((await on.me(MEMBER)).feedback, undefined);
  const off = await startServer(t);
  assert.equal((await off.me(ADMIN)).feedback, undefined);
});

test('not wired: 503 with a code the app can read; bad input: 400 before anything is sent', async t => {
  const orch = await fakeOrchestrator(t);
  const off = await startServer(t);
  const r = await off.post(ADMIN, { text: 'x' });
  assert.equal(r.status, 503);
  assert.equal(JSON.parse(r.text).code, 'feedback-off');
  const on = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  assert.equal((await on.post(ADMIN, { text: '   ' })).status, 400);
  assert.equal((await on.post(ADMIN, { kind: 'rant', text: 'x' })).status, 400);
  assert.equal(orch.seen.length, 0);
});

test('the orchestrator refusing is a 502 that does not repeat what it said or the key', async t => {
  const orch = await fakeOrchestrator(t, () => ({ status: 401, body: { error: 'secret detail' } }));
  const h = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  const r = await h.post(ADMIN, { text: 'x' });
  assert.equal(r.status, 502);
  assert.equal(JSON.parse(r.text).code, 'orchestrator-refused');
  assert.ok(!r.text.includes('secret detail') && !r.text.includes(KEY));
});

const ID = 'fa-1800000000000-a1b2c3';

test('marks reach the orchestrator, and a request can be marks alone', async t => {
  const orch = await fakeOrchestrator(t);
  const h = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  const r = await h.post(ADMIN, { kind: 'idea', marks: [{ n: 1, note: 'make this bigger', what: 'button "Start"', route: '/plan', selector: '#app button', rect: { x: 1, y: 2, w: 3, h: 4 }, viewport: { w: 390, h: 780 } }] });
  assert.equal(r.status, 200, r.text);
  assert.equal(orch.seen[0].body.marks[0].note, 'make this bigger');
  assert.equal(orch.seen[0].body.text, '');
  assert.equal((await h.post(ADMIN, { marks: [{ n: 1, note: '' }] })).status, 400);
});

test('the list: admins only, cut down to what the screen draws, the key never in it', async t => {
  const orch = await fakeOrchestrator(t, () => ({ status: 200, body: { ok: true, items: [{ id: ID, title: 'Fix the button', kind: 'bug', stage: 'review', summary: 'Done', links: [{ url: 'https://github.com/x/pull/1', title: 'PR' }], brief: 'LEAK', open: true, createdAt: 5 }] } }));
  const h = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  assert.equal((await h.get(null, '/api/feedback')).status, 401);
  assert.equal((await h.get(MEMBER, '/api/feedback')).status, 403);
  assert.equal(orch.seen.length, 0);
  const r = await h.get(ADMIN, '/api/feedback');
  assert.equal(r.status, 200, r.text);
  const body = JSON.parse(r.text);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].stage, 'review');
  assert.ok(!r.text.includes('LEAK') && !r.text.includes(KEY));
  assert.equal(orch.seen[0].auth, `Bearer ${KEY}`);
  assert.deepEqual(orch.seen[0].body, { app: 'blackgym', action: 'list' });
  const off = await startServer(t);
  assert.equal(JSON.parse((await off.get(ADMIN, '/api/feedback')).text).code, 'feedback-off');
});

test('an action: admins only, checked before it is sent, forwarded as given, and a stage mismatch is a 409 with the stage', async t => {
  let answer = { status: 200, body: { ok: true, stage: 'closed' } };
  const orch = await fakeOrchestrator(t, () => answer);
  const h = await startServer(t, { ORCH_FEEDBACK_URL: orch.url, ORCH_FEEDBACK_TOKEN: KEY });
  assert.equal((await h.act(null, { action: 'accept', id: ID })).status, 401);
  assert.equal((await h.act(MEMBER, { action: 'accept', id: ID })).status, 403);
  assert.equal((await h.act(ADMIN, { action: 'accept', id: 'nope' })).status, 400);
  assert.equal((await h.act(ADMIN, { action: 'rework', id: ID })).status, 400, 'sending back needs a reason');
  assert.equal(orch.seen.length, 0, 'nothing bad reached the orchestrator');
  const ok = await h.act(ADMIN, { action: 'accept', id: ID, note: 'works' });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(JSON.parse(ok.text), { ok: true, stage: 'closed' });
  assert.deepEqual(orch.seen[0].body, { app: 'blackgym', action: 'accept', id: ID, note: 'works' });
  answer = { status: 409, body: { ok: false, stage: 'running', error: 'secret detail' } };
  const late = await h.act(ADMIN, { action: 'accept', id: ID });
  assert.equal(late.status, 409);
  assert.deepEqual([JSON.parse(late.text).code, JSON.parse(late.text).stage], ['wrong-stage', 'running']);
  assert.ok(!late.text.includes('secret'));
});
