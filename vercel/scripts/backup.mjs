#!/usr/bin/env node
/* Copies the data out of the database into a folder.
 *
 * The folder is an ordinary openGym data directory (db.json, state-<uid>.json, secret, ...): it
 * can be kept as a backup, put back with restore.mjs, or used as `./data` of a self-hosted
 * openGym, so the data is never tied to this hosting.
 *
 *   DATABASE_URL=... node scripts/backup.mjs                       today's data → ./backups/<time>/
 *   DATABASE_URL=... node scripts/backup.mjs --out ./my-backup
 *   DATABASE_URL=... node scripts/backup.mjs --list                which days have a snapshot
 *   DATABASE_URL=... node scripts/backup.mjs --day 2026-11-20      the data as it was at the end of that day
 *   ... --schema blackgym_preview                                  a preview's data instead of production's
 *
 * A snapshot keeps the last version a file had on a day it was changed, for 30 days
 * (BLACKGYM_SNAPSHOT_DAYS). Photos of your own exercises are in the backup of today's data only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, options } from './lib.mjs';

const opts = options();
const { client, schema, q } = await connect(opts);
try {
  if (opts.list) {
    const { rows } = await client.query(`SELECT day::text AS day, count(*)::int AS files, sum(size)::bigint AS bytes FROM ${q('snapshots')} GROUP BY day ORDER BY day DESC`);
    if (!rows.length) console.log('No snapshots yet: one is made the first time a file changes on a later day.');
    for (const r of rows) console.log(`${r.day}  ${r.files} file(s), ${Math.round(r.bytes / 1024)} KB`);
  } else {
    const day = typeof opts.day === 'string' ? opts.day : null;
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('--day takes a date such as 2026-11-20');
    // Every version there is of a file: the one in use, written on its updated_at day, and each
    // snapshot, written on its day. "As it was at the end of day D" is the newest one not after D.
    const { rows } = day
      ? await client.query(
        `SELECT DISTINCT ON (path) path, content FROM (
           SELECT path, content, (updated_at AT TIME ZONE 'UTC')::date AS day FROM ${q('files')}
           UNION ALL
           SELECT path, content, day FROM ${q('snapshots')}
         ) v WHERE day <= $1::date ORDER BY path, day DESC`, [day])
      : await client.query(`SELECT path, content FROM ${q('files')} ORDER BY path`);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const out = path.resolve(typeof opts.out === 'string' ? opts.out : path.join('backups', `${schema}-${day || stamp}`));
    for (const r of rows) {
      const file = path.join(out, r.path);
      if (!file.startsWith(out + path.sep)) throw new Error(`refusing to write outside the folder: ${r.path}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, r.content, { mode: 0o600 });
    }
    console.log(`${rows.length} file(s) from ${schema}${day ? ` as of ${day}` : ''} → ${out}`);
    console.log('This folder holds passkeys and the session secret. Keep it private; never commit it.');
  }
} finally { await client.end(); }
