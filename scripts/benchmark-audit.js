#!/usr/bin/env node
/**
 * Fresh-URL performance benchmark — bypasses 24h URL cache.
 */
const API = 'https://seo-audit-engine.onrender.com/api';
const url = `https://example.org/?bench=${Date.now()}`;

async function main() {
  console.log(`\nBenchmark URL: ${url}\n`);
  const t0 = Date.now();
  const submit = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const { jobId, cached } = await submit.json();
  console.log(`submit: ${Date.now() - t0}ms`, { jobId, cached });

  while (Date.now() - t0 < 120000) {
    const res = await fetch(`${API}/jobs/${jobId}`);
    const job = await res.json();
    if (job.status === 'complete' || job.status === 'failed') {
      console.log('\nResult:', {
        status: job.status,
        totalWaitMs: Date.now() - t0,
        processing_time_ms: job.processing_time_ms,
        crawl_ms: job.crawl_ms,
        perf_ms: job.perf_ms,
        a11y_ms: job.a11y_ms,
        seo_ms: job.seo_ms,
        report_ms: job.report_ms,
        overall_score: job.overall_score,
        fromCache: job.fromCache
      });
      process.exit(job.status === 'complete' ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.error('timeout');
  process.exit(1);
}

main();
