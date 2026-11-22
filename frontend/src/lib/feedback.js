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
    fail: 'Could not send. Your text is kept, try again.', offline: 'No connection. Your text is kept, try again.', close: 'Close',
    mark: 'Mark a place on the screen', marks: 'Marked places', markNote: 'What is wrong here?', markAdd: 'Add place', markOn: 'Tap the place to fix',
    markScroll: 'Scroll', markPick: 'Mark', markDone: 'Done', markStop: 'Cancel', markFull: 'That is the most places for one request. Send it, then mark more.',
    remove: 'Remove', optional: 'Optional when a place is marked', myFixes: 'My fixes', fixesEmpty: 'No requests yet. Tap the bug on the edge of the screen to make one.',
    fixesLoading: 'Loading…', fixesFail: 'Could not load the list. Pull to try again.', refresh: 'Refresh', back: 'Back',
    stageQueued: 'In the queue', stageRunning: 'Working on it', stageWaiting: 'Waiting for you', stageShipping: 'Going live', stageReview: 'Ready, please check', stageClosed: 'Closed', stageFailed: 'Failed', stageCancelled: 'Cancelled', stagePaused: 'Paused',
    secAttention: 'Needs you', secProgress: 'In progress', secClosed: 'Closed',
    accept: 'Accept', rework: 'Send back', reworkWhy: 'What still needs fixing?', reworkSend: 'Send back with this', cancelReq: 'Cancel request', cancelAsk: 'Cancel this request?', cancelYes: 'Cancel it', keep: 'Keep it',
    replyHint: 'Or write your own answer', replySend: 'Reply', board: 'Open on the board', changed: 'This request moved on meanwhile. The list is updated.', actFail: 'That did not go through. Try again.',
    accepted: 'Accepted. Closed.', sentBack: 'Sent back. It is in the queue again.', answered: 'Answered.', cancelled: 'Cancelled.', whatDone: 'What was done', checkHint: 'Check it, then accept or send it back.', placesOf: 'Places'
  },
  ru: {
    open: 'Сообщить о баге или идее', title: 'Баг или идея', bug: 'Баг', idea: 'Идея',
    bugHint: 'Что пошло не так? Куда нажали и что случилось?', ideaHint: 'Что бы вы изменили или добавили?',
    send: 'Отправить', sending: 'Отправляю…', sent: 'Отправлено. Оркестратор принял.', again: 'Уже было отправлено, повторно не ставлю.',
    follow: 'Следить', off: 'Жучок не настроен на этом сервере.', busy: 'Слишком много заявок за час. Попробуйте позже.',
    fail: 'Не отправилось. Текст сохранён, попробуйте ещё раз.', offline: 'Нет связи. Текст сохранён, попробуйте ещё раз.', close: 'Закрыть',
    mark: 'Отметить место на экране', marks: 'Отмеченные места', markNote: 'Что здесь не так?', markAdd: 'Добавить место', markOn: 'Нажмите на место, которое нужно поправить',
    markScroll: 'Листаю', markPick: 'Отмечаю', markDone: 'Готово', markStop: 'Отмена', markFull: 'Это максимум мест для одной заявки. Отправьте её и отметьте остальное.',
    remove: 'Убрать', optional: 'Можно не писать, если отмечено место', myFixes: 'Мои правки', fixesEmpty: 'Заявок пока нет. Нажмите на жучок у края экрана, чтобы оставить первую.',
    fixesLoading: 'Загружаю…', fixesFail: 'Не удалось загрузить список. Потяните, чтобы повторить.', refresh: 'Обновить', back: 'Назад',
    stageQueued: 'В очереди', stageRunning: 'В работе', stageWaiting: 'Ждёт вас', stageShipping: 'Выкатывается', stageReview: 'Готово, проверьте', stageClosed: 'Закрыта', stageFailed: 'Не получилось', stageCancelled: 'Отменена', stagePaused: 'На паузе',
    secAttention: 'Ждут вас', secProgress: 'В работе', secClosed: 'Закрытые',
    accept: 'Принять', rework: 'Вернуть', reworkWhy: 'Что ещё нужно поправить?', reworkSend: 'Вернуть с этим', cancelReq: 'Отменить заявку', cancelAsk: 'Отменить эту заявку?', cancelYes: 'Отменить', keep: 'Оставить',
    replyHint: 'Или напишите свой ответ', replySend: 'Ответить', board: 'Открыть на пульте', changed: 'Заявка за это время изменилась. Список обновлён.', actFail: 'Не получилось. Попробуйте ещё раз.',
    accepted: 'Принято. Заявка закрыта.', sentBack: 'Возвращено. Заявка снова в очереди.', answered: 'Ответ отправлен.', cancelled: 'Заявка отменена.', whatDone: 'Что сделано', checkHint: 'Проверьте, потом примите или верните.', placesOf: 'Места'
  },
  uk: {
    open: 'Повідомити про баг чи ідею', title: 'Баг або ідея', bug: 'Баг', idea: 'Ідея',
    bugHint: 'Що пішло не так? Куди натиснули і що сталося?', ideaHint: 'Що б ви змінили чи додали?',
    send: 'Надіслати', sending: 'Надсилаю…', sent: 'Надіслано. Оркестратор прийняв.', again: 'Вже було надіслано, вдруге не ставлю.',
    follow: 'Стежити', off: 'Жучок не налаштований на цьому сервері.', busy: 'Забагато заявок за годину. Спробуйте пізніше.',
    fail: 'Не надіслалось. Текст збережено, спробуйте ще раз.', offline: 'Немає зв’язку. Текст збережено, спробуйте ще раз.', close: 'Закрити',
    mark: 'Позначити місце на екрані', marks: 'Позначені місця', markNote: 'Що тут не так?', markAdd: 'Додати місце', markOn: 'Натисніть на місце, яке треба виправити',
    markScroll: 'Гортаю', markPick: 'Позначаю', markDone: 'Готово', markStop: 'Скасувати', markFull: 'Це максимум місць для однієї заявки. Надішліть її й позначте решту.',
    remove: 'Прибрати', optional: 'Можна не писати, якщо позначено місце', myFixes: 'Мої правки', fixesEmpty: 'Заявок поки немає. Натисніть на жучок біля краю екрана, щоб залишити першу.',
    fixesLoading: 'Завантажую…', fixesFail: 'Не вдалося завантажити список. Потягніть, щоб повторити.', refresh: 'Оновити', back: 'Назад',
    stageQueued: 'У черзі', stageRunning: 'У роботі', stageWaiting: 'Чекає на вас', stageShipping: 'Викочується', stageReview: 'Готово, перевірте', stageClosed: 'Закрита', stageFailed: 'Не вийшло', stageCancelled: 'Скасована', stagePaused: 'На паузі',
    secAttention: 'Чекають на вас', secProgress: 'У роботі', secClosed: 'Закриті',
    accept: 'Прийняти', rework: 'Повернути', reworkWhy: 'Що ще треба виправити?', reworkSend: 'Повернути з цим', cancelReq: 'Скасувати заявку', cancelAsk: 'Скасувати цю заявку?', cancelYes: 'Скасувати', keep: 'Залишити',
    replyHint: 'Або напишіть свою відповідь', replySend: 'Відповісти', board: 'Відкрити на пульті', changed: 'Заявка за цей час змінилась. Список оновлено.', actFail: 'Не вийшло. Спробуйте ще раз.',
    accepted: 'Прийнято. Заявку закрито.', sentBack: 'Повернуто. Заявка знову в черзі.', answered: 'Відповідь надіслано.', cancelled: 'Заявку скасовано.', whatDone: 'Що зроблено', checkHint: 'Перевірте, потім прийміть або поверніть.', placesOf: 'Місця'
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

/** Sendable: it fits, and there is something to say: words, or a marked place with a note. */
export function feedbackReady(text, marks = []) {
  const n = String(text ?? '').trim().length
  return n <= FEEDBACK_MAX && (n > 0 || marks.some(m => String(m?.note ?? '').trim()))
}

/** Sends it. Resolves { link, duplicate }; rejects with an Error whose `kind` names the words to show. */
export async function sendFeedback({ kind, text, requestId, context, marks = [] }, post = api) {
  let r
  try {
    r = await post('/api/feedback', { method: 'POST', body: JSON.stringify({ kind, text: String(text ?? '').trim(), requestId, context, ...(marks.length ? { marks: marks.map(wireMark) } : {}) }) })
  } catch (e) {
    // api() carries the server's body on the error (`data`), and no `status` when nothing answered.
    const code = e?.data?.code
    const err = new Error(e?.message || 'failed')
    err.kind = code === 'feedback-off' ? 'off' : e?.status === 429 ? 'busy' : e?.status ? 'fail' : 'offline'
    throw err
  }
  return { link: typeof r?.link === 'string' && /^https:\/\//.test(r.link) ? r.link : null, duplicate: r?.duplicate === true }
}


/* ---------- places marked on the screen ---------- */

const ONE = v => String(v ?? '').replace(/\s+/g, ' ').trim()
const IGNORE = 'data-fb-ignore'
export const FEEDBACK_IGNORE = IGNORE

/** What goes to the server for a mark: the known fields only. The place's position in the page stays here. */
export const wireMark = m => ({ n: m.n, note: m.note, what: m.what, selector: m.selector, route: m.route, html: m.html, rect: m.rect, viewport: m.viewport })

/** The element under a point that is the page's own, never the marking layer's. */
export function targetAt(x, y, doc = document) {
  for (const el of doc.elementsFromPoint(x, y)) if (!el.closest(`[${IGNORE}]`)) return el
  return null
}

/** A short name for a place, the way a person would say it: the nearest element with a short label. */
export function describeElement(el) {
  if (!el) return ''
  const textOf = e => ONE(e.getAttribute?.('aria-label') || e.getAttribute?.('title') || e.innerText || e.textContent)
  let target = el
  for (let cur = el, depth = 0; cur && depth < 6; cur = cur.parentElement, depth++) {
    const label = textOf(cur)
    if (label && label.length <= 60) { target = cur; break }
  }
  const label = textOf(target)
  const tag = target.tagName.toLowerCase()
  const role = target.getAttribute('role')
  const kind = tag === 'button' || role === 'button' ? 'button' : tag === 'a' ? 'link' : /^h\d$/.test(tag) ? 'heading' : tag === 'input' || tag === 'textarea' ? 'field' : tag === 'img' || tag === 'svg' ? 'picture' : ''
  const shown = label.length > 60 ? label.slice(0, 57) + '…' : label
  return [kind, shown ? `"${shown}"` : ''].filter(Boolean).join(' ')
}

const part = el => {
  const tag = el.tagName.toLowerCase()
  if (el.id && /^[A-Za-z][\w-]{0,40}$/.test(el.id)) return `${tag}#${el.id}`
  const cls = [...(el.classList || [])].filter(c => /^[A-Za-z][\w-]{0,30}$/.test(c)).slice(0, 2)
  if (cls.length) return `${tag}.${cls.join('.')}`
  const same = el.parentElement ? [...el.parentElement.children].filter(c => c.tagName === el.tagName) : []
  return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag
}

/** A CSS path to the element, up to its nearest id or four levels: enough for an agent to search the code for. */
export function selectorOf(el) {
  const parts = []
  for (let cur = el, depth = 0; cur && cur.nodeType === 1 && cur.tagName !== 'BODY' && depth < 4; cur = cur.parentElement, depth++) {
    parts.unshift(part(cur))
    if (cur.id) break
  }
  return parts.join(' > ').slice(0, 200)
}

/** A place, as the request will carry it. `x`, `y` are where it was tapped in the viewport; `docX`, `docY` in the page. */
export function markFrom(el, { x, y, route, note, win = window }) {
  const box = el?.getBoundingClientRect?.()
  const rect = box ? { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) } : undefined
  let html = ''
  try { html = ONE(el.cloneNode(false).outerHTML).slice(0, 400) } catch { /* detached */ }
  return {
    note: String(note ?? '').trim().slice(0, 500),
    what: describeElement(el), selector: el ? selectorOf(el) : '', route, html, rect,
    viewport: { w: win.innerWidth, h: win.innerHeight },
    docX: Math.round(x + (win.scrollX || 0)), docY: Math.round(y + (win.scrollY || 0))
  }
}

/** Too big to be a place a person means: a whole page or panel. The pin still lands, the outline is left out. */
export const isHuge = (box, win = window) => box.width * box.height > win.innerWidth * win.innerHeight * 0.45

/* ---------- "My fixes" ---------- */

/** Where a request sits on the screen: needs the owner, is being worked, or is over. */
export const SECTIONS = [
  { id: 'attention', stages: ['waiting', 'review'] },
  { id: 'progress', stages: ['queued', 'running', 'shipping', 'paused'] },
  { id: 'closed', stages: ['closed', 'failed', 'cancelled'] }
]
export const stageLabel = (c, stage) => c['stage' + stage.charAt(0).toUpperCase() + stage.slice(1)] || c.stageQueued
export const attentionCount = items => (items || []).filter(i => i.stage === 'waiting' || i.stage === 'review').length

/** The requests grouped for the screen, each group in the order the server sent them (newest first). */
export function groupItems(items) {
  return SECTIONS.map(sec => ({ id: sec.id, items: (items || []).filter(i => sec.stages.includes(i.stage)) })).filter(g => g.items.length)
}

export const listFeedback = (get = api) => get('/api/feedback').then(r => (Array.isArray(r?.items) ? r.items : []))

/** accept | rework | reply | cancel on one request; rejects with `kind`: 'stage' (it moved on), 'busy', 'offline' or 'fail'. */
export async function actFeedback({ id, action, note, choice, text }, post = api) {
  try {
    const r = await post('/api/feedback/act', { method: 'POST', body: JSON.stringify({ id, action, ...(note ? { note } : {}), ...(choice ? { choice } : {}), ...(text ? { text } : {}) }) })
    return { stage: typeof r?.stage === 'string' ? r.stage : null }
  } catch (e) {
    const err = new Error(e?.message || 'failed')
    err.kind = e?.data?.code === 'wrong-stage' || e?.status === 404 ? 'stage' : e?.status === 429 ? 'busy' : e?.status ? 'fail' : 'offline'
    throw err
  }
}
