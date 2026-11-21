/* The function, against a real PostgreSQL and the real api/server.js.
 *
 * Each "instance" below is dev-server.mjs in a child of its own with an empty data directory:
 * what a cold start of the function on Vercel is. Two of them on one schema are two instances
 * of the function running at once; one started after another was killed is a redeploy.
 *
 *   BLACKGYM_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/blackgym_test npm test
 *
 * Without that variable the file is skipped (the upstream suites need no database).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { softPasskey } from '../../api/test/helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = process.env.BLACKGYM_TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:8080';
const skip = DB ? false : 'BLACKGYM_TEST_DATABASE_URL is not set';

async function sql(text, params) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try { return await c.query(text, params); } finally { await c.end(); }
}

function newSchema(t) {
  const schema = 't_' + crypto.randomBytes(6).toString('hex');
  t.after(() => sql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
  return schema;
}

async function instance(t, schema, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-inst-'));
  const child = spawn(process.execPath, ['dev-server.mjs'], {
    cwd: path.join(HERE, '..'), stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, PORT: '0', ORIGIN, RP_ID: 'localhost',
      BLACKGYM_DATABASE_URL: DB, BLACKGYM_DB_SCHEMA: schema, BLACKGYM_DATA_DIR: dataDir,
      BLACKGYM_SERVER_DIR: path.join(HERE, '..', '..', 'api'), BLACKGYM_STATIC_DIR: os.tmpdir(),
      ...env,
    },
  });
  const h = { log: '', dataDir, schema };
  child.stderr.on('data', d => { h.log += d; });
  const port = await new Promise((resolve, reject) => {
    const give = setTimeout(() => reject(new Error('no port: ' + h.log)), 15000);
    child.stdout.on('data', d => {
      h.log += d;
      const m = /blackgym dev on :(\d+)/.exec(h.log);
      if (m) { clearTimeout(give); resolve(+m[1]); }
    });
    child.once('exit', code => reject(new Error(`dev server exited (${code}): ${h.log}`)));
  });
  h.kill = () => { try { child.kill('SIGKILL'); } catch { /* gone */ } fs.rmSync(dataDir, { recursive: true, force: true }); };
  t.after(h.kill);
  h.req = async (method, p, { body, cookie, headers = {} } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    const set = r.headers.get('set-cookie');
    return { status: r.status, body: json, text, cookie: set ? set.split(';')[0] : null, headers: r.headers };
  };
  return h;
}

async function signUp(h, name, passkey = softPasskey(ORIGIN), code) {
  const opt = await h.req('POST', '/api/register/options', { body: { name, ...(code ? { code } : {}) } });
  if (opt.status !== 200) return opt;
  const done = await h.req('POST', '/api/register/verify', { body: { cid: opt.body.cid, credential: passkey.attestation(opt.body.options.challenge) } });
  return { ...done, passkey };
}

async function signIn(h, passkey) {
  const opt = await h.req('POST', '/api/login/options', { body: {} });
  assert.equal(opt.status, 200);
  return h.req('POST', '/api/login/verify', { body: { cid: opt.body.cid, credential: passkey.assertion(opt.body.options.challenge) } });
}

const profile = extra => ({ routines: [{ id: 'r1', name: 'Push day', ex: [] }], workouts: [], bodyweight: [], ...extra });

