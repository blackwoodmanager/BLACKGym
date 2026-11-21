/* BlackGym on Vercel: the function behind /api.
 *
 * It does not reimplement anything. It starts openGym's own api/server.js (child.mjs), hands each
 * request to it, and keeps the directory that server reads and writes in PostgreSQL (store.mjs).
 * Read vercel/README.md for the why; this file is the order things happen in:
 *
 *   1. take the lock and bring the local data directory up to date
 *   2. (re)start the API when its files changed under it, or its settings did
 *   3. pass the request on and keep the whole answer
 *   4. write what the API changed into the table and commit
 *   5. only then send the answer
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, schemaName } from './store.mjs';
import { createChild } from './child.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const E = process.env;
const SERVER_DIR = E.BLACKGYM_SERVER_DIR || path.join(HERE, 'server');
const DATA_DIR = E.BLACKGYM_DATA_DIR || path.join(os.tmpdir(), 'blackgym-data');
// The integration that adds a Postgres database to a Vercel project sets one of these.
const DB_URL = E.BLACKGYM_DATABASE_URL || E.DATABASE_URL || E.POSTGRES_URL || E.DATABASE_URL_UNPOOLED || E.POSTGRES_URL_NON_POOLING || '';
// Production and previews never share data: a preview is where a change is tried out.
const ENV_NAME = E.VERCEL_ENV || 'development';
const SCHEMA = schemaName(E.BLACKGYM_DB_SCHEMA || `blackgym_${ENV_NAME}`);
// Who may make a profile. 'owner' (default): the first profile becomes the owner and admin, and
// from then on a new profile needs an invite the owner made. 'open': anyone. 'invite': always.
const SIGNUP = ['owner', 'open', 'invite'].includes(E.BLACKGYM_SIGNUP) ? E.BLACKGYM_SIGNUP : 'owner';
const MAX_BODY = 6 * 1024 * 1024;          // the platform stops a request at 4.5 MB before this
const FORWARD_TIMEOUT_MS = 280000;
const KEEP_ALIVE_MAX_MS = Math.max(0, +(E.BLACKGYM_KEEP_ALIVE_MAX_SEC || 280)) * 1000;
const TICK_WAIT_MS = Math.max(0, +(E.BLACKGYM_TICK_WAIT_MS || 12000));
const TICK_EVERY_MS = 60000;

const store = DB_URL ? createStore({
  connectionString: DB_URL, schema: SCHEMA, dataDir: DATA_DIR,
  snapshotDays: Math.max(0, +(E.BLACKGYM_SNAPSHOT_DAYS || 30) || 0),
}) : null;
const child = createChild({ serverDir: SERVER_DIR });

/* ---------- one request at a time in this instance ---------- */
let chain = Promise.resolve();
function exclusive(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

/* ---------- the API's environment ---------- */

// Nothing the API needs, and nothing a bug in it should be able to print.
const WITHHELD = /^(BLACKGYM_DATABASE_URL|DATABASE_URL|POSTGRES_|PG[A-Z]+$|NEON_|CRON_SECRET$|VERCEL_OIDC_TOKEN$|VERCEL_AUTOMATION_BYPASS_SECRET$|BLOB_|KV_|AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)$)/;
// By name, and by what it holds: a connection string under any other name stays here as well.
const BASE_ENV = Object.fromEntries(Object.entries(E).filter(([k, v]) =>
  !WITHHELD.test(k) && !/^postgres(ql)?:\/\//i.test(String(v)) && !(DB_URL && String(v).includes(DB_URL))));
const on = v => /^(1|true|yes|on)$/i.test(String(v || ''));

/** The address the app is opened at, which passkeys and the cross-site check are bound to.
 *  Production: ORIGIN, else the project's production domain. A preview has a different address
 *  per branch and per deployment, so there it is the address the request came to. */
function originFor(host) {
  if (E.ORIGIN) return E.ORIGIN.replace(/\/+$/, '');
  if (ENV_NAME === 'production' && E.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + E.VERCEL_PROJECT_PRODUCTION_URL;
  if (host) return (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http://' : 'https://') + host;
  return 'http://localhost:8080';
}

let usersSeen = { key: '', n: 0 };
function userCount() {
  const file = path.join(DATA_DIR, 'db.json');
  let st;
  try { st = fs.statSync(file); } catch { return 0; }
  const key = `${st.size}:${st.mtimeMs}:${st.ino}`;
  if (usersSeen.key === key) return usersSeen.n;
  let n = 0;
  try { n = (JSON.parse(fs.readFileSync(file, 'utf8')).users || []).length; } catch { n = 1; }   // unreadable: stay closed
  usersSeen = { key, n };
  return n;
}

function childEnv(host) {
  const origin = originFor(host);
  const inviteOnly = SIGNUP === 'invite' || (SIGNUP === 'owner' && userCount() > 0) || (SIGNUP === 'open' && on(E.INVITE_ONLY));
  const env = {
    // What the platform allows, so the app says so instead of failing at 4.5 MB (README, limits).
    MEDIA_VIDEO_MAX_MB: '4', MEDIA_GIF_MAX_MB: '4', MEDIA_QUOTA_MB: '100',
    // /tmp is about 500 MB in all; the API's own floor of 512 MB free would refuse every upload.
    MEDIA_MIN_FREE_MB: '32',
    // The activity log is one file, stored again whenever a line is added: keep it small.
    AUDIT_MAX: '1000',
    RP_NAME: 'BlackGym',
    NODE_ENV: 'production',
    ...BASE_ENV,
    PORT: '0',
    DATA_DIR,
    ADMIN_SOCKET_DIR: path.join(os.tmpdir(), 'blackgym-admin'),
    ORIGIN: origin,
    RP_ID: E.RP_ID || new URL(origin).hostname,
    // The platform overwrites X-Forwarded-For with the address it saw; see forward() for the rest.
    TRUST_PROXY: '1',
    FIRST_USER_ADMIN: E.FIRST_USER_ADMIN ?? (SIGNUP === 'owner' ? '1' : ''),
    INVITE_ONLY: inviteOnly ? '1' : '',
  };
  return { env, key: JSON.stringify([origin, env.RP_ID, env.INVITE_ONLY, env.FIRST_USER_ADMIN]) };
}

/* ---------- passing a request on ---------- */

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'expect', 'proxy-connection', 'te', 'trailer']);

function forward(port, { method, target, headers, body, ip }) {
  const h = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (HOP.has(key) || key === 'content-length') continue;
    // The API believes this one before any other when it asks where a request came from. Only
    // Cloudflare may set it, and Cloudflare is not in front here: anyone could have sent it.
    if (key === 'cf-connecting-ip') continue;
    h[key] = v;
  }
  if (ip) { h['x-forwarded-for'] = ip; h['x-real-ip'] = ip; }
  if (body.length || !['GET', 'HEAD', 'OPTIONS'].includes(method)) h['content-length'] = String(body.length);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers: h }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(FORWARD_TIMEOUT_MS, () => req.destroy(new Error('the API took too long to answer')));
    req.on('error', reject);
    req.end(body);
  });
}

