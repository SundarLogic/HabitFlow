# HabitFlow

HabitFlow is a habit-tracking SaaS. You create recurring habits (daily, selected weekdays, or a weekly target), mark them complete in seconds, and track streaks, completion rates and long-term progress. The first release is a responsive React web app on a Node.js/Express + PostgreSQL REST API that a future mobile client will reuse.

- Product requirements: [docs/HabitFlow_PRD.md](docs/HabitFlow_PRD.md)
- Engineering rules and decisions (source of truth): [CLAUDE.md](CLAUDE.md)
- Decision log: [docs/DECISIONS.md](docs/DECISIONS.md)
- Database schema (ERD): [docs/ERD.md](docs/ERD.md)

## Repository layout

```
.
├── backend/              Node.js + Express API (scaffold)
├── frontend/             React (Vite) web app
├── docker/postgres/init/ Postgres init scripts (creates dev + test DBs)
├── docs/                 PRD and decision records
├── docker-compose.yml    Local PostgreSQL 16
└── CLAUDE.md             Architecture, conventions, commands
```

## Prerequisites

- **Node.js 20** (`nvm use` reads `.nvmrc`)
- **Docker Desktop** (or Docker Engine + Compose v2)
- Git

## 1. Start PostgreSQL

```bash
cp .env.example .env          # then set a real POSTGRES_PASSWORD
docker compose up -d
docker compose ps             # wait until STATUS shows "healthy"
```

Check that both databases exist:

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "\l habitflow_*"'
```

You should see `habitflow_dev` and `habitflow_test`.

> **Port already in use?** If a local PostgreSQL already listens on 5432, set `POSTGRES_PORT=5433` (or any free port) in `.env`, and use the same value for `DB_PORT` in `backend/.env`.

> The init script runs only when the data volume is empty. If you change database names or credentials later, recreate the volume with `docker compose down -v` (this **deletes all local data**).

Stop with `docker compose down`.

## 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env     # set DB_PASSWORD and TEST_DATABASE_URL to match the root .env;
                         # DB_PORT must equal POSTGRES_PORT
npm run db:migrate
npm run db:seed          # plans + demo data (login: demo@habitflow.local / habitflow-demo)
npm run dev              # http://localhost:3000/api/v1/health
```

The API validates every environment variable at startup. If something is missing or malformed, it exits and lists exactly which variables to fix. [backend/.env.example](backend/.env.example) documents each one.

Expected health response:

```json
{ "status": "ok", "db": "ok", "time": "2026-10-15T06:36:52.431Z" }
```

## 3. Frontend setup

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173 (start the backend first)
```

The dev server proxies `/api` to the backend on port 3000, so the browser talks to one origin and the login cookies just work. If your API runs elsewhere: `BACKEND_URL=http://localhost:4000 npm run dev`.

Sign up at http://localhost:5173/signup, or log in with the demo account after `npm run db:seed` in `backend/`: `demo@habitflow.local` / `habitflow-demo`.

## 4. Running tests

Backend (Jest + Supertest, against `habitflow_test`; Postgres must be running):

```bash
cd backend
npm test            # migrates the test DB, then runs unit + integration tests
npm run test:coverage   # same, and fails below the coverage targets (services/domain 85%, streaks/analytics 100%)
npm run lint
```

Frontend (Vitest + React Testing Library + MSW; no backend needed):

```bash
cd frontend
npm test
npm run lint
```

End-to-end (Playwright, real browser + real API, on desktop, Pixel 5 and a 375 px phone; includes the PRD user stories and axe accessibility checks in light and dark mode; Postgres must be running):

```bash
cd frontend
npx playwright install chromium   # first time only
npm run test:e2e                  # starts its own API (:3100, test DB) and web server (:5174)
```

Performance (development database; adds perf-*@habitflow.local users):

```bash
cd backend
npm run perf:seed    # 20 users x 50 habits x 2 years of history
npm run perf:bench   # EXPLAIN plans + p50/p95 per endpoint; fails if a p95 is >= 200 ms
```

What was checked before release, and the known limitations: [docs/QA_REPORT.md](docs/QA_REPORT.md).
See [CLAUDE.md §7](CLAUDE.md) for the full command list.
