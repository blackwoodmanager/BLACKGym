# BlackGym on Vercel

BlackGym is a personal, non-commercial deployment of [openGym](https://github.com/DuarteSantos8/openGym)
(AGPL-3.0-or-later). This folder is everything that was added to run it on Vercel. `catalogue/` is
unchanged, and `api/` and `frontend/` differ from openGym in a few small places, listed below, so
openGym's own updates merge with little or no conflict.

What differs from openGym outside this folder:

| File | Change |
|---|---|
| `frontend/src/lib/brand.js` (new) | Reads the deployment's own name, logo, icons and defaults, when the page has any. |
| `frontend/src/lib/app-icon.js`, `components/AppIconRow.jsx`, `views/Settings.jsx` | Settings → Look & Home → App icon is offered in a browser too when the deployment ships icons of its own. |
| `frontend/src/components/BrandLogo.jsx`, `views/Login.jsx` | The sign-in screen shows the deployment's logo, and its own line under it when `brand.json` has a `tagline`. |
| `frontend/src/store/useStore.js` | A new profile starts in the theme and the accent colour `brand.json` asks for (`defaults.theme`, `defaults.accent`). |
| `api/feedback.js` (new), `api/server.js`, `api/Dockerfile`, `api/openapi.yaml`, `website/api.html` | The bug button's server half: `POST /api/feedback` (admins only) passes a request on to the orchestrator; `GET /api/feedback` lists the requests and `POST /api/feedback/act` carries the owner's decision on one. `/api/me` tells an admin `feedback: true` when it is set up. One route, one flag, one import. `website/api.html` is generated from `openapi.yaml`. |
| `frontend/src/components/FeedbackBug.jsx`, `FeedbackSheet.jsx`, `FeedbackMarkup.jsx`, `views/Fixes.jsx`, `lib/feedback.js`, `feedback-draft.js`, `feedback-fixes.js` (new), `App.jsx`, `components/Icon.jsx`, `index.css` | The bug button itself: a small tab on the screen's edge, its sheet, marking places on the screen, and the "My fixes" screen (`/fixes`) with each request's status and the owner's accept, send back, reply and cancel. `App.jsx` gets a lazy view, a route and two mounts, `Icon.jsx` the `bug` icon, `index.css` a few rules. |

Without a deployment brand (openGym itself) the brand changes do nothing, and the bug button stays
off on any server where `ORCH_FEEDBACK_URL` and `ORCH_FEEDBACK_TOKEN` are not both set.

## How it works

```
browser ──► Vercel CDN ──► static files        the web app (frontend/, built with Vite) and the
   │                                           180 px exercise stills and clips (catalogue/media)
   │
   └─ /api/* ─► one Vercel Function ──► node server.js     openGym's API, started as it is
                     │                       │
                     │                       └─ reads and writes files in /tmp/blackgym-data
                     │
                     └─ keeps that folder in PostgreSQL (one row per file)
```

openGym's API is a long-running Node server that keeps everything in files (`db.json`,
`state-<profile>.json`, `secret`, ...). A Vercel Function has no disk that survives it. So the
function (`function/index.mjs`) does this for every request:

1. opens a transaction and takes a lock, so only one request at a time touches the data, across
   every running copy of the function;
2. if another copy wrote since this one last looked, fetches the changed files and restarts the API
   (the API holds `db.json` in memory);
3. hands the request to the API and keeps the whole answer;
4. writes the files the API changed into the database and commits;
5. only then sends the answer. "Saved" is never said for something that is not in the database.

Sync between devices is openGym's own: each profile is one document with a revision, a write
quotes the revision it read, and a stale write gets `409` with the current document, which the app
merges. The lock in step 1 is what keeps that check correct with several copies of the function.

