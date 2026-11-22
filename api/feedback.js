/* The bug button's way out (BlackGym): the app posts a request here, and this server hands it to
   the orchestrator, which queues it as a task. The same road carries the "My fixes" screen: the
   list of requests with their status, and the owner's answers (accept, send back, reply, cancel).
   The orchestrator's key lives in this server's environment and never reaches a browser or a
   phone; the app only ever talks to its own origin, and what comes back is cut down to the fields
   the screen draws.

     ORCH_FEEDBACK_URL    the orchestrator's address, https (http only for localhost)
     ORCH_FEEDBACK_TOKEN  its app-feedback key (ORCH_APP_FEEDBACK_TOKEN over there), 32+ characters

   Unset, the route answers 503 and the app never shows the button. The route itself is
   admin-only (server.js), so a signed-in guest or an invited member cannot queue work. */

export const MAX_TEXT = 4000;
export const KINDS = ['bug', 'idea'];
const CONTEXT = [['route', 120], ['version', 40], ['platform', 40], ['lang', 20], ['theme', 20], ['screen', 20], ['userAgent', 200]];

export const MAX_MARKS = 10;
export const STAGES = ['queued', 'running', 'waiting', 'shipping', 'review', 'closed', 'failed', 'cancelled', 'paused'];
export const ACTIONS = ['accept', 'rework', 'reply', 'cancel'];
const ID = /^fa-\d{10,16}-[0-9a-f]{6}$/;

export class FeedbackError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

