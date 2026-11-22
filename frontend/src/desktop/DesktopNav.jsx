import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { dayApart, nextSessionIds } from '../lib/day-sessions.js'
import { t, useLang } from '../lib/i18n.js'
import { isOn } from '../lib/modules.js'
import { canGiveFeedback, feedbackCopy } from '../lib/feedback.js'
import { retapTab } from '../lib/scroll-top.js'
import Icon from '../components/Icon.jsx'
import Elapsed from '../components/Elapsed.jsx'
import BrandLogo, { BrandMark } from '../components/BrandLogo.jsx'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import { deskCopy } from './copy.js'
import { readMini, writeMini } from './use-desktop.js'

// The sidebar: what the tab bar is on a phone, with room for every screen that hides behind
// Stats and Home there. App.jsx shows it in place of the tab bar on a computer (use-desktop.js).
//
// A screen without an entry of its own lights the one it is opened from, as the tab bar does.
const PARENT = { checkin: 'home', 'structural-balance': 'stats', tools: 'stats', 'progress-photos': 'stats', trainer: 'home', coach: 'plan', assistants: 'settings', connect: 'settings' }

function Item({ to, icon, label, cur, dot, mini }) {
  const nav = useNavigate()
  const loc = useLocation()
  const key = to.split('/')[1]
  const on = cur === key || PARENT[cur] === key
  // The entry you are already on takes you to the top of its page, like a tab tapped twice.
  const go = () => { if (loc.pathname !== to || loc.search) nav(to); else retapTab(to) }
  return (
    <button type="button" className={'dk-item' + (on ? ' on' : '')} onClick={go} aria-current={on ? 'page' : undefined}
      title={mini ? label : undefined} aria-label={mini ? label : undefined}>
      <span className="dk-item-ic"><Icon name={icon} />{dot && <span className="tab-dot" aria-hidden="true" />}</span>
      {!mini && <span className="dk-item-t">{label}</span>}
    </button>
  )
}

export default function DesktopNav({ onStart, onPick }) {
  useLang()
  const c = deskCopy()
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const trouble = useConnectionTrouble()
  const [mini, setMini] = useState(readMini)
  useEffect(() => {
    document.body.classList.toggle('desk-mini', mini)
    return () => document.body.classList.remove('desk-mini')
  }, [mini])
  const cur = loc.pathname.split('/')[1] || 'home'

  // What the tab bar's Start does (components/TabBar.jsx startWorkout), without the long press: a
  // mouse has a second button for the picker.
  const running = !!S.active && cur !== 'workout' && !S.active.editingWorkoutId && !S.active.backfill && S.active.start > 0
  const today = todayISO()
  const start = () => {
    if (!S.active) {
      if (S.startPick === 'ask' && onPick) { onPick(); return }
      if (dayApart(S, today)) {
        const ids = nextSessionIds(S, today)
        if (ids) { onStart(ids); return }
      } else if (effectiveRoutines(S, today).some(r => r.ex.length)) { onStart(effectiveRoutineIds(S, today)); return }
    }
    nav('/workout')
  }
  const startLabel = S.active ? (cur === 'workout' ? t('Workout') : S.active.editingWorkoutId ? t('Edit workout') : t('Resume')) : t('Start')

  return (
    <nav id="desknav" className={mini ? 'mini' : ''} aria-label={c.training}>
      <div className="dk-brand">
        {mini ? <BrandMark height={20} /> : <BrandLogo size={20} />}
      </div>
      <button type="button" className={'dk-start' + (S.active ? ' rec' : '')} onClick={start} data-tour="start"
        onContextMenu={e => { if (!S.active && onPick) { e.preventDefault(); onPick() } }}
        title={mini ? startLabel : undefined} aria-label={running ? t('Resume') : mini ? startLabel : undefined}>
        <Icon name="play" />
        {!mini && (running
          ? <span className="tab-time"><Elapsed start={S.active.start} pausedAt={S.active.pausedAt} /></span>
          : <span>{startLabel}</span>)}
      </button>

      <div className="dk-group">
        {!mini && <div className="dk-group-t">{c.training}</div>}
        <Item to="/home" icon="house" label={t('Overview')} cur={cur} dot={trouble} mini={mini} />
        <Item to="/plan" icon="calendar" label={t('Plan')} cur={cur} mini={mini} />
        <Item to="/library" icon="dumbbell" label={t('Exercises')} cur={cur} mini={mini} />
        <Item to="/history" icon="history" label={t('History')} cur={cur} mini={mini} />
      </div>
      <div className="dk-group">
        {!mini && <div className="dk-group-t">{c.progress}</div>}
        <Item to="/stats" icon="chart" label={t('Stats')} cur={cur} mini={mini} />
        <Item to="/records" icon="trophy" label={c.records} cur={cur} mini={mini} />
        <Item to="/muscles" icon="arm" label={t('Muscles')} cur={cur} mini={mini} />
        {isOn(S, 'body') && <Item to="/measurements" icon="ruler" label={t('Body measurements')} cur={cur} mini={mini} />}
        <Item to="/journal" icon="note" label={t('Journal')} cur={cur} mini={mini} />
      </div>

      <div className="dk-group dk-foot">
        {/* "My fixes" (views/Fixes.jsx), the bug button's own screen: on a phone it is reached from the
            button's sheet, here it has an entry of its own. */}
        {canGiveFeedback(user) && <Item to="/fixes" icon="bug" label={feedbackCopy().myFixes} cur={cur} mini={mini} />}
        {user?.admin && <Item to="/admin" icon="crown" label={t('Admin')} cur={cur} mini={mini} />}
        <Item to="/settings" icon="gear" label={t('Settings')} cur={cur} mini={mini} />
        <button type="button" className="dk-item dk-fold" onClick={() => setMini(m => { writeMini(!m); return !m })}
          aria-label={mini ? c.unfold : c.fold} title={mini ? c.unfold : c.fold} aria-expanded={!mini}>
          <span className="dk-item-ic"><Icon name={mini ? 'chevronRight' : 'chevronLeft'} /></span>
          {!mini && <span className="dk-item-t">{c.fold}</span>}
        </button>
      </div>
    </nav>
  )
}