/** One locked round: refresh, make sure the API runs, optionally serve a request, store, commit. */
async function cycle({ host, request = null }) {
  const tx = await store.begin();
  try {
    if (await store.pull(tx)) child.stop();
    const { env, key } = childEnv(host);
    const port = await child.ensure(env, key);
    const out = request ? await forward(port, request) : null;
    const pushed = await store.push(tx);
    await store.commit(tx);
    pushed.apply();
    return out;
  } catch (e) {
    await store.rollback(tx);
    // Whatever the API wrote for this request is not in the table. Start over from the table.
    child.stop();
    store.reset();
    throw e;
  }
}

/* ---------- work after the answer ---------- */

function waitUntil(promise) {
  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctx?.waitUntil) ctx.waitUntil(promise);
}

let lastHost = '';
async function settle() {
  try { await exclusive(() => cycle({ host: lastHost })); }
  catch (e) { console.error('[blackgym] background store failed:', e.message); }
}

// The API keeps a rest timer in memory and sends the push when it runs out. The platform would
// suspend the function once the answer is out, and the push would never be sent: so the function
// asks to stay awake until the timer is due. As long as the platform allows, see README.
const holds = new Set();
function hold(ms) {
  if (!(ms > 0)) return;
  const h = {};
  const done = new Promise(resolve => { h.release = resolve; h.timer = setTimeout(resolve, Math.min(ms, KEEP_ALIVE_MAX_MS)); });
  holds.add(h);
  waitUntil(done.then(() => { holds.delete(h); clearTimeout(h.timer); return settle(); }));
}
function releaseHolds() { for (const h of holds) h.release(); }

