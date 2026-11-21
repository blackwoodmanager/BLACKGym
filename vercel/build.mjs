/* Builds BlackGym for Vercel, in Vercel's Build Output format (.vercel/output):
 *
 *   static/                  the web app (frontend/, built with Vite as openGym's web image does)
 *   static/exercise-media/   the catalogue's 180 px stills and clips, as that image serves them
 *   functions/api.func/      the function (function/*.mjs) and, inside it, the API as it is (api/)
 *   config.json              the routes: what openGym's nginx.conf.template does, in Vercel's terms
 *
 * Nothing under frontend/ or api/ is changed by this build. It runs on Vercel (`npm run build`
 * with vercel/ as the project's root directory) and the same way on any machine with Node 22.
 *
 *   node build.mjs                  everything
 *   node build.mjs --skip-frontend  reuse frontend/dist from an earlier run (local work)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(HERE, '.vercel', 'output');
const STATIC = path.join(OUT, 'static');
const FUNC = path.join(OUT, 'functions', 'api.func');
const args = new Set(process.argv.slice(2));
const run = (cmd, cwd, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
const step = s => console.log(`\n== ${s}`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(STATIC, { recursive: true });
fs.mkdirSync(FUNC, { recursive: true });

/* ---------- the web app ---------- */
const frontend = path.join(ROOT, 'frontend');
const dist = path.join(frontend, 'dist');
if (!args.has('--skip-frontend') || !fs.existsSync(path.join(dist, 'index.html'))) {
  step('frontend: install');
  // --ignore-scripts, like web/Dockerfile: the web build needs `vite build` and nothing a postinstall does.
  run('npm ci --ignore-scripts --no-audit --no-fund', frontend);
  step('frontend: build');
  // Shown in the app next to the version, so "which build is this" has an answer.
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
  run('npm run build', frontend, { APP_BUILD: process.env.APP_BUILD || (sha ? `blackgym.${sha}` : 'blackgym') });
}
step('static: the app');
fs.cpSync(dist, STATIC, { recursive: true });

step('static: exercise media');
// 180 px only, the size the licence allows a server to hold (NOTICE.md, catalogue/media/NOTICE.md).
const media = path.join(ROOT, 'catalogue', 'media');
fs.cpSync(media, path.join(STATIC, 'exercise-media'), { recursive: true });
const count = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`${count(STATIC)} static files`);

/* ---------- the function ---------- */
step('function: adapter');
for (const f of fs.readdirSync(path.join(HERE, 'function'))) fs.copyFileSync(path.join(HERE, 'function', f), path.join(FUNC, f));
fs.writeFileSync(path.join(FUNC, 'package.json'), JSON.stringify({ type: 'module', private: true }));
if (!fs.existsSync(path.join(HERE, 'node_modules', 'pg'))) run('npm ci --omit=dev --no-audit --no-fund', HERE);
fs.cpSync(path.join(HERE, 'node_modules'), path.join(FUNC, 'node_modules'), { recursive: true });

step('function: the API, as it is');
const api = path.join(ROOT, 'api');
const server = path.join(FUNC, 'server');
const LEAVE = new Set(['node_modules', 'test', 'scripts', 'Dockerfile', 'openapi.yaml']);
fs.mkdirSync(server);
for (const e of fs.readdirSync(api)) if (!LEAVE.has(e)) fs.cpSync(path.join(api, e), path.join(server, e), { recursive: true });
// As api/Dockerfile's default target: the lockfile's versions, no dev tools, no AI runtime.
run('npm ci --omit=dev --omit=optional --no-audit --no-fund', server);

fs.writeFileSync(path.join(FUNC, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  shouldAddSourcemapSupport: false,
  supportsResponseStreaming: true,
  maxDuration: Math.max(10, +(process.env.BLACKGYM_MAX_DURATION || 300) || 300),
}, null, 2));

/* ---------- the routes ---------- */
step('routes');
// The policy openGym's web image sends, read from where openGym keeps it, so the hash of the one
// inline script in index.html stays the one upstream tests (frontend/src/lib/csp.test.js).
const dockerfile = fs.readFileSync(path.join(ROOT, 'web', 'Dockerfile'), 'utf8');
const csp = /^ENV CONTENT_SECURITY_POLICY="(.+)"$/m.exec(dockerfile)?.[1];
if (!csp) throw new Error('web/Dockerfile no longer carries CONTENT_SECURITY_POLICY: read it from where it moved to');

const DAY30 = 'public, max-age=2592000, immutable';
const toApi = src => ({ src, dest: '/api?__p=$1', check: true });
const config = {
  version: 3,
  routes: [
    // On every answer, the API's included (nginx.conf.template, the server block).
    { src: '^/(.*)$', headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': csp,
    }, continue: true },
    // The app shell: always asked again, so an update shows at once.
    { src: '^/.*\\.(js|css|json|html)$', headers: { 'Cache-Control': 'no-cache, must-revalidate' }, continue: true },
    // Vite names chunks after their content: a new build is new names.
    { src: '^/assets/[^/]+-[A-Za-z0-9_-]+\\.(js|css)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/.*\\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|webp|avif|mp4)$', headers: { 'Cache-Control': DAY30 }, continue: true },
    // Licensed for this app only: another site may not show them in its own pages.
    { src: '^/exercise-media/.*$', headers: { 'Cross-Origin-Resource-Policy': 'same-origin' }, continue: true },
    // The service worker and the manifest must never be a stale copy.
    { src: '^/(sw\\.js|manifest\\.json)$', headers: { 'Cache-Control': 'no-cache, must-revalidate' }, continue: true },

    toApi('^(/api/.*)$'),
    toApi('^(/mcp)$'),
    toApi('^(/\\.well-known/(?:oauth-authorization-server|oauth-protected-resource|openid-configuration)(?:/mcp)?)$'),

    { handle: 'filesystem' },
    // The app's screens live behind the # (/#/plan), so a path is never a screen: an unknown one
    // goes to the root rather than to a blank page (nginx.conf.template, `location @root`).
    { src: '^/.*$', status: 302, headers: { Location: '/' } },
  ],
};
// Reminders at a set time need the API woken every few minutes (README, limits). Opt-in, because a
// schedule more often than daily fails the deployment on Vercel's free plan.
const cron = (process.env.BLACKGYM_CRON || '').trim();
if (cron) config.crons = [{ path: '/api/cron/tick', schedule: cron }];
fs.writeFileSync(path.join(OUT, 'config.json'), JSON.stringify(config, null, 2));
console.log(`\nBuilt ${path.relative(ROOT, OUT)}`);
