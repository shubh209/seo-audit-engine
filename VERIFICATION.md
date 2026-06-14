# Verification Loop

Run these after changes to confirm the project is healthy.

## 1. Unit tests

```bash
cd api && npm test      # expect 18 passed
cd ../worker && npm test # expect 34 passed
node ../scripts/weakness-test.js   # live edge-case battery
node ../scripts/benchmark-audit.js # fresh-URL latency check
```

## 2. Production metrics (Neon)

```bash
cd api && node ../scripts/measure-metrics.js
```

Compare output to `seo-audit-engine-metrics-backlog.md` **Actual** column.

## 3. Live smoke check

| Check | URL | Expected |
|-------|-----|----------|
| API health | https://seo-audit-engine.onrender.com/health | `{ "status": "ok" }` |
| Frontend loads | https://seo-audit-engine.pages.dev | Submit form visible |
| Submit audit | Any public URL | Progress stepper → report |

## 4. Honesty checklist

- [ ] UI does **not** claim Google Lighthouse (uses response time scoring)
- [ ] Frontend uses SSE with polling fallback (`app.js` → `trackJobProgress`)
- [ ] Resume bullets use `[MEASURED]` only for values from `measure-metrics.js` or test runs

## Last verified

| Check | Date | Result |
|-------|------|--------|
| API tests (18) | 2026-06-05 | PASS |
| Worker tests (34) | 2026-06-05 | PASS |
| weakness-test.js (10/10) | 2026-06-05 | PASS |
| Warm audit benchmark | 2026-06-05 | ~4.2s processing, ~5.5s total wait |
| measure-metrics.js | 2026-06-05 | 11 complete, 3 failed, median 20323ms (includes pre-opt jobs) |
| Migration 002 | 2026-06-05 | Applied to Neon |
