/* The openGym API, run as it is: `node server.js` as a child of the function, on a port of its
 * own, with DATA_DIR pointing at the directory store.mjs keeps in step with PostgreSQL.
 *
 * A child rather than an import because the API reads its files when it is loaded and keeps
 * db.json in memory from then on. When another instance of the function has written, the only
 * honest way to make this one see it is to start the API again, and a process can be started
 * again; a module cannot be unloaded. It is also how the API's own test suite runs it.
 */
import { spawn } from 'node:child_process';

const BOOT_TIMEOUT_MS = 20000;

export function createChild({ serverDir, log = console }) {
  let proc = null;
  let port = 0;
  let envKey = '';
  let starting = null;

  function stop() {
    const p = proc;
    proc = null; port = 0; envKey = ''; starting = null;
    if (!p) return;
    p.removeAllListeners('exit');
    try { p.kill('SIGKILL'); } catch { /* already gone */ }
  }

  function start(env, key) {
    const child = spawn(process.execPath, ['server.js'], { cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    proc = child; envKey = key;
    const lines = (stream, out) => {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', d => {
        rest += d;
        const parts = rest.split('\n');
        rest = parts.pop();
        for (const line of parts) if (line) out('[api] ' + line);
      });
    };
    lines(child.stderr, s => log.error(s));
    const ready = new Promise((resolve, reject) => {
      let seen = '';
      const give = setTimeout(() => reject(new Error('the API did not start in time: ' + seen.slice(-400))), BOOT_TIMEOUT_MS);
      child.stdout.setEncoding('utf8');
      let rest = '';
      child.stdout.on('data', d => {
        rest += d;
        const parts = rest.split('\n');
        rest = parts.pop();
        for (const line of parts) if (line) log.log('[api] ' + line);
        if (port) return;
        seen += d;
        const m = /gym-api on :(\d+)/.exec(seen);
        if (m) { port = +m[1]; clearTimeout(give); resolve(port); }
      });
      child.once('exit', code => {
        clearTimeout(give);
        if (proc === child) { proc = null; port = 0; envKey = ''; starting = null; }
        reject(new Error(`the API stopped while starting (exit ${code}): ${seen.slice(-400)}`));
      });
    });
    ready.catch(() => {});
    child.on('exit', (code, signal) => {
      if (proc !== child) return;
      log.error(`[child] the API exited (code ${code}, signal ${signal})`);
      proc = null; port = 0; envKey = ''; starting = null;
    });
    return ready;
  }

  /** The port of an API started with exactly this environment, starting one when needed. */
  async function ensure(env, key) {
    if (proc && envKey === key && port) return port;
    if (proc && envKey === key && starting) return starting;
    stop();
    starting = start(env, key);
    try { return await starting; }
    catch (e) { stop(); throw e; }
    finally { starting = null; }
  }

  return { ensure, stop, get running() { return !!proc && !!port; } };
}
