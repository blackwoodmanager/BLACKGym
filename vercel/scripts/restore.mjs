#!/usr/bin/env node
/* Puts a folder made by backup.mjs (or the ./data of a self-hosted openGym) into the database,
 * replacing what is there. The running app picks it up on its next request.
 *
 *   DATABASE_URL=... node scripts/restore.mjs --from ./backups/blackgym_production-2026-11-20 --yes
 *   ... --schema blackgym_preview     into a preview's data instead of production's
 *
 * Without --yes it only says what it would do. What it replaces is kept as today's snapshot, so
 * a restore can itself be undone with `backup.mjs --day <today>` and another restore.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connect, lock, options } from './lib.mjs';
import { ignored } from '../function/store.mjs';

const opts = options();
if (typeof opts.from !== 'string') { console.error('--from <folder> is required'); process.exit(2); }
const from = path.resolve(opts.from);
const files = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else if (e.isFile() && !ignored(r)) files.push(r);
  }
})(from, '');
if (!files.includes('db.json')) { console.error(`${from} has no db.json: not an openGym data folder`); process.exit(2); }

const { client, schema, q } = await connect(opts);
try {
  const { rows: [{ n }] } = await client.query(`SELECT count(*)::int AS n FROM ${q('files')}`);
  console.log(`${schema}: ${n} file(s) now, ${files.length} in ${from}`);
  if (!opts.yes) { console.log('Nothing changed. Add --yes to replace the data.'); process.exit(0); }
  await client.query('BEGIN');
  await lock(client, schema);
  await client.query(
    `INSERT INTO ${q('snapshots')} (day, path, content, sha256, size, version)
       SELECT (now() AT TIME ZONE 'UTC')::date, path, content, sha256, size, version FROM ${q('files')} WHERE path NOT LIKE 'uploads/%'
     ON CONFLICT (day, path) DO UPDATE SET content = EXCLUDED.content, sha256 = EXCLUDED.sha256, size = EXCLUDED.size, version = EXCLUDED.version`);
  const { rows: [{ gen }] } = await client.query(`UPDATE ${q('meta')} SET gen = gen + 1 WHERE id = 1 RETURNING gen`);
  await client.query(`DELETE FROM ${q('files')}`);
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(from, rel));
    await client.query(`INSERT INTO ${q('files')} (path, content, sha256, size, version) VALUES ($1, $2, $3, $4, $5)`,
      [rel, buf, crypto.createHash('sha256').update(buf).digest('hex'), buf.length, gen]);
  }
  await client.query('COMMIT');
  console.log(`Restored ${files.length} file(s) into ${schema}.`);
} catch (e) {
  try { await client.query('ROLLBACK'); } catch { /* not in a transaction */ }
  throw e;
} finally { await client.end(); }
