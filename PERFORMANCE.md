# Performance & Platform Notes

## Why Render feels slow

### Deploy time (5–15+ minutes on worker)

| Cause | Detail |
|-------|--------|
| **Playwright browser download** | Worker installs Chromium (~150–300MB) on every build unless cached in Docker |
| **Two separate services** | API + worker each run `npm install` independently |
| **Free tier build CPU** | Shared, low priority build machines |
| **No Dockerfile in repo** | Render runs plain `npm install` without layer caching |

**Mitigations:** Dockerfile with pre-baked Playwright (see `worker/Dockerfile`), or Render paid tier with persistent disk. API-only service deploys in ~2 min; worker is the slow one.

### API response time (30s+ sometimes)

| Cause | Detail |
|-------|--------|
| **Free tier spin-down** | Service sleeps after ~15 min idle; first request wakes it (often 30–90s) |
| **Cold start** | Measured: warm health check ~0.3s; cold can exceed 30s |

**Mitigations:** Render Starter ($7/mo) disables spin-down, or external uptime ping (UptimeRobot every 5 min).

---

## Why audits are slow (median ~20s, p95 ~55s)

### Root causes found in code

| Issue | Impact | Status |
|-------|--------|--------|
| **Two Chromium launches per audit** | crawl + a11y each launched full browser (~5–10s each on 512MB RAM) | **Fixed** — shared browser singleton |
| **Duplicate HTTP fetch** | Crawl navigates to URL, then perf step fetched same URL again | **Fixed** — perf scored from crawl timing |
| **Sequential 5-step pipeline** | Cannot overlap crawl/perf/a11y | By design (acceptable) |
| **60s crawl timeout** | Slow sites wait up to 45s now (reduced) | **Reduced** to 45s |
| **Concurrency 3 on free tier** | 3 Chromium instances × 512MB = thrashing/OOM | **Default now 1** (`WORKER_CONCURRENCY`) |
| **5 Postgres writes per job** | Status update each step adds latency | Minor (~100–300ms total) |

### Expected improvement after fixes

Rough estimate for typical marketing site on Render free tier:

| Before | After (estimated) |
|--------|-------------------|
| 20–55s | **12–35s** |

Run new audits, then: `cd api && node ../scripts/measure-metrics.js`

---

## Platform alternatives

Render free tier is a poor fit for **Playwright workers**. Better options:

| Platform | Best for | Cost | Playwright fit |
|----------|----------|------|----------------|
| **Render Starter** | Minimal change, stay on Render | ~$7/mo per service | OK with 512MB–1GB if concurrency=1 |
| **Fly.io** | Always-on VM, Docker, more RAM | ~$5–7/mo | **Good** — 1GB+ machines |
| **Railway** | Easy deploy, monorepo | ~$5/mo hobby | **Good** with Dockerfile |
| **Google Cloud Run** | Scale to zero, pay per audit | ~$0 idle, per request | **Good** if memory set to 2Gi |
| **Hetzner VPS + Docker** | Cheapest always-on | ~€4/mo | **Best value** for portfolio |
| **Vercel / Cloudflare Workers** | Frontend only | Free | **Bad** — no long-running Playwright |
| **Browserless.io** | Hosted browser API | Usage based | **Good** — worker becomes light API client |

### Recommendation

1. **Short term:** Deploy pipeline fixes (shared browser, concurrency=1) on current Render setup.
2. **If still too slow:** Move **worker only** to **Fly.io** (1GB RAM, Docker) keeping API on Render + frontend on Cloudflare.
3. **If budget allows:** Render Starter on worker ($7/mo) eliminates spin-down and gives more headroom.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `WORKER_CONCURRENCY` | `1` | Job parallelization (use 2–3 only on 1GB+ RAM) |
| `DATABASE_URL` | — | Neon PostgreSQL |
| `REDIS_URL` | — | Upstash Redis / BullMQ |
