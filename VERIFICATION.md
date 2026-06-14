# Verification Loop

Run these after changes to confirm the project is healthy.

## 1. Unit tests

```bash
cd api && npm test      # expect 18 passed
cd ../worker && npm test # expect 31 passed
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
| Worker tests (31) | 2026-06-05 | PASS |
| measure-metrics.js | 2026-06-05 | 7 complete, 2 failed, median 20323ms, p95 55087ms |
| Migration 002 | 2026-06-05 | Applied to Neon |
