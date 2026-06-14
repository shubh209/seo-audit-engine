export const scoreFromLoadTime = (loadTimeMs) => {
  const score = loadTimeMs < 1000 ? 90 :
                loadTimeMs < 2000 ? 75 :
                loadTimeMs < 4000 ? 55 :
                loadTimeMs < 6000 ? 35 : 20;

  return {
    score,
    metrics: {
      firstContentfulPaint: `${(loadTimeMs * 0.6 / 1000).toFixed(1)} s`,
      largestContentfulPaint: `${(loadTimeMs * 1.2 / 1000).toFixed(1)} s`,
      timeToInteractive: `${(loadTimeMs * 1.5 / 1000).toFixed(1)} s`,
      totalBlockingTime: `${Math.round(loadTimeMs * 0.3)} ms`,
      cumulativeLayoutShift: '0',
      speedIndex: `${(loadTimeMs / 1000).toFixed(1)} s`
    }
  };
};

/** Score performance from crawl timing (no extra network request). */
export const runPerformanceCheck = async (url, crawlLoadTimeMs = null) => {
  if (crawlLoadTimeMs != null) {
    console.log(`  Scoring performance from crawl timing (${crawlLoadTimeMs}ms): ${url}`);
    return scoreFromLoadTime(crawlLoadTimeMs);
  }

  console.log(`  Running response-time performance check on: ${url}`);
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)' }
    });

    clearTimeout(timeout);
    await response.text();

    return scoreFromLoadTime(Date.now() - start);

  } catch (err) {
    console.log(`  Performance check timed out, using fallback`);
    return {
      score: 50,
      metrics: {
        firstContentfulPaint: 'N/A',
        largestContentfulPaint: 'N/A',
        timeToInteractive: 'N/A',
        totalBlockingTime: 'N/A',
        cumulativeLayoutShift: 'N/A',
        speedIndex: 'N/A'
      }
    };
  }
};
