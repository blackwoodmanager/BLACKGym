/* The data directory, kept in PostgreSQL.
 *
 * openGym's API keeps everything in files under DATA_DIR (db.json, state-<uid>.json, secret,
 * vapid.json, uploads/...), read and written synchronously. A Vercel function has no disk that
 * outlives it, so this module makes one table stand in for that directory:
 *
 *   files(path, content, sha256, size, version, updated_at)   one row per file
 *   meta(gen)                                                  moves on every committed change
 *   snapshots(day, path, ...)                                  what a file held at the end of a day
 *
 * One request is one transaction:
 *
 *   begin()   BEGIN, then an advisory lock. Only one request at a time, across every running
 *             instance of the function, is between begin() and commit().
 *   pull()    if `gen` moved since this instance last looked, another instance wrote: fetch what
 *             differs into the local directory. The caller restarts the API then, because the
 *             API holds db.json in memory.
 *   push()    after the API answered: every file that changed locally goes into the table.
 *   commit()  only now may the answer leave. "Saved" is never said for something that is not.
 *
 * The API's own compare-and-write on a profile's revision (409 on a stale baseRev) is atomic
 * "for this process"; the lock is what makes it atomic for every instance.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const LOCK_CLASS = 815;                 // first key of the two-key advisory lock; the second is the schema
const MAX_FILE = 48 * 1024 * 1024;      // nothing the API writes comes near; refuse rather than half-store
const FETCH_BATCH = 24 * 1024 * 1024;   // bytes of content asked for in one query
const SNAPSHOT_SKIP = /^uploads\//;     // content-addressed media: large, and never rewritten

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** What in the directory is not data: files in flight, the API's second copy of db.json (the
 *  table is transactional, so the reason for that copy does not exist here), copies kept aside. */
export function ignored(rel) {
  if (rel === 'db.json.bak') return true;
  if (rel.endsWith('.tmp') || rel.endsWith('.sock')) return true;
  if (/\.unreadable-\d+$/.test(rel)) return true;
  return rel.split('/').includes('.tmp');
}

export function schemaName(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]{0,48}$/.test(s)) throw new Error(`invalid schema name "${v}"`);
  return s;
}