| File | What it is |
|---|---|
| `build.mjs` | Builds `.vercel/output` (Vercel's Build Output format): static files, the function, the routes. The routes are what `web/nginx.conf.template` does, in Vercel's terms. |
| `brand.mjs`, `branding/` | BlackGym's name and icons, laid over the built site ([branding/README.md](branding/README.md)). |
| `function/index.mjs` | The function behind `/api`. |
| `function/store.mjs` | The data folder in PostgreSQL: pull, push, daily snapshots. |
| `function/child.mjs` | Starts and restarts `api/server.js`. |
| `scripts/backup.mjs`, `scripts/restore.mjs` | Copy the data out of the database into a folder, and back. |
| `dev-server.mjs` | Runs the build on your own machine. |
| `test/adapter.test.mjs` | The function against a real PostgreSQL and the real API. |

## Vercel project settings

| Setting | Value |
|---|---|
| Root Directory | `vercel` (with "Include files outside the root directory" on, the default) |
| Framework Preset | Other |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Node.js | 22.x |
| Fluid Compute | on (the default for new projects) |
| Function Region | the one nearest to the database |
| Production Branch | `main` |

Storage: a PostgreSQL database connected to the project (Vercel → Storage → Neon). It sets
`DATABASE_URL`, which is all the function needs. Connect it to **Production and Preview**.

## Environment variables

None is required besides the database's. All of openGym's own settings (`.env.example` in the
repository root) can be set as Vercel environment variables and reach the API unchanged.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | set by the database integration | The PostgreSQL connection string. Never given to the API process. |
| `ORIGIN` | production: `https://<production domain>`; preview: the address of the request | The address the app is opened at. Passkeys are bound to it. Set it when you add a custom domain. |
| `DEFAULT_LANG` | none (English) | openGym's own setting: the language the sign-in screen and every new profile start in. This deployment sets `ru`. Each person can still pick another in Settings → Language. |
| `BLACKGYM_SIGNUP` | `owner` | `owner`: the first profile becomes owner and admin, after that a new profile needs an invite from the owner. `open`: anyone may sign up. `invite`: always invite only. |
| `BLACKGYM_DB_SCHEMA` | `blackgym_<production\|preview\|development>` | Where the data lives in the database. Production and previews are separate on purpose. |
| `BLACKGYM_SNAPSHOT_DAYS` | `30` | How many days of daily snapshots to keep. `0` turns them off. |
| `BLACKGYM_MAX_DURATION` | `300` | Seconds a request may run (build time). 300 is the Hobby plan's limit with Fluid Compute. |
| `ORCH_FEEDBACK_URL`, `ORCH_FEEDBACK_TOKEN` | none | The bug button. The orchestrator's address (`https://…`) and its app-feedback key (`ORCH_APP_FEEDBACK_TOKEN` over there), 32 characters or more. Both set: an admin sees a small bug tab on the screen's edge, and what they write there is queued as a task in the orchestrator's `blackgym` project. Either missing: no button. The key stays on the server. |
| `CRON_SECRET` | none | When set, `/api/cron/tick` needs `Authorization: Bearer <value>`. Vercel Cron sends it by itself. |
| `MEDIA_VIDEO_MAX_MB`, `MEDIA_GIF_MAX_MB`, `MEDIA_QUOTA_MB` | `4`, `4`, `100` | Limits for photos and videos of your own exercises (see Limits). |

Secrets: the session secret and the push keys are generated by the API on first start and live in
the database, not in the repository and not in an environment variable. A redeploy keeps them, so
sessions and passkeys keep working.

## Updating the app

Changes are tried on a preview before they reach the real app:

1. Make the change on a branch and push it. Vercel builds a **preview** with its own address and
   its own data (`blackgym_preview`). Nothing there can touch the real history.
2. Open a pull request into `main`. The preview address is on the pull request.
3. Try it. Merge when it works. The merge builds **production**.
4. If production is broken: Vercel → Deployments → the last good one → "Instant Rollback". The
   data is not part of a deployment, so a rollback changes the code and nothing else.

To take openGym's updates:

```bash
git remote add upstream https://github.com/DuarteSantos8/openGym.git   # once
```

```bash
git fetch upstream
```

```bash
git checkout -b update-opengym main
```

```bash
git merge upstream/main
```

Then push the branch and follow the four steps above. `vercel/` is the only folder upstream does
not have, so the merge is clean unless upstream changes how its API starts or stores data. The
tests in `test/` are what tells you.

Commits must be authored by the GitHub account the Vercel team is connected to
(`blackwoodmanager`), or Vercel blocks the deployment.

## Backups

- **Daily snapshots, automatic.** The last version each file had on a day it changed is kept for
  30 days, in the same database (`snapshots` table).
- **A copy on your own disk, on demand:**

```bash
cd vercel && npm ci
```

```bash
DATABASE_URL='postgres://...' node scripts/backup.mjs
```

  The folder it writes is an ordinary openGym data directory. It works as `./data` of a
  self-hosted openGym, so the data is never tied to Vercel. It holds your passkeys and the session
  secret: keep it private and never commit it (`backups/` is ignored by git).
- `node scripts/backup.mjs --list` shows the days that have a snapshot,
  `--day 2026-11-20` writes the data as it was at the end of that day, and
  `node scripts/restore.mjs --from <folder> --yes` puts a folder back.
- **In the app:** Settings → Export backup (JSON), openGym's own export of one profile.
- The database provider keeps its own point-in-time history as well (Neon free plan: a few hours).

## Limits of this setup

These follow from running a long-lived server as a function. None of them loses data.

| What | Why | State |
|---|---|---|
| Rest-timer push when the app is in the background | The API keeps the timer in memory. | Works for rests up to about 4.5 minutes: the function stays awake until the timer is due. Longer rests only alert while the app is open. |
| Workout-day reminders and nudges at a set time | The API checks every 10 seconds, but only while it runs. | Needs something to call `/api/cron/tick` every 5 to 10 minutes: Vercel Cron on a paid plan (set `BLACKGYM_CRON='*/5 * * * *'` and redeploy), or any external scheduler. Without it, reminders are not sent. |
| Videos and large GIFs of your own exercises | Vercel stops a request at 4.5 MB. | Photos work (2 MB each). Video and GIF are limited to 4 MB, and the app says so. |
| A profile's whole history travels in one request | Same 4.5 MB limit. | Years away for one person (a long history is 1 to 2 MB). Watch it. |
| Sign-in right at the moment of a redeploy | A passkey sign-in is two requests that must reach the same copy of the function. | Rare. Try again and it works. |
| Sign-in throttling counters | In memory, per copy of the function. | Weaker than on a single server. Password sign-in is off (passkeys only), so there is nothing to guess. |
| AI Coach, remote MCP server, admin recovery socket | Opt-in parts of openGym that need a long-running process or their own container. | Not part of this deployment. |
| Speed | Every API request is a database round trip, and all requests are handled one at a time. | Fine for a person or a family. Not for a gym full of people. |

## Licences

- The code is AGPL-3.0-or-later, like openGym. This repository is the complete source of what is
  deployed. If you let other people use your deployment, the "Source code" link in Settings must
  lead them to this repository rather than to openGym's.
- The exercise stills and animations are **not** AGPL. They are licensed to openGym by Gym visual
  (`NOTICE.md`, `catalogue/media/NOTICE.md`). A non-commercial fork may keep the unmodified 180 px
  files together with that notice, which is what this deployment does. A commercial use, a
  different app built on them, or feeding them to any AI system needs a licence of your own from
  gymvisual.com.

## Running it on your own machine

```bash
cd vercel && npm ci && node build.mjs
```

```bash
BLACKGYM_DATABASE_URL='postgres://postgres@127.0.0.1:5432/blackgym_dev' ORIGIN=http://localhost:8080 node dev-server.mjs
```

```bash
BLACKGYM_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/blackgym_test' npm test
```
