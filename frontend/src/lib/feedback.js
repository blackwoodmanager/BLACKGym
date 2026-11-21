// The bug button (BlackGym): a request for the orchestrator, written in the app. The words are
// kept here and not in the language packs on purpose: the button exists for the owner alone, so
// it speaks English, Russian and Ukrainian and falls back to English, instead of adding a string
// to all 24 packs that nobody else will ever read.
import { api } from './api.js'
import { getLang } from './i18n.js'

export const FEEDBACK_MAX = 4000
export const FEEDBACK_KINDS = ['bug', 'idea']

const COPY = {
  en: {
    open: 'Report a bug or an idea', title: 'Bug or idea', bug: 'Bug', idea: 'Idea',
    bugHint: 'What went wrong? What did you tap, and what happened?', ideaHint: 'What would you change or add?',
    send: 'Send', sending: 'Sending…', sent: 'Sent. The orchestrator has it.', again: 'Sent again. It was already queued.',
    follow: 'Follow it', off: 'The bug button is not set up on this server.', busy: 'Too many requests this hour. Try later.',
    fail: 'Could not send. Your text is kept, try again.', offline: 'No connection. Your text is kept, try again.', close: 'Close'
  },
  ru: {
    open: 'Сообщить о баге или идее', title: 'Баг или идея', bug: 'Баг', idea: 'Идея',
    bugHint: 'Что пошло не так? Куда нажали и что случилось?', ideaHint: 'Что бы вы изменили или добавили?',
    send: 'Отправить', sending: 'Отправляю…', sent: 'Отправлено. Оркестратор принял.', again: 'Уже было отправлено, повторно не ставлю.',
    follow: 'Следить', off: 'Жучок не настроен на этом сервере.', busy: 'Слишком много заявок за час. Попробуйте позже.',
    fail: 'Не отправилось. Текст сохранён, попробуйте ещё раз.', offline: 'Нет связи. Текст сохранён, попробуйте ещё раз.', close: 'Закрыть'
  },
  uk: {
    open: 'Повідомити про баг чи ідею', title: 'Баг або ідея', bug: 'Баг', idea: 'Ідея',
    bugHint: 'Що пішло не так? Куди натиснули і що сталося?', ideaHint: 'Що б ви змінили чи додали?',
    send: 'Надіслати', sending: 'Надсилаю…', sent: 'Надіслано. Оркестратор прийняв.', again: 'Вже було надіслано, вдруге не ставлю.',
    follow: 'Стежити', off: 'Жучок не налаштований на цьому сервері.', busy: 'Забагато заявок за годину. Спробуйте пізніше.',
    fail: 'Не надіслалось. Текст збережено, спробуйте ще раз.', offline: 'Немає зв’язку. Текст збережено, спробуйте ще раз.', close: 'Закрити'
  }
}

/** The words for a language code ("ru", "uk-UA", "pt-BR"…); English where there are none. */
export const feedbackCopy = (lang = getLang()) => COPY[String(lang || '').toLowerCase().split(/[-_]/)[0]] || COPY.en

/** Only an admin on a server where the orchestrator is wired is told `feedback` (api/server.js publicUser). */
export const canGiveFeedback = user => user?.feedback === true

/** Where the owner was: the screen, the build, the device. Short lines, nothing typed by the user. */
export function feedbackContext({ route, lang, theme, screen, userAgent, platform, version } = {}) {
  const out = {}
  const put = (k, v, max) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max); if (s) out[k] = s }
  put('route', route, 120); put('version', version, 40); put('platform', platform, 40); put('lang', lang, 20)
  put('theme', theme, 20); put('screen', screen, 20); put('userAgent', userAgent, 200)
  return out
}

/** The context of this very moment, read from the page. Never throws: a missing piece is left out. */
export function currentContext(route) {
  const safe = fn => { try { return fn() } catch { return undefined } }
  return feedbackContext({
    route,
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined,
    platform: safe(() => (import.meta.env.VITE_MOBILE === '1' ? 'app' : 'web')),
    lang: safe(getLang),
    theme: safe(() => document.documentElement.dataset.theme),
    screen: safe(() => `${window.innerWidth}x${window.innerHeight}`),
    userAgent: safe(() => navigator.userAgent)
  })
}

/** One id per request, kept across retries so a second tap cannot queue a second task. */
export function newRequestId() {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

/** The text is sendable: something is there, and it fits. */
export const feedbackReady = text => { const n = String(text ?? '').trim().length; return n > 0 && n <= FEEDBACK_MAX }

/** Sends it. Resolves { link, duplicate }; rejects with an Error whose `kind` names the words to show. */
export async function sendFeedback({ kind, text, requestId, context }, post = api) {
  let r
  try {
    r = await post('/api/feedback', { method: 'POST', body: JSON.stringify({ kind, text: String(text).trim(), requestId, context }) })
  } catch (e) {
    // api() carries the server's body on the error (`data`), and no `status` when nothing answered.
    const code = e?.data?.code
    const err = new Error(e?.message || 'failed')
    err.kind = code === 'feedback-off' ? 'off' : e?.status === 429 ? 'busy' : e?.status ? 'fail' : 'offline'
    throw err
  }
  return { link: typeof r?.link === 'string' && /^https:\/\//.test(r.link) ? r.link : null, duplicate: r?.duplicate === true }
}
