import { useEffect } from 'react'
import { useLang } from '../lib/i18n.js'
import { attentionCount, feedbackCopy } from '../lib/feedback.js'
import { refreshFixes, useFixes } from '../lib/feedback-fixes.js'
import { openFeedback } from './FeedbackSheet.jsx'
import Icon from './Icon.jsx'

// The bug button: a small tab on the screen's edge (App.jsx shows it to the one person the server
// calls `feedback: true`, lib/feedback.js). A dot on it says a request waits for the owner: an
// answer for the agent, or a fix to check. The list is asked for when the app starts and whenever
// it comes back to the front, never on a timer: only the "My fixes" screen polls.
export default function FeedbackBug({ path }) {
  useLang()
  const label = feedbackCopy().open
  const waiting = attentionCount(useFixes().items)
  useEffect(() => {
    refreshFixes()
    const back = () => { if (document.visibilityState === 'visible') refreshFixes() }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])
  return <button type="button" id="fbbug" aria-label={waiting ? `${label} (${waiting})` : label} title={label} onClick={() => openFeedback(path)}>
    <Icon name="bug" />
    {waiting > 0 && <span className="fb-dot" aria-hidden="true" />}
  </button>
}