test('a passkey profile and its data are there after a redeploy, and the session still holds', { skip }, async t => {
  const schema = newSchema(t);
  const a = await instance(t, schema);
  const up = await signUp(a, 'Andrii');
  assert.equal(up.status, 200, up.text);
  assert.equal(up.body.user.admin, true, 'the first profile is the owner');
  const put = await a.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile({ workouts: [{ id: 'w1', d: '2026-11-20', name: 'Push day' }] }), baseRev: 0 } });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.body.rev, 1);
  a.kill();   // the deployment is replaced: nothing of that instance's disk is left

  const b = await instance(t, schema);
  const me = await b.req('GET', '/api/me', { cookie: up.cookie });
  assert.equal(me.status, 200, 'the cookie signed before the redeploy is still good');
  assert.equal(me.body.user?.name ?? me.body.name, 'Andrii');
  const got = await b.req('GET', '/api/data', { cookie: up.cookie });
  assert.equal(got.status, 200);
  assert.equal(got.body.rev, 1);
  assert.equal(got.body.state.workouts[0].id, 'w1');
  assert.equal(got.body.state.routines[0].name, 'Push day');
  // and the passkey made before the redeploy signs in on the new instance
  const again = await signIn(b, up.passkey);
  assert.equal(again.status, 200, again.text);
});

test('two instances at once: each reads what the other wrote, and a stale write is a 409 with the current document', { skip }, async t => {
  const schema = newSchema(t);
  const a = await instance(t, schema);
  const up = await signUp(a, 'Andrii');
  const b = await instance(t, schema);
  const first = await a.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile(), baseRev: 0 } });
  assert.equal(first.body.rev, 1);
  // the phone, on the other instance, read revision 1 and logs a workout
  const phone = await b.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile({ workouts: [{ id: 'w-phone', d: '2026-11-21', name: 'Push day' }] }), baseRev: 1 } });
  assert.equal(phone.status, 200, phone.text);
  assert.equal(phone.body.rev, 2);
  // the laptop, on the first instance, still holds revision 1
  const laptop = await a.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile({ bodyweight: [{ d: '2026-11-21', kg: 80 }] }), baseRev: 1 } });
  assert.equal(laptop.status, 409, 'the stale write is refused, not stored over the phone\'s');
  assert.equal(laptop.body.rev, 2);
  assert.equal(laptop.body.state.workouts[0].id, 'w-phone', 'and it gets the current document to merge with');
  const rev = await a.req('GET', '/api/data/rev', { cookie: up.cookie });
  assert.equal(rev.body.rev, 2);
});

test('many writes of one revision from two instances: exactly one is stored', { skip }, async t => {
  const schema = newSchema(t);
  const a = await instance(t, schema);
  const up = await signUp(a, 'Andrii');
  const b = await instance(t, schema);
  await a.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile(), baseRev: 0 } });
  await b.req('GET', '/api/data/rev', { cookie: up.cookie });
  const tries = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    (i % 2 ? a : b).req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile({ workouts: [{ id: 'w' + i, d: '2026-11-21', name: 'x' }] }), baseRev: 1 } })));
  const ok = tries.filter(r => r.status === 200), refused = tries.filter(r => r.status === 409);
  assert.equal(ok.length, 1, tries.map(r => r.status).join(','));
  assert.equal(refused.length, 11);
  const end = await a.req('GET', '/api/data', { cookie: up.cookie });
  assert.equal(end.body.rev, 2);
  assert.equal(end.body.state.workouts.length, 1);
});

test('the first profile is the owner; after it a new profile needs an invite', { skip }, async t => {
  const schema = newSchema(t);
  const a = await instance(t, schema);
  assert.equal((await a.req('GET', '/api/config')).body.invite_only, false, 'an empty instance lets its owner in');
  const owner = await signUp(a, 'Andrii');
  assert.equal(owner.body.user.admin, true);
  assert.equal((await a.req('GET', '/api/config')).body.invite_only, true);
  const stranger = await signUp(a, 'Stranger');
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body.code, 'invite');
  // the owner's session outlived the restart that closed the door, and the owner can invite
  const invite = await a.req('POST', '/api/admin/invites/new', { cookie: owner.cookie, body: {} });
  assert.equal(invite.status, 200, invite.text);
  const code = invite.body.code || invite.body.invite?.code;
  assert.ok(code, invite.text);
  const guest = await signUp(a, 'Friend', softPasskey(ORIGIN), code);
  assert.equal(guest.status, 200, guest.text);
  assert.notEqual(guest.body.user.admin, true);
  // a fresh instance comes up closed as well
  const b = await instance(t, schema);
  assert.equal((await b.req('GET', '/api/config')).body.invite_only, true);
});

