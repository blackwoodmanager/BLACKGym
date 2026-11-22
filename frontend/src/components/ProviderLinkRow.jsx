// BlackGym: "Sign in with Telegram" on the first Settings page. openGym keeps the row one level
// down, in Settings → Account (components/OidcAccount.jsx); on a server whose only provider is
// the owner's own Telegram bot that is where nobody looks for it. This is that very row, with the
// list of passkeys it needs for its "is it really you" step, shown as soon as that list is in.
import { useStore } from '../store/useStore.js'
import { oidcOn } from '../lib/oidc.js'
import { usePasskeys } from './Passkeys.jsx'
import { OidcRow } from './OidcAccount.jsx'

export default function ProviderLinkRow() {
  const config = useStore(s => s.config)
  const user = useStore(s => s.user)
  const on = oidcOn(config) && !!user
  const passkeys = usePasskeys(on)
  // Without the list the sheet could not ask for the passkey, so the row waits for it.
  if (!on || !passkeys.st) return null
  return <OidcRow state={passkeys.st} changed={passkeys.load} />
}
