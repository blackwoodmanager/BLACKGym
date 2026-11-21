/* What backup.mjs and restore.mjs share: the connection, and the schema they act on. */
import pg from 'pg';
import { schemaName } from '../function/store.mjs';

export function options(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, v] = a.slice(2).split('=');
    out[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
  }
  return out;
}

export async function connect(opts) {
  const url = process.env.BLACKGYM_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('Set DATABASE_URL to the database of the Vercel project (Vercel → Storage → the database → .env.local).');
    process.exit(2);
  }
  const schema = schemaName(opts.schema || process.env.BLACKGYM_DB_SCHEMA || 'blackgym_production');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return { client, schema, q: name => `"${schema}"."${name}"` };
}

// The same lock the function takes for a request (function/store.mjs), so a restore never lands
// in the middle of one.
export const lock = (client, schema) => client.query('SELECT pg_advisory_xact_lock(815, hashtext($1))', [schema]);