test('the phone app (and its Apple Watch) pairs with a code and then syncs with a token, from its own origin', { skip }, async t => {
  const a = await instance(t, newSchema(t));
  const up = await signUp(a, 'Andrii');
  await a.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile(), baseRev: 0 } });
  // Settings → Account → "Pair the mobile app": confirmed with the passkey, then a code on screen
  const opt = await a.req('POST', '/api/login/options', { body: {} });
  const made = await a.req('POST', '/api/pair/create', { cookie: up.cookie, body: { cid: opt.body.cid, credential: up.passkey.assertion(opt.body.options.challenge) } });
  assert.equal(made.status, 200, made.text);
  // the app is not a page of this site: its requests come from the WebView's origin, with no cookie
  const APP = 'capacitor://localhost';
  const pre = await a.req('OPTIONS', '/api/pair/redeem', { headers: { Origin: APP, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, authorization' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), APP);
  const paired = await a.req('POST', '/api/pair/redeem', { body: { code: made.body.code }, headers: { Origin: APP } });
  assert.equal(paired.status, 200, paired.text);
  assert.equal(paired.headers.get('access-control-allow-origin'), APP);
  const bearer = { Origin: APP, Authorization: 'Bearer ' + paired.body.token };
  const got = await a.req('GET', '/api/data', { headers: bearer });
  assert.equal(got.status, 200, got.text);
  assert.equal(got.body.rev, 1);
  // a workout ticked off on the watch reaches the server through the phone, and the browser sees it
  const put = await a.req('PUT', '/api/data', { headers: bearer, body: { state: profile({ workouts: [{ id: 'w-watch', d: '2026-11-21', name: 'Push day' }] }), baseRev: 1 } });
  assert.equal(put.status, 200, put.text);
  assert.equal((await a.req('GET', '/api/data', { cookie: up.cookie })).body.state.workouts[0].id, 'w-watch');
  // and the token is still good on another copy of the function (after a redeploy)
  const b = await instance(t, a.schema);
  assert.equal((await b.req('GET', '/api/data/rev', { headers: bearer })).body.rev, 2);
});

test('a preview and production do not see each other\'s data', { skip }, async t => {
  const prod = await instance(t, newSchema(t));
  const preview = await instance(t, newSchema(t));
  const up = await signUp(prod, 'Andrii');
  assert.equal((await prod.req('GET', '/api/health')).body.users, 1);
  assert.equal((await preview.req('GET', '/api/health')).body.users, 0);
  assert.equal((await preview.req('GET', '/api/me', { cookie: up.cookie })).body.user ?? null, null, 'a production session is nothing to a preview');
});

test('the version a file had on an earlier day is kept as that day\'s snapshot, and a backup can be restored', { skip }, async t => {
  const schema = newSchema(t);
  const a = await instance(t, schema);
  const up = await signUp(a, 'Andrii');
  await a.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile({ workouts: [{ id: 'monday', d: '2026-11-16', name: 'x' }] }), baseRev: 0 } });
  // as if that was written two days ago
  await sql(`UPDATE "${schema}".files SET updated_at = now() - interval '2 days'`);
  await a.req('PUT', '/api/data', { cookie: up.cookie, body: { state: profile({ workouts: [] }), baseRev: 1 } });   // the history is wiped by mistake
  const snaps = await sql(`SELECT day::text AS day, path, convert_from(content, 'UTF8') AS text FROM "${schema}".snapshots WHERE path LIKE 'state-%'`);
  assert.equal(snaps.rows.length, 1);
  assert.match(snaps.rows[0].text, /monday/);

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-backup-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const env = { ...process.env, BLACKGYM_DATABASE_URL: DB };
  const cli = (script, ...args) => execFileSync(process.execPath, [path.join(HERE, '..', 'scripts', script), '--schema', schema, ...args], { env, encoding: 'utf8' });
  assert.match(cli('backup.mjs', '--list'), new RegExp(snaps.rows[0].day));
  cli('backup.mjs', '--day', snaps.rows[0].day, '--out', out);
  assert.ok(fs.existsSync(path.join(out, 'db.json')), 'the backup is an openGym data folder');
  assert.ok(fs.existsSync(path.join(out, 'secret')));
  assert.match(cli('restore.mjs', '--from', out), /Nothing changed/);
  cli('restore.mjs', '--from', out, '--yes');
  // the running instance notices and serves the restored history, with the same session
  const back = await a.req('GET', '/api/data', { cookie: up.cookie });
  assert.equal(back.status, 200, back.text);
  assert.equal(back.body.state.workouts[0].id, 'monday');
});