/** The configured orchestrator, or null while the feature is off or misconfigured. */
export function feedbackConfig(env = process.env) {
  const token = String(env.ORCH_FEEDBACK_TOKEN || '').trim();
  const raw = String(env.ORCH_FEEDBACK_URL || '').trim().replace(/\/+$/, '');
  if (token.length < 32 || !raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return { url: raw, token };
}

const line = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** What the app sent → what is forwarded. Anything not named here is dropped. */
export function parseFeedback(body) {
  const b = body && typeof body === 'object' ? body : {};
  const kind = b.kind === undefined ? 'bug' : String(b.kind);
  if (!KINDS.includes(kind)) throw new FeedbackError(400, 'kind must be bug or idea');
  const text = String(b.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  const marks = parseMarks(b.marks);
  if (!text && !marks.some(m => m.note)) throw new FeedbackError(400, 'text or a marked place with a note required');
  if (text.length > MAX_TEXT) throw new FeedbackError(400, `text is limited to ${MAX_TEXT} characters`);
  const requestId = b.requestId === undefined ? '' : String(b.requestId);
  if (requestId && !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw new FeedbackError(400, 'bad requestId');
  const c = b.context && typeof b.context === 'object' && !Array.isArray(b.context) ? b.context : {};
  const context = {};
  for (const [k, max] of CONTEXT) { const v = line(c[k], max); if (v) context[k] = v; }
  return { kind, text, requestId, context, marks };
}

const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

/** The places the owner marked on screen: a number, a note, what the element is, where it sits. Anything else is dropped. */
export function parseMarks(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new FeedbackError(400, 'marks must be a list');
  if (list.length > MAX_MARKS) throw new FeedbackError(400, `at most ${MAX_MARKS} marks`);
  return list.map((m, i) => {
    const o = m && typeof m === 'object' ? m : {};
    const out = { n: int(o.n, 1, 99) ?? i + 1, note: String(o.note ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 500), what: line(o.what, 120), selector: line(o.selector, 200), route: line(o.route, 120), html: line(o.html, 400) };
    const r = o.rect && typeof o.rect === 'object' ? o.rect : null;
    if (r) { const rect = { x: int(r.x, -10000, 20000), y: int(r.y, -10000, 20000), w: int(r.w, 0, 20000), h: int(r.h, 0, 20000) }; if (Object.values(rect).every(v => v !== null)) out.rect = rect; }
    const v = o.viewport && typeof o.viewport === 'object' ? o.viewport : null;
    if (v) { const vp = { w: int(v.w, 0, 20000), h: int(v.h, 0, 20000) }; if (vp.w !== null && vp.h !== null) out.viewport = vp; }
    for (const k of Object.keys(out)) if (out[k] === '') delete out[k];
    return out;
  });
}

/**
 * One call to the orchestrator's /api/app-feedback. Resolves its JSON when it said ok; every other
 * outcome is a FeedbackError that repeats nothing the orchestrator said (its texts are for its own
 * screen, and a refusal can carry detail the person at the button has no use for):
 *   429 too many in the hour; 404 no such request; 409 not possible at this stage (`stage` says which);
 *   400 refused as asked (a reply that is not one of its options); anything else, 502.
 */
async function call({ config, payload, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  let r;
  try {
    r = await fetchImpl(`${config.url}/api/app-feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ app: 'blackgym', ...payload }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error'
    });
  } catch {
    throw new FeedbackError(502, 'the orchestrator did not answer', 'orchestrator-down');
  }
  let data = null;
  try { data = await r.json(); } catch { /* not JSON: handled by the status below */ }
  if (r.status === 429) throw new FeedbackError(429, 'too many requests in the last hour', 'orchestrator-busy');
  // 401 means the key here and the key there differ; the person at the button cannot fix that, so
  // it is the same "could not send" as any other refusal, and the container log says why.
  if (r.status === 401) console.warn('feedback: the orchestrator rejected ORCH_FEEDBACK_TOKEN');
  if (r.status === 404) throw new FeedbackError(404, 'no such request', 'not-found');
  if (r.status === 409) {
    const e = new FeedbackError(409, 'not possible at this stage', 'wrong-stage');
    if (STAGES.includes(data?.stage)) e.stage = data.stage;
    throw e;
  }
  if (r.status === 400) throw new FeedbackError(400, 'the orchestrator did not accept that', 'orchestrator-refused');
  if (!r.ok || !data?.ok) throw new FeedbackError(502, 'the orchestrator refused the request', 'orchestrator-refused');
  return data;
}

const https = v => (typeof v === 'string' && /^https:\/\//.test(v) && v.length <= 500 ? v : null);

/** Sends one request to the orchestrator. Resolves { id, link, duplicate }; rejects with FeedbackError. */
export async function forwardFeedback({ config, fb, user, fetchImpl, timeoutMs }) {
  const data = await call({
    config, fetchImpl, timeoutMs,
    payload: {
      action: 'create', kind: fb.kind, text: fb.text,
      ...(fb.requestId ? { requestId: fb.requestId } : {}),
      ...(fb.marks?.length ? { marks: fb.marks } : {}),
      context: fb.context,
      author: { id: line(user?.id, 64), name: line(user?.name, 60) }
    }
  });
  return { id: line(data.id, 80), link: https(data.link), duplicate: data.duplicate === true };
}

/** One request as the "My fixes" screen draws it: the known fields only, each cut to size. */
export function cleanItem(it) {
  const o = it && typeof it === 'object' ? it : {};
  const rv = o.review && typeof o.review === 'object' ? o.review : null;
  return {
    id: line(o.id, 40),
    title: line(o.title, 160),
    kind: o.kind === 'idea' ? 'idea' : 'bug',
    stage: STAGES.includes(o.stage) ? o.stage : 'queued',
    progress: int(o.progress, 0, 100) ?? 0,
    summary: String(o.summary ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 1000),
    ...(o.ask ? { ask: line(o.ask, 500), askOptions: (Array.isArray(o.askOptions) ? o.askOptions : []).slice(0, 4).map(x => line(x, 80)).filter(Boolean), askKind: line(o.askKind, 20) } : {}),
    links: (Array.isArray(o.links) ? o.links : []).slice(0, 6).map(l => ({ url: https(l?.url), title: line(l?.title, 80) })).filter(l => l.url),
    marks: (Array.isArray(o.marks) ? o.marks : []).slice(0, MAX_MARKS).map(m => ({ n: int(m?.n, 1, 99) ?? 0, note: line(m?.note, 500), what: line(m?.what, 120), route: line(m?.route, 120) })),
    review: rv ? { state: rv.state === 'accepted' ? 'accepted' : 'rework', note: line(rv.note, 1000), at: int(rv.at, 0, 1e14) } : null,
    open: o.open === true,
    createdAt: int(o.createdAt, 0, 1e14),
    updatedAt: int(o.updatedAt, 0, 1e14),
    finishedAt: int(o.finishedAt, 0, 1e14),
    link: https(o.link)
  };
}

/** The requests, newest first. */
export async function listFeedback({ config, fetchImpl, timeoutMs }) {
  const data = await call({ config, fetchImpl, timeoutMs, payload: { action: 'list' } });
  return { items: (Array.isArray(data.items) ? data.items : []).slice(0, 100).map(cleanItem).filter(it => ID.test(it.id)) };
}

/** What the person at the screen asked of one request, checked before anything is sent. */
export function parseAct(body) {
  const b = body && typeof body === 'object' ? body : {};
  const action = String(b.action ?? '');
  if (!ACTIONS.includes(action)) throw new FeedbackError(400, `action must be one of ${ACTIONS.join(', ')}`);
  const id = String(b.id ?? '');
  if (!ID.test(id)) throw new FeedbackError(400, 'bad id');
  const field = (v, max, name) => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw new FeedbackError(400, `${name} must be text`);
    const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (t.length > max) throw new FeedbackError(400, `${name} is limited to ${max} characters`);
    return t;
  };
  const note = field(b.note, 1000, 'note'), choice = field(b.choice, 80, 'choice'), text = field(b.text, 1000, 'text');
  if (action === 'rework' && !note) throw new FeedbackError(400, 'say what to fix');
  if (action === 'reply' && !choice && !text) throw new FeedbackError(400, 'an answer is needed');
  return { action, id, note, choice, text };
}

/** accept, rework, reply or cancel on one request. Resolves { stage } (or the orchestrator's own answer body for reply). */
export async function actOnFeedback({ config, act, fetchImpl, timeoutMs }) {
  const data = await call({ config, fetchImpl, timeoutMs, payload: { action: act.action, id: act.id, ...(act.note ? { note: act.note } : {}), ...(act.choice ? { choice: act.choice } : {}), ...(act.text ? { text: act.text } : {}) } });
  return { stage: STAGES.includes(data.stage) ? data.stage : null };
}