function afterAnswer(method, pathname, body, out) {
  if (method !== 'POST' || !out || out.status !== 200) return;
  if (pathname === '/api/push/rest-timer') {
    let sec = 0;
    try { sec = Number(JSON.parse(body.toString('utf8')).seconds) || 0; } catch { /* the API refused it too */ }
    hold(Math.min(3600, Math.round(sec)) * 1000 + 4000);
  } else if (pathname === '/api/push/rest-timer/cancel') {
    releaseHolds();
  }
}

/* ---------- small pieces ---------- */

function send(res, status, obj, headers = {}) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': body.length, ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** The path the browser asked for. A rewrite hands it over in `__p` in case the platform passes
 *  the function its own path instead (build.mjs writes the rewrite). */
function targetOf(req) {
  const u = new URL(req.url, 'http://x');
  const p = u.searchParams.get('__p');
  u.searchParams.delete('__p');
  const own = req.url.split('?')[0];
  const pathname = (own === '/api' || own === '/api/index') && p ? p : own;
  const qs = u.searchParams.toString();
  return { pathname, target: pathname + (qs ? '?' + qs : '') };
}

const clientIp = req => String(req.headers['x-real-ip'] || '').trim()
  || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  || '';

/* ---------- the reminder tick ---------- */

// The API looks every ten seconds whether a workout-day reminder or a nudge is due. It can only
// look while it runs, and on this platform it runs while a request does. Something outside has to
// call this address every few minutes (README: reminders); it wakes the API, waits one look, and
// stores what the API noted about what it sent.
let lastTick = 0;
async function tick(req, res) {
  if (E.CRON_SECRET && req.headers.authorization !== `Bearer ${E.CRON_SECRET}`) return send(res, 401, { error: 'not allowed' });
  const now = Date.now();
  if (now - lastTick < TICK_EVERY_MS) return send(res, 200, { ok: true, skipped: true });
  lastTick = now;
  const host = lastHost || String(req.headers['x-forwarded-host'] || req.headers.host || '');
  await exclusive(() => cycle({ host }));
  await new Promise(r => setTimeout(r, TICK_WAIT_MS));
  await exclusive(() => cycle({ host }));
  send(res, 200, { ok: true });
}

/* ---------- the handler ---------- */

export default async function handler(req, res) {
  let pathname = '';
  try {
    const t = targetOf(req);
    pathname = t.pathname;
    // The optional MCP server is a container of its own in openGym and is not part of this
    // deployment. The same answer openGym's web server gives when that container is not running.
    if (pathname === '/mcp') {
      return send(res, 503, { jsonrpc: '2.0', error: { code: -32000, message: 'MCP is not running on this server' }, id: null });
    }
    if (!store) {
      return send(res, 503, { error: 'storage is not configured: this deployment has no database connected', code: 'no-database' });
    }
    if (pathname === '/api/cron/tick') return await tick(req, res);

    const body = await readBody(req);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    lastHost = host;
    const request = { method: req.method, target: t.target, headers: req.headers, body, ip: clientIp(req) };
    const out = await exclusive(() => cycle({ host, request }));

    const headers = {};
    for (const [k, v] of Object.entries(out.headers)) if (!HOP.has(k) && k !== 'content-length') headers[k] = v;
    headers['content-length'] = String(out.body.length);
    res.writeHead(out.status, headers);
    res.end(req.method === 'HEAD' ? undefined : out.body);
    afterAnswer(req.method, pathname, body, out);
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch { /* closed */ } return; }
    if (e?.status === 413) return send(res, 413, { error: 'request too large' });
    console.error('[blackgym]', req.method, pathname, e?.message || e);
    // 503 and not 500: nothing was stored, and the app keeps what it wanted to save and tries again.
    send(res, 503, { error: 'the server could not store this right now, try again in a moment', code: 'storage' }, { 'Retry-After': '2' });
  }
}
