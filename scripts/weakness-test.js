#!/usr/bin/env node
/**
 * Extended weakness / edge-case tests against live API.
 */
const API = 'https://seo-audit-engine.onrender.com/api';

const tests = [];
const pass = (name) => { tests.push({ name, ok: true }); console.log(`PASS ${name}`); };
const fail = (name, detail) => { tests.push({ name, ok: false, detail }); console.log(`FAIL ${name}: ${detail}`); };

async function req(path, options = {}) {
  const start = Date.now();
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { res, body, ms: Date.now() - start };
}

async function auditUntilDone(url, timeoutMs = 90000) {
  const { res, body } = await req('/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (![200, 201].includes(res.status)) throw new Error(`submit ${res.status}`);
  const jobId = body.jobId;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { body: job } = await req(`/jobs/${jobId}`);
    if (job.status === 'complete') return { job, waitMs: Date.now() - start, cached: body.cached };
    if (job.status === 'failed') return { job, waitMs: Date.now() - start, failed: true };
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('timeout');
}

console.log('\n=== Weakness test battery ===\n');

// 1. Invalid URL formats
const invalid = await req('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'not-a-url' }) });
invalid.res.status === 400 ? pass('rejects malformed URL') : fail('rejects malformed URL', invalid.res.status);

// 2. Missing body field
const missing = await req('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
missing.res.status === 400 ? pass('rejects missing URL') : fail('rejects missing URL', missing.res.status);

// 3. Unknown job ID
const unknown = await req('/jobs/00000000-0000-0000-0000-000000000000');
unknown.res.status === 404 ? pass('404 for unknown job') : fail('404 for unknown job', unknown.res.status);

// 4. CORS preflight from frontend origin
const cors = await fetch('https://seo-audit-engine.onrender.com/api/jobs', {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://seo-audit-engine.pages.dev',
    'Access-Control-Request-Method': 'POST'
  }
});
cors.headers.get('access-control-allow-origin') ? pass('CORS allows pages.dev origin') : fail('CORS', 'missing ACAO header');

// 5. SSE endpoint responds
const sseRes = await fetch('https://seo-audit-engine.onrender.com/api/stream/00000000-0000-0000-0000-000000000000');
const sseType = sseRes.headers.get('content-type') || '';
sseType.includes('text/event-stream') ? pass('SSE content-type') : fail('SSE content-type', sseType);

// 6. Fresh audit on lightweight site (performance baseline)
try {
  const { job, waitMs } = await auditUntilDone('https://info.cern.ch');
  if (job.processing_time_ms < 15000) pass(`fast site audit ${job.processing_time_ms}ms (wait ${waitMs}ms)`);
  else fail('fast site audit', `slow: ${job.processing_time_ms}ms`);
  if (job.crawl_ms != null) pass(`step timings exposed crawl=${job.crawl_ms}ms`);
  else fail('step timings', 'crawl_ms missing from API — redeploy API');
} catch (e) {
  fail('fast site audit', e.message);
}

// 7. Unreachable domain should fail gracefully
try {
  const { failed, job } = await auditUntilDone('https://this-domain-does-not-exist-xyz123.com', 60000);
  failed ? pass(`unreachable domain fails: ${job.error?.slice(0, 60)}`) : fail('unreachable domain', 'should fail');
} catch (e) {
  pass(`unreachable domain times out or fails: ${e.message.slice(0, 50)}`);
}

// 8. Frontend serves HTML
const fe = await fetch('https://seo-audit-engine.pages.dev/');
const html = await fe.text();
fe.ok && html.includes('SEO') ? pass('frontend loads audit UI') : fail('frontend', fe.status);
html.includes('Lighthouse') ? fail('frontend still mentions Lighthouse') : pass('frontend Lighthouse copy removed');

const failed = tests.filter((t) => !t.ok);
console.log(`\n=== ${tests.length - failed.length}/${tests.length} passed ===`);
if (failed.length) {
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}
