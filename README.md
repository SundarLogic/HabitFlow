# HabitFlow

HabitFlow is a habit-tracking SaaS. You create recurring habits (daily, selected weekdays, or a weekly target), mark them complete in seconds, and track streaks, completion rates and long-term progress. The first release is a responsive React web app on a Node.js/Express + PostgreSQL REST API that a future mobile client will reuse.

- Product requirements: [docs/HabitFlow_PRD.md](docs/HabitFlow_PRD.md)
- Engineering rules and decisions (source of truth): [CLAUDE.md](CLAUDE.md)
- Decision log: [docs/DECISIONS.md](docs/DECISIONS.md)

## Repository layout

```
.
├── backend/              Node.js + Express API (scaffold)
├── frontend/             React (Vite) app (not started)
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
npm run db:seed
npm run dev              # http://localhost:3000/api/v1/health
```

The API validates every environment variable at startup. If something is missing or malformed, it exits and lists exactly which variables to fix. [backend/.env.example](backend/.env.example) documents each one.

Expected health response:

```json
{ "status": "ok", "db": "ok", "time": "2026-10-15T06:36:52.431Z" }
```

## 3. Frontend setup

_Coming in a later phase._

## 4. Running tests

Backend (Jest + Supertest, against `habitflow_test`; Postgres must be running):

```bash
cd backend
npm test            # migrates the test DB, then runs unit + integration tests
npm run lint
```

Frontend (Vitest + RTL) and E2E (Playwright): _coming in later phases._

See [CLAUDE.md §7](CLAUDE.md) for the full command list.
