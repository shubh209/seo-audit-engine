#!/usr/bin/env node
/**
 * End-to-end smoke test against live API.
 * Usage: node scripts/e2e-smoke-test.js [baseUrl]
 */
const API_BASE = (process.argv[2] || 'https://seo-audit-engine.onrender.com').replace(/\/$/, '');

const log = (label, data) => console.log(`[${label}]`, typeof data === 'string' ? data : JSON.stringify(data));

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function timedFetch(url, options = {}) {
  const start = Date.now();
  const res = await fetch(url, options);
  const ms = Date.now() - start;
  let body;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { res, body, ms };
}

async function testHealth() {
  const { res, body, ms } = await timedFetch(`${API_BASE}/health`);
  if (res.status !== 200) fail(`health status ${res.status}`);
  if (body.status !== 'ok') fail('health body invalid');
  log('health', { ms, status: body.status });
  if (ms > 5000) log('warn', `health slow: ${ms}ms (cold start?)`);
}

async function testValidation() {
  const { res, body } = await timedFetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (res.status !== 400) fail(`expected 400 for missing url, got ${res.status}`);
  log('validation', body.error);
}

async function testAudit(url) {
  const submitStart = Date.now();
  const { res, body } = await timedFetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  if (![200, 201].includes(res.status)) fail(`submit failed: ${res.status} ${JSON.stringify(body)}`);
  log('submit', { url, jobId: body.jobId, cached: body.cached, status: res.status });

  const jobId = body.jobId;
  if (body.cached) {
    const { body: job } = await timedFetch(`${API_BASE}/api/jobs/${jobId}`);
    if (job.status !== 'complete') fail(`cached job not complete: ${job.status}`);
    log('cached-result', { overall: job.overall_score, ms: job.processing_time_ms });
    return { jobId, cached: true, totalMs: Date.now() - submitStart };
  }

  let lastStatus = 'queued';
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const { body: job } = await timedFetch(`${API_BASE}/api/jobs/${jobId}`);
    if (job.status !== lastStatus) {
      log('status', job.status);
      lastStatus = job.status;
    }
    if (job.status === 'complete') {
      const totalMs = Date.now() - submitStart;
      log('complete', {
        totalMs,
        processing_time_ms: job.processing_time_ms,
        overall: job.overall_score,
        perf: job.performance_score,
        a11y: job.accessibility_score,
        seo: job.seo_score,
        crawl_ms: job.crawl_ms,
        perf_ms: job.perf_ms,
        a11y_ms: job.a11y_ms
      });
      if (!job.report?.scores) fail('missing report scores');
      if (job.processing_time_ms > 90000) log('warn', `audit very slow: ${job.processing_time_ms}ms`);
      return { jobId, cached: false, totalMs, job };
    }
    if (job.status === 'failed') {
      fail(`audit failed: ${job.error} (step: ${job.failed_step})`);
    }
    await sleep(2000);
  }
  fail('audit timed out after 120s');
}

async function testCacheHit(url, jobId) {
  const { body } = await timedFetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!body.cached) log('warn', 'expected cache hit on repeat URL within 24h');
  else if (body.jobId === jobId) log('cache-hit', 'OK same jobId returned');
}

async function testHistory() {
  const { res, body } = await timedFetch(`${API_BASE}/api/history?limit=5`);
  if (res.status !== 200) fail(`history status ${res.status}`);
  if (!Array.isArray(body.jobs)) fail('history missing jobs array');
  log('history', { count: body.jobs.length, hasMore: body.hasMore });
}

async function main() {
  console.log(`\n=== E2E smoke test → ${API_BASE} ===\n`);
  await testHealth();
  await testValidation();
  await testHistory();
  const result = await testAudit('https://example.com');
  await testCacheHit('https://example.com', result.jobId);
  console.log('\n=== ALL CHECKS PASSED ===\n');
}

main().catch((err) => {
  console.error(err);
  fail(err.message);
});
