# SEO Audit Engine

Distributed website audit platform: submit a URL, get a unified performance, accessibility, and SEO report.

**Live app:** [seo-audit-engine.pages.dev](https://seo-audit-engine.pages.dev)  
**API:** [seo-audit-engine.onrender.com](https://seo-audit-engine.onrender.com/health)

## What it does

1. User submits a URL on the frontend
2. Express API validates the URL, deduplicates recent audits (24h), and enqueues a BullMQ job
3. Worker runs a 5-stage pipeline: Playwright crawl → response-time performance check → axe-core accessibility → 7 custom SEO rules → report build
4. Results stored in Neon PostgreSQL; terminal jobs cached in Upstash Redis (`job:v2:*`)
5. Frontend streams progress via SSE (falls back to polling), shows step timings, and renders a scored report with PDF export

## Architecture

```
frontend/          Vanilla JS on Cloudflare Pages
api/               Express REST API on Render
worker/            BullMQ consumer on Render (concurrency: 1 on free tier)
infra/             PostgreSQL schema + migrations
scripts/           measure-metrics.js, e2e-smoke-test.js, weakness-test.js
.github/workflows/ ci.yml + keep-alive.yml (14-min cron, free)
```

## Tech stack

JavaScript, Node.js, Express, BullMQ, Playwright, axe-core, PostgreSQL (Neon), Redis (Upstash), Render, Cloudflare Pages, GitHub Actions, Jest

**Note:** Performance scoring uses response-time estimation, not Google Lighthouse (dropped for reliability on free-tier workers).

## Local development

### Prerequisites

- Node.js 22+
- PostgreSQL and Redis (or Neon + Upstash connection strings)

### Setup

```bash
# API
cd api && npm install
cp .env.example .env   # add DATABASE_URL, REDIS_URL, PORT

# Worker
cd ../worker && npm install
cp .env.example .env   # same DATABASE_URL, REDIS_URL

# Apply schema
psql $DATABASE_URL -f ../infra/init.sql
# Or run migrations incrementally from infra/migrations/
```

### Run

```bash
# Terminal 1 — API
cd api && npm run dev

# Terminal 2 — Worker
cd worker && npm run dev

# Terminal 3 — Frontend (static server)
cd frontend && npx serve .
# Update API_BASE in app.js if not pointing to production
```

### Tests

```bash
cd api && npm test
cd worker && npm test
```

### Measured metrics (production)

```bash
node scripts/measure-metrics.js
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs` | Submit audit `{ "url": "https://..." }` |
| GET | `/api/jobs/:id` | Job status and full report |
| GET | `/api/stream/:id` | SSE progress stream |
| GET | `/api/history` | Paginated job history |
| GET | `/health` | API health check |

## CI/CD

GitHub Actions runs API and worker test suites on every push/PR to `main`.

**Keep-alive (free):** `.github/workflows/keep-alive.yml` pings API `/health` and the worker every 14 minutes to reduce Render free-tier spin-down. Also trigger manually via **Actions → Keep Alive → Run workflow**.

## Project docs (repo root)

- `seo-audit-engine.md` — resume project write-up
- `seo-audit-engine-context.md` — interview context and bullet candidates
- `seo-audit-engine-metrics-backlog.md` — measured vs estimated metrics
- `seo-audit-engine-keyword-mapping.md` — role keyword coverage
