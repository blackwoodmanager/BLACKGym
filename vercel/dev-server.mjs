/* Runs what build.mjs built, on this machine: the static files and the function behind /api,
 * with config.json's rules in the few lines below. For trying a change before it is pushed and
 * for the tests in test/. Vercel itself does not use this file.
 *
 *   BLACKGYM_DATABASE_URL=postgres://... node dev-server.mjs          (after `node build.mjs`)
 *   BLACKGYM_SERVER_DIR=../api BLACKGYM_STATIC_DIR=../frontend/dist   (without a full build)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.vercel', 'output');
const STATIC = process.env.BLACKGYM_STATIC_DIR ? path.resolve(process.env.BLACKGYM_STATIC_DIR) : path.join(OUT, 'static');
const built = fs.existsSync(path.join(OUT, 'functions', 'api.func', 'index.mjs'));
const { default: handler } = await import(built && !process.env.BLACKGYM_SERVER_DIR
  ? path.join(OUT, 'functions', 'api.func', 'index.mjs')
  : path.join(HERE, 'function', 'index.mjs'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.wasm': 'application/wasm',
};
const API = /^(\/api\/.*|\/mcp|\/\.well-known\/(?:oauth-authorization-server|oauth-protected-resource|openid-configuration)(?:\/mcp)?)$/;

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (API.test(pathname)) return handler(req, res);
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(STATIC, rel);
  if (!file.startsWith(STATIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
server.listen(+(process.env.PORT || 8080), () => console.log(`blackgym dev on :${server.address().port}`));