export function createStore({ connectionString, schema, dataDir, snapshotDays = 30, log = console }) {
  schema = schemaName(schema);
  const q = name => `"${schema}"."${name}"`;
  const pool = new pg.Pool({
    connectionString,
    max: 1,                        // requests are serialised in the instance, so one is all that is used
    idleTimeoutMillis: 20000,      // let go before the platform suspends the instance
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
  });
  // A connection the server closed while idle. The next connect() opens a new one.
  pool.on('error', e => log.warn('[store] idle connection lost:', e.message));

  let ready = false;               // schema known to exist
  let localGen = null;             // the `gen` this directory corresponds to; null = nothing local yet
  let prunedDay = '';
  const known = new Map();         // rel path -> { sha, size, mtimeMs, ino }

  /* ---------- the local directory ---------- */

  function walk(dir, rel, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (e.name !== '.tmp') walk(path.join(dir, e.name), r, out); continue; }
      if (!e.isFile() || ignored(r)) continue;
      out.push(r);
    }
  }

  /** Every data file as it is now: rel -> { sha, size, mtimeMs, ino, buf? }. A file whose size,
   *  mtime and inode are the ones seen last time is not read again. */
  function scan() {
    const rels = [];
    walk(dataDir, '', rels);
    const out = new Map();
    for (const rel of rels) {
      const abs = path.join(dataDir, rel);
      let st;
      try { st = fs.statSync(abs); } catch { continue; }       // gone between readdir and stat
      const k = known.get(rel);
      if (k && k.size === st.size && k.mtimeMs === st.mtimeMs && k.ino === st.ino) { out.set(rel, k); continue; }
      if (st.size > MAX_FILE) throw new Error(`${rel} is ${st.size} bytes, more than this store keeps`);
      let buf;
      try { buf = fs.readFileSync(abs); } catch { continue; }
      out.set(rel, { sha: sha256(buf), size: buf.length, mtimeMs: st.mtimeMs, ino: st.ino, buf });
    }
    return out;
  }

  function writeLocal(rel, buf) {
    const abs = path.join(dataDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = abs + '.pull.tmp';
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, abs);
    const st = fs.statSync(abs);
    known.set(rel, { sha: sha256(buf), size: buf.length, mtimeMs: st.mtimeMs, ino: st.ino });
  }

  function removeLocal(rel) {
    try { fs.unlinkSync(path.join(dataDir, rel)); } catch { /* already gone */ }
    known.delete(rel);
  }

  /** Forget everything local. The next pull() fetches the whole directory again. */
  function reset() {
    known.clear();
    localGen = null;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* nothing there */ }
    fs.mkdirSync(dataDir, { recursive: true });
  }

  /* ---------- the table ---------- */

  async function ensureSchema(c) {
    if (ready) return;
    const { rows } = await c.query('SELECT to_regclass($1) AS t', [`${schema}.snapshots`]);
    if (!rows[0].t) {
      await c.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${q('files')} (
        path text PRIMARY KEY,
        content bytea NOT NULL,
        sha256 text NOT NULL,
        size integer NOT NULL,
        version bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now())`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${q('meta')} (
        id integer PRIMARY KEY CHECK (id = 1),
        gen bigint NOT NULL)`);
      await c.query(`INSERT INTO ${q('meta')} (id, gen) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${q('snapshots')} (
        day date NOT NULL,
        path text NOT NULL,
        content bytea NOT NULL,
        sha256 text NOT NULL,
        size integer NOT NULL,
        version bigint NOT NULL,
        PRIMARY KEY (day, path))`);
    }
    ready = true;
  }

  /** BEGIN and the lock. Returns the transaction the other calls take. */
  async function begin() {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // A request that waits longer than this for the lock answers 503 and the app tries again.
      await c.query("SET LOCAL lock_timeout = '25s'");
      // An instance that died holding the lock must not hold it for long.
      await c.query("SET LOCAL idle_in_transaction_session_timeout = '150s'");
      await c.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [LOCK_CLASS, schema]);
      await ensureSchema(c);
      return { c, done: false };
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch { /* connection is gone */ }
      c.release(e);
      throw e;
    }
  }

  /** Bring the local directory to what the table holds. → true when a file changed locally. */
  async function pull(tx) {
    const { rows: [meta] } = await tx.c.query(`SELECT gen FROM ${q('meta')} WHERE id = 1`);
    const gen = String(meta.gen);
    if (localGen === gen) return false;
    const fresh = localGen === null;
    if (fresh) { known.clear(); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* none */ } fs.mkdirSync(dataDir, { recursive: true }); }
    // What is here now, changes a timer made after the last request included: with another
    // instance's write in the table those lose, the table is what every instance agrees on.
    const local = scan();
    const { rows } = await tx.c.query(`SELECT path, sha256, size FROM ${q('files')}`);
    const remote = new Map(rows.map(r => [r.path, r]));
    const want = rows.filter(r => local.get(r.path)?.sha !== r.sha256);
    let changed = 0;
    for (let i = 0; i < want.length;) {
      const batch = []; let bytes = 0;
      while (i < want.length && (batch.length === 0 || bytes + want[i].size <= FETCH_BATCH)) { bytes += want[i].size; batch.push(want[i].path); i++; }
      const got = await tx.c.query(`SELECT path, content FROM ${q('files')} WHERE path = ANY($1)`, [batch]);
      for (const r of got.rows) { writeLocal(r.path, r.content); changed++; }
    }
    for (const [rel, f] of local) {
      const r = remote.get(rel);
      if (!r) { removeLocal(rel); changed++; continue; }
      // Already what the table holds (the ones that were not have just been written above).
      if (f.sha === r.sha256) known.set(rel, { sha: f.sha, size: f.size, mtimeMs: f.mtimeMs, ino: f.ino });
    }
    for (const rel of [...known.keys()]) if (!remote.has(rel)) known.delete(rel);
    localGen = gen;
    if (!fresh && changed) log.log(`[store] another instance wrote: ${changed} file(s) refreshed, gen ${gen}`);
    return fresh ? true : changed > 0;
  }

  /** Write what changed locally into the table. → { changed, apply }: call apply() once the
   *  transaction is committed, so a failed commit leaves this instance knowing it is behind. */
  async function push(tx) {
    const local = scan();
    const writes = [], deletes = [];
    for (const [rel, f] of local) if (known.get(rel)?.sha !== f.sha) writes.push([rel, f]);
    for (const rel of known.keys()) if (!local.has(rel)) deletes.push(rel);
    const refresh = () => { for (const [rel, f] of local) known.set(rel, { sha: f.sha, size: f.size, mtimeMs: f.mtimeMs, ino: f.ino }); };
    if (!writes.length && !deletes.length) return { changed: 0, apply: refresh };

    const touched = [...writes.map(w => w[0]), ...deletes].filter(p => !SNAPSHOT_SKIP.test(p));
    if (touched.length && snapshotDays > 0) {
      // The version being replaced is the last one of the day it was written on: keep it as that
      // day's snapshot. A file rewritten many times a day leaves one row per day, not one per write.
      await tx.c.query(
        `INSERT INTO ${q('snapshots')} (day, path, content, sha256, size, version)
           SELECT (updated_at AT TIME ZONE 'UTC')::date, path, content, sha256, size, version
             FROM ${q('files')}
            WHERE path = ANY($1) AND ((updated_at AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date OR path = ANY($2))
         ON CONFLICT (day, path) DO UPDATE
           SET content = EXCLUDED.content, sha256 = EXCLUDED.sha256, size = EXCLUDED.size, version = EXCLUDED.version`,
        [touched, deletes.filter(p => !SNAPSHOT_SKIP.test(p))]);
    }
    const { rows: [m] } = await tx.c.query(`UPDATE ${q('meta')} SET gen = gen + 1 WHERE id = 1 RETURNING gen`);
    const gen = String(m.gen);
    for (const [rel, f] of writes) {
      const buf = f.buf || fs.readFileSync(path.join(dataDir, rel));
      await tx.c.query(
        `INSERT INTO ${q('files')} (path, content, sha256, size, version, updated_at) VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (path) DO UPDATE SET content = EXCLUDED.content, sha256 = EXCLUDED.sha256, size = EXCLUDED.size,
           version = EXCLUDED.version, updated_at = now()`,
        [rel, buf, f.sha, f.size, gen]);
    }
    if (deletes.length) await tx.c.query(`DELETE FROM ${q('files')} WHERE path = ANY($1)`, [deletes]);
    const today = new Date().toISOString().slice(0, 10);
    if (snapshotDays > 0 && prunedDay !== today) {
      await tx.c.query(`DELETE FROM ${q('snapshots')} WHERE day < (now() AT TIME ZONE 'UTC')::date - $1::int`, [snapshotDays]);
      prunedDay = today;
    }
    return {
      changed: writes.length + deletes.length,
      apply: () => { refresh(); for (const rel of deletes) known.delete(rel); localGen = gen; },
    };
  }

  async function commit(tx) {
    if (tx.done) return;
    tx.done = true;
    try { await tx.c.query('COMMIT'); tx.c.release(); }
    catch (e) { tx.c.release(e); throw e; }
  }

  async function rollback(tx) {
    if (tx.done) return;
    tx.done = true;
    try { await tx.c.query('ROLLBACK'); tx.c.release(); }
    catch (e) { tx.c.release(e); }
  }

  return {
    begin, pull, push, commit, rollback, reset,
    get gen() { return localGen; },
    /** The bytes of a data file as this instance has it (after pull), or null. */
    read(rel) { try { return fs.readFileSync(path.join(dataDir, rel)); } catch { return null; } },
    shaOf(rel) { return known.get(rel)?.sha || null; },
    end: () => pool.end(),
  };
}
