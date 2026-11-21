/* The bug button's way out (BlackGym): the app posts a request here, and this server hands it to
   the orchestrator, which queues it as a task. The orchestrator's key lives in this server's
   environment and never reaches a browser or a phone; the app only ever talks to its own origin.

     ORCH_FEEDBACK_URL    the orchestrator's address, https (http only for localhost)
     ORCH_FEEDBACK_TOKEN  its app-feedback key (ORCH_APP_FEEDBACK_TOKEN over there), 32+ characters

   Unset, the route answers 503 and the app never shows the button. The route itself is
   admin-only (server.js), so a signed-in guest or an invited member cannot queue work. */

export const MAX_TEXT = 4000;
export const KINDS = ['bug', 'idea'];
const CONTEXT = [['route', 120], ['version', 40], ['platform', 40], ['lang', 20], ['theme', 20], ['screen', 20], ['userAgent', 200]];

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
  if (!text) throw new FeedbackError(400, 'text required');
  if (text.length > MAX_TEXT) throw new FeedbackError(400, `text is limited to ${MAX_TEXT} characters`);
  const requestId = b.requestId === undefined ? '' : String(b.requestId);
  if (requestId && !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw new FeedbackError(400, 'bad requestId');
  const c = b.context && typeof b.context === 'object' && !Array.isArray(b.context) ? b.context : {};
  const context = {};
  for (const [k, max] of CONTEXT) { const v = line(c[k], max); if (v) context[k] = v; }
  return { kind, text, requestId, context };
}

/** Sends one request to the orchestrator. Resolves { id, link, duplicate }; rejects with FeedbackError. */
export async function forwardFeedback({ config, fb, user, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  let r;
  try {
    r = await fetchImpl(`${config.url}/api/app-feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
      body: JSON.stringify({
        app: 'blackgym', kind: fb.kind, text: fb.text,
        ...(fb.requestId ? { requestId: fb.requestId } : {}),
        context: fb.context,
        author: { id: line(user?.id, 64), name: line(user?.name, 60) }
      }),
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
  if (!r.ok || !data?.ok) throw new FeedbackError(502, 'the orchestrator refused the request', 'orchestrator-refused');
  const link = typeof data.link === 'string' && /^https:\/\//.test(data.link) ? data.link : null;
  return { id: line(data.id, 80), link, duplicate: data.duplicate === true };
}