test('the reminder tick answers, and not more often than once a minute', { skip }, async t => {
  const a = await instance(t, newSchema(t), { BLACKGYM_TICK_WAIT_MS: '50' });
  const one = await a.req('GET', '/api/cron/tick');
  assert.equal(one.status, 200, one.text);
  assert.deepEqual(one.body, { ok: true });
  assert.equal((await a.req('GET', '/api/cron/tick')).body.skipped, true);
  const guarded = await instance(t, newSchema(t), { CRON_SECRET: 's3cret', BLACKGYM_TICK_WAIT_MS: '50' });
  assert.equal((await guarded.req('GET', '/api/cron/tick')).status, 401);
  assert.equal((await guarded.req('GET', '/api/cron/tick', { headers: { Authorization: 'Bearer s3cret' } })).status, 200);
});

test('a forged CF-Connecting-IP never reaches the API, and the database address is not in the API\'s environment', { skip }, async t => {
  const a = await instance(t, newSchema(t), { AUDIT_LOG: '1', AUDIT_IP: 'full' });
  await a.req('POST', '/api/login/verify', { body: { cid: 'none' }, headers: { 'CF-Connecting-IP': '203.0.113.99', 'X-Real-IP': '198.51.100.7' } });
  const audit = fs.readdirSync(a.dataDir).filter(f => /audit/i.test(f)).map(f => fs.readFileSync(path.join(a.dataDir, f), 'utf8')).join('\n');
  assert.match(audit, /198\.51\.100\.7/, 'the address the platform reported is the one on record');
  assert.doesNotMatch(audit, /203\.0\.113\.99/);
  if (!fs.existsSync('/proc/self/environ')) return;
  // the API is the process whose environment names this instance's data directory as DATA_DIR
  const envs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d)).map(d => { try { return fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { return ''; } });
  const api = envs.filter(e => e.split('\0').includes(`DATA_DIR=${a.dataDir}`));
  assert.equal(api.length, 1);
  assert.ok(!api[0].includes(DB), 'the connection string stays with the function');
  assert.doesNotMatch(api[0], /(^|\0)(BLACKGYM_DATABASE_URL|DATABASE_URL|POSTGRES_URL)=/);
});

test('without a database the API says so instead of pretending to save', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-nodb-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const env = { ...process.env, PORT: '0', BLACKGYM_DATA_DIR: dataDir, BLACKGYM_SERVER_DIR: path.join(HERE, '..', '..', 'api'), BLACKGYM_STATIC_DIR: os.tmpdir() };
  for (const k of ['BLACKGYM_DATABASE_URL', 'DATABASE_URL', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING']) delete env[k];
  const child = spawn(process.execPath, ['dev-server.mjs'], { cwd: path.join(HERE, '..'), stdio: ['ignore', 'pipe', 'inherit'], env });
  t.after(() => child.kill('SIGKILL'));
  const port = await new Promise(resolve => child.stdout.on('data', d => { const m = /on :(\d+)/.exec(String(d)); if (m) resolve(+m[1]); }));
  const r = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'no-database');
  assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })).status, 503);
});
