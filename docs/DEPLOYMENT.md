# Deploying HabitFlow

This guide puts HabitFlow online with three free-to-start services:

| Piece | Service | What it does |
|---|---|---|
| Database | **Neon** (PostgreSQL 16) | Stores all data. TLS (SSL) required. |
| API | **Render** web service (Node 20) | Runs `backend/`, including the reminder scheduler (a long-running process). |
| Website | **Vercel** | Serves `frontend/` and forwards every `/api/...` request to Render. |

```mermaid
flowchart LR
  B[Browser] -- "https://your-app.vercel.app" --> V[Vercel<br/>static app + rewrite]
  V -- "/api/* (server-side proxy)" --> R[Render<br/>Node API + reminder cron]
  R -- "TLS, pooled connection" --> N[(Neon<br/>PostgreSQL)]
```

**Why the rewrite matters:** the browser only ever talks to your Vercel domain. Vercel forwards `/api/*` to Render behind the scenes. Because of that:
- the login cookies are first-party, so `SameSite=Lax` and the CSRF check work exactly as in development;
- no CORS setup is needed.

Follow the steps **in order**: each one needs a value from the step before.

Nothing in this repository contains a real secret. You paste secrets into the dashboards only.

---

## Before you start

1. The code is on GitHub (Render and Vercel deploy from it).
2. CI is green on `main`: the "CI" workflow on GitHub's **Actions** tab shows a green tick. See [Continuous integration](#continuous-integration-ci) for how to make that mandatory.
3. You have accounts on [neon.tech](https://neon.tech), [render.com](https://render.com) and [vercel.com](https://vercel.com). Signing up with GitHub is easiest.
4. Keep a private note open (a password manager is best) for the values you'll collect along the way:
   - the two Neon connection strings
   - the Render host
   - the Vercel URL

---

## a. Neon: create the database

1. Open the Neon console and click **New Project**.
2. Fill in the project:
   - **Name:** `habitflow`
   - **Postgres version:** 16
   - **Region:** one close to your users. Remember it: Render must use the **same region** (step b).
3. Click **Create project**. Neon creates a database (called `neondb` by default) and a role for you.
4. On the project dashboard, click **Connect**. A dialog shows the connection string.
5. Turn **Connection pooling ON**, then copy the string. This is the **pooled** connection string. Its host contains `-pooler`, for example:

   ```
   postgresql://neondb_owner:XXXXXXXX@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Save it as **DATABASE_URL**. It is a secret, because it contains the password.
6. Turn **Connection pooling OFF** and copy the string again. This is the **direct** connection string (no `-pooler` in the host). Save it as **DATABASE_DIRECT_URL**. It's also a secret.
   - The app uses the pooled one, which handles many short connections well.
   - Migrations use the direct one, which Neon recommends for schema changes.
   - If the two strings are identical, you only need `DATABASE_URL`.

> You don't create any tables by hand. The API runs its migrations every time it starts (step b).

---

## b. Render: deploy the API

The repository contains a **Blueprint**, [`render.yaml`](../render.yaml), which describes the service. Most settings are already filled in.

1. In the Render dashboard, click **New +** → **Blueprint**.
2. Connect your GitHub account if asked, then choose the **HabitFlow** repository. Render finds `render.yaml` and shows one service, **habitflow-api**.
3. Before applying, open `render.yaml` on GitHub and check `region:`. It must match your Neon region:

   | Neon region | Render `region` |
   |---|---|
   | AWS Europe (Frankfurt) | `frankfurt` |
   | US East (Ohio) | `ohio` |
   | US West (Oregon) | `oregon` |
   | Asia Pacific (Singapore) | `singapore` |

   If you changed it, commit and push, then refresh the Blueprint page.
4. Render asks for the variables marked `sync: false`. Fill them in from the table below.
5. Click **Apply**. Render installs dependencies (`npm ci`), then starts the API with `npm run start:prod`, which runs the database migrations and then the server. The first deploy takes a few minutes.
6. Your service's **Logs** tab should show:
   - `== ...: migrated` lines;
   - `HabitFlow API listening`;
   - `Database connection verified`;
   - `Background jobs started` with `"runScheduler":true`.
7. Copy your service's URL from the top of the service page, for example `https://habitflow-api.onrender.com`. The **Render host** is the part without `https://`: `habitflow-api.onrender.com`.
8. Open `https://<your-render-host>/api/v1/health`. You should see:

   ```json
   { "status": "ok", "db": "ok", "time": "..." }
   ```

   `"db": "down"` means the API is running but can't reach Neon. See [Troubleshooting](#i-troubleshooting).

### Environment variables (Render → your service → Environment)

| Name | Example | Where it comes from | Secret? |
|---|---|---|---|
| `NODE_ENV` | `production` | Preset by `render.yaml` | no |
| `NODE_VERSION` | `20` | Preset (Render picks the Node version from it) | no |
| `DATABASE_URL` | `postgresql://…@ep-…-pooler.….neon.tech/neondb?sslmode=require&channel_binding=require` | Neon **pooled** string (step a.5) | **yes** |
| `DATABASE_DIRECT_URL` | `postgresql://…@ep-….….neon.tech/neondb?sslmode=require&channel_binding=require` | Neon **direct** string (step a.6). Optional | **yes** |
| `DB_SSL` | `true` | Preset. Neon only accepts TLS | no |
| `DB_POOL_MAX` | `5` | Preset (connections per instance) | no |
| `CLIENT_ORIGINS` | `https://habitflow.vercel.app` | Your Vercel URL. **Set it in step f**; until then any `https://` placeholder works, e.g. `https://example.com` | no |
| `COOKIE_SECURE` | `true` | Preset; must be `true` in production | no |
| `TRUST_PROXY` | `2` | Preset: Vercel's proxy + Render's proxy. Checked in step g | no |
| `RUN_SCHEDULER` | `true` | Preset; runs reminders and housekeeping in this instance | no |
| `LOG_LEVEL` | `info` | Preset | no |
| `SESSION_TTL_DAYS` | `30` | Preset (days a login lasts) | no |
| `SLOW_QUERY_MS` | `500` | Preset; slower queries are logged as warnings | no |
| `SENTRY_DSN` | `https://abc@o123.ingest.sentry.io/456` | Your Sentry project. Optional, leave empty to skip ([Observability](#observability)) | **yes** |
| `PORT` | `10000` | Set by Render automatically. Don't add it | no |

> **Is there a session secret to generate?** No. Sessions are random 32-byte tokens, and the database stores only their SHA-256 hash (CLAUDE.md §3.1), so no signing key exists that could leak. The secrets are the two database URLs (and the Sentry DSN, if you use one).

> If you prefer **New + → Web Service** instead of a Blueprint, use:
> - root directory `backend`
> - build command `npm ci`
> - start command `npm run start:prod`
> - health check path `/api/v1/health`
>
> Then add every variable in the table yourself.

---

## c. Seed the plans table (once)

The API needs the plan catalogue: free (10 active habits) and pro. The seed is **idempotent**, so running it twice does no harm.

**Option 1: Render Shell** (paid instance types only). Open your service → **Shell**, then run:

```bash
npm run db:seed:plans
```

**Option 2: from your own computer** (works on the free plan). This runs the seed against Neon over TLS, using the **direct** string:

```powershell
# PowerShell (Windows), inside the backend/ folder
$env:NODE_ENV = "production"
$env:DATABASE_URL = "<your Neon DIRECT connection string>"
$env:DB_SSL = "true"
npm run db:seed:plans
Remove-Item Env:DATABASE_URL   # don't leave the secret in your terminal session
```

```bash
# macOS / Linux / Git Bash, inside backend/
NODE_ENV=production DB_SSL=true DATABASE_URL='<your Neon DIRECT connection string>' npm run db:seed:plans
```

You should see `== 20261025000101-plans: migrated`.

> **Never** run `npm run db:seed` (all seeders) against production. The demo-data seeder refuses to run with `NODE_ENV=production` and stops with an error. That is deliberate.

---

## d. Point the Vercel rewrite at Render

1. Open [`frontend/vercel.json`](../frontend/vercel.json) and find the first rewrite:

   ```json
   { "source": "/api/(.*)", "destination": "https://<RENDER_API_HOST>/api/$1" }
   ```

2. Replace `<RENDER_API_HOST>` with your Render host from step b.7, with no `https://` and no trailing slash:

   ```json
   { "source": "/api/(.*)", "destination": "https://habitflow-api.onrender.com/api/$1" }
   ```

3. Keep the order. The `/api/(.*)` rewrite must come **before** the `/(.*)` → `/index.html` fallback, otherwise API calls would receive the web page. A test (`frontend/src/vercelConfig.test.js`) checks this.
4. Commit and push:

   ```bash
   git add frontend/vercel.json
   git commit -m "Point the API rewrite at Render"
   git push
   ```

---

## e. Vercel: deploy the website

1. In the Vercel dashboard, click **Add New…** → **Project**, then **Import** the HabitFlow repository.
2. Configure the project:
   - **Root Directory:** click **Edit** and choose `frontend`. This is important.
   - **Framework Preset:** Vite (detected automatically).
   - **Build Command:** `npm run build`, and **Output Directory:** `dist`. These are already set by `vercel.json`, so leave them as they are.
   - **Install Command:** `npm ci`.
   - **Environment Variables:** none. The app calls relative `/api/...` URLs, so it doesn't need to know the API's address.
3. Under **Settings → General → Node.js Version**, choose **20.x** (Vite needs 20.19 or newer). You can also do this after the first deploy.
4. Click **Deploy**. When it finishes, copy your production URL, for example `https://habitflow.vercel.app`.
5. Open that URL. You should see the login page.
   - **Don't sign up yet.** Logging in won't work until step f.

---

## f. Tell the API about the website

1. Go to Render → **habitflow-api** → **Environment**.
2. Set **CLIENT_ORIGINS** to your Vercel URL, for example `https://habitflow.vercel.app`, with no trailing slash.
   - To add a custom domain later, add it separated by a comma: `https://habitflow.vercel.app,https://habits.example.com`.
3. Click **Save, rebuild, and deploy** (or **Save Changes**, then **Manual Deploy → Deploy latest commit**).
4. Wait until the deploy shows **Live**.

---

## g. Smoke test (do all of these)

On your Vercel URL, in a normal browser window:

- [ ] **Sign up** with a real-looking email. You land on "Let's build your first habit".
- [ ] **Create a habit** (for example from a template). It appears in **To do**.
- [ ] **Complete it.** The toggle turns green and the summary shows "1 of 1 done".
- [ ] **Refresh the page.** You are still logged in and the habit is still done. This proves the cookies and the session work through the rewrite.
- [ ] **Log out**, then open `/habits`. You are sent to the login page.
- [ ] **Reminder:**
  1. Log in again and open the habit's page.
  2. Add a reminder 2–3 minutes from now, in **your** timezone (check it under Settings → Timezone).
  3. Keep the tab open.
  4. Within a minute of that time, the bell shows **1 unread**, and the panel shows "It's time for …".

  On the free Render plan the service must be awake. It is, while you're using the site.
- [ ] **Check the client IP (rate limiting).**
  1. Open Render → **Logs** and find the `request completed` line for one of your requests.
  2. Its `"clientIp"` must be **your own public IP**. Compare it with https://ifconfig.me.
  3. If it shows a different address (Vercel's or Render's), see "Everyone is rate-limited together" in [Troubleshooting](#i-troubleshooting).
- [ ] **No console errors.** Open the browser DevTools Console on your Vercel URL. There must be no "Content Security Policy" errors. The single `401` on first load is the app checking whether you're logged in, which is normal.

---

## h. Running it for real

### Custom domain (optional)

1. In Vercel, go to **Project → Settings → Domains** → **Add**, enter `habits.example.com`, and follow the DNS instructions. Vercel issues the HTTPS certificate.
2. Add the new origin to `CLIENT_ORIGINS` on Render (comma-separated) and redeploy, as in step f.
3. The API keeps its `onrender.com` address. Nobody sees it, because the rewrite hides it.

### Rolling back a bad release

- **Website:** in Vercel, go to **Deployments**, open the last good deployment → **⋯** → **Promote to Production**. This takes seconds and doesn't rebuild.
- **API:** in Render, go to **Events** (or **Deploys**), find the last good deploy → **Rollback**. Render redeploys that commit.
- **Database (careful):**
  - Migrations only move forward when the API starts.
  - Rolling the API back does **not** undo a migration. Old code generally runs fine on a newer schema when migrations only *add* things (new tables, new nullable columns), which is how this project writes them.
  - `npm run db:migrate:undo` (with the direct URL, as in step c) runs the latest migration's `down` step. That can **delete data**, for example dropping a column. Use it only after taking a backup (below), and only if you understand that migration's `down`.

### Backups and branches (Neon)

- Neon keeps a short restore history (the length depends on your plan). In **Branches**, you can create a branch **from a past point in time** to look at old data or restore it.
- Before a risky migration, create a branch from `main` named `before-<change>`. It's an instant, copy-on-write snapshot. If something goes wrong, you can point `DATABASE_URL` at that branch's connection string, or restore from it.
- For long-term backups, run `pg_dump` against the **direct** string on a schedule from a machine you control.

### Free-tier limits (check each provider's pricing page; they change)

**Render Free web service:**
- It **sleeps after about 15 minutes without requests**. While asleep, **reminders don't fire** (the scheduler isn't running) and housekeeping is delayed.
- The next visitor waits about a minute for it to wake up.
- No Shell and no one-off jobs (hence option 2 in step c).
- **Cheapest always-on option:** switch the service to the **Starter** instance type (a few dollars a month) and change `plan: free` to `plan: starter` in `render.yaml`. It never sleeps, so reminders are reliable and you get a Shell.

**Keeping a free service awake with an uptime monitor** (see [Observability](#observability)):
- An uptime check every 5 minutes keeps it awake, so reminders keep working.
- The trade-off: it uses your free instance hours around the clock (one service fits in the monthly allowance, two don't).
- A sleeping service also restarts from a cold state.
- It's fine for a personal project. For anything people depend on, use Starter.

**Neon Free:**
- Small storage and a monthly compute allowance.
- The database **suspends after a few minutes idle**, and the first query afterwards takes a moment longer.
- HabitFlow handles that: the health check reports `db: "down"` only while Neon is unreachable, and the next request reconnects.

**Vercel Hobby:** free for personal, non-commercial projects, with generous bandwidth for this app.

### Scaling to more than one API instance

- Only **one** instance should run the background jobs. Set `RUN_SCHEDULER=false` on every extra instance.
  - Notification dedupe keys make an accidental double run harmless, but it doubles the database work.
- The rate limiter keeps its counters in memory, so each instance counts separately. A shared store (Redis) is the next step (ADR-033).
- Migrations run at every start. With several instances starting at once, move `npm run db:migrate` to a pre-deploy command, which is available on paid Render plans.

---

## i. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| **404 when refreshing a page** like `/habits` | The SPA fallback is missing or above the `/api` rewrite | `frontend/vercel.json` must contain `{ "source": "/(.*)", "destination": "/index.html" }` as the **last** rewrite. Check that the Vercel Root Directory is `frontend` (otherwise `vercel.json` is ignored). |
| **Every `/api/...` call returns the web page (HTML) or 404** | The rewrite still says `<RENDER_API_HOST>`, or points to a wrong host | Step d: put the exact Render host in the rewrite, then push. Test `https://<render-host>/api/v1/health` directly. |
| **401 right after logging in** (sent back to login) | The session cookie isn't stored or sent | Use the **Vercel URL**, not the Render URL, in the browser. `COOKIE_SECURE=true` requires HTTPS, which Vercel and Render both provide. Clear the site's cookies and try again. Check that the Render Logs show `POST /api/v1/auth/login` with status 200. |
| **403 `CSRF_TOKEN_INVALID`** on save | The `csrf_token` cookie is missing or doesn't match the header | Reload the page (the app fetches a new token on start). Make sure no browser extension blocks cookies. The site must be opened on one domain only: logging in on `habitflow.vercel.app` and saving on a custom domain uses two different cookie jars. |
| **Everyone is rate-limited together** (429 for all users), or the logged `clientIp` isn't the visitor's IP | Wrong `TRUST_PROXY` hop count | The `clientIp` in the Render logs must be the visitor's IP. If it shows Vercel's address, the count is too low: try `3`. If it shows a private or odd address, try `1` and compare. Keep the value that shows your own public IP. |
| **`db: "down"`** in health, or logs say `self-signed certificate`, `no pg_hba.conf entry` or `SSL off` | TLS settings | `DB_SSL=true` is required for Neon (the API refuses to start without it for a remote host). Use the full Neon string including `?sslmode=require`. If it still fails, copy the string again from Neon's **Connect** dialog. Passwords are case-sensitive. |
| **API won't start:** `Invalid environment configuration` | A variable is missing or malformed | The log lists every bad variable. Common cases: `CLIENT_ORIGINS` with a trailing `/` or `http://`, `DB_SSL` missing, `COOKIE_SECURE=false`. |
| **CORS error in the console** | The site called the Render URL directly, or `CLIENT_ORIGINS` doesn't list the page's origin | The app must call relative `/api/...` (it does; don't add an API URL). Set `CLIENT_ORIGINS` to the exact origin shown in the address bar (`https://…`, no trailing slash) and redeploy. |
| **Plan limit / "Free plan" missing / 500 on signup** | Plans were never seeded | Run step c. |
| **Reminders never arrive** | The service was asleep (free plan), the reminder time was in a different timezone, or `RUN_SCHEDULER` is not `true` | Keep the service awake or use Starter (step h). Check Settings → Timezone and the "Background jobs started" log line. |
| **Content Security Policy errors in the console** | The inline theme script in `index.html` was changed without updating its hash | Run `npm test` in `frontend/`. The `vercelConfig` test prints the new `sha256-…` value to paste into `vercel.json`. |

---

## Continuous integration (CI)

`.github/workflows/ci.yml` runs on every push to `main` and every pull request. It runs four jobs:
- backend: lint, format check, tests with coverage, against a Postgres container;
- frontend: lint, format check, tests and build;
- Playwright end-to-end tests on three viewports (the report is uploaded when they fail);
- `npm audit`, failing on high-severity issues.

It only **tests**. Vercel and Render deploy by themselves. To stop broken code from reaching users:

1. On GitHub, go to **Settings → Branches → Add branch ruleset** (or **Add rule**) for `main`.
2. Turn on **Require a pull request before merging** (optional for a solo project).
3. Turn on **Require status checks to pass**, and add:
   - **Backend (lint, tests, coverage)**
   - **Frontend (lint, tests, build)**
   - **End-to-end (Playwright)**
   - **npm audit (fail on high)**

   The checks appear in the list after CI has run once.
4. **Render:** `render.yaml` sets `autoDeployTrigger: checksPass`, so Render deploys a commit only after its GitHub checks pass. In the dashboard this is **Settings → Auto-Deploy → After CI checks pass**.
5. **Vercel:** deploys every push by default. With branch protection on `main`, only commits that passed CI get there through pull requests. For direct pushes, you can make Vercel wait for checks under **Project → Settings → Git** (the deployment checks options).

---

## Observability

- **Logs:** the API writes one JSON line per request to stdout (Render → **Logs**). Each line has:
  - the request id (`req.id`, also returned as the `X-Request-Id` response header, so a user can quote it in a bug report);
  - the method, path and status;
  - the response time;
  - the `clientIp`.

  Secrets (passwords, tokens, cookies, `Authorization`) are always redacted.
- **Slow queries:** any database query slower than `SLOW_QUERY_MS` (500 ms) is logged as `"msg":"Slow database query"` at warn level, with its duration and the SQL with values removed.
- **Error tracking (optional, Sentry):**
  1. Create a free project at sentry.io (platform "Node.js") and copy its DSN.
  2. In `backend/`, run `npm install @sentry/node` and commit `package.json` and `package-lock.json`.
  3. Set `SENTRY_DSN` on Render.

  The logs then show "Error tracking enabled", and every unexpected 500 or crash is reported with the request id and user id only. Cookies, headers with credentials, request bodies, query strings and IP addresses are removed before sending. With `SENTRY_DSN` empty, error tracking is off and nothing is sent.
- **Uptime monitoring:**
  1. Create a free monitor at [UptimeRobot](https://uptimerobot.com) (or Better Stack): type **HTTP(s)**, URL `https://<your-vercel-url>/api/v1/health`, interval 5 minutes.
  2. Using the Vercel URL checks the whole chain: Vercel, then Render, then Neon.
  3. Add a **keyword** check for `"db":"ok"` to also catch "API up, database down".
  4. On the free Render plan, this check also keeps the service awake. See the trade-off in step h.
