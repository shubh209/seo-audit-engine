import pool from './db.js';
import { crawlPage } from './steps/crawlPage.js';
import { runPerformanceCheck } from './steps/runPerformanceCheck.js';
import { runAccessibility } from './steps/runAccessibility.js'; // fallback if crawl omits a11y
import { runSEOChecks } from './steps/runSEOChecks.js';
import { buildReport } from './steps/buildReport.js';

const updateStatus = async (jobId, status) => {
  await pool.query(
    `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, jobId]
  );
  console.log(`[${jobId}] Status → ${status}`);
};

const timeStep = async (fn) => {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
};

export const processJob = async (jobId, url) => {
  const startTime = Date.now();
  let currentStep = 'crawling';
  const stepTimings = {};

  try {
    await updateStatus(jobId, 'crawling');
    currentStep = 'crawling';
    const crawl = await timeStep(() => crawlPage(url));
    const pageData = crawl.result;
    stepTimings.crawl_ms = pageData.crawlMs ?? crawl.ms;
    stepTimings.a11y_ms = pageData.a11yMs ?? 0;

    await updateStatus(jobId, 'scoring_performance');
    currentStep = 'scoring_performance';
    const perf = await timeStep(() => runPerformanceCheck(url, pageData.loadTimeMs));
    stepTimings.perf_ms = perf.ms;
    const performanceData = perf.result;

    await updateStatus(jobId, 'checking_accessibility');
    currentStep = 'checking_accessibility';
    let accessibilityData = pageData.accessibilityData;
    if (!accessibilityData) {
      const a11y = await timeStep(() => runAccessibility(pageData.html, url));
      stepTimings.a11y_ms = a11y.ms;
      accessibilityData = a11y.result;
    }

    await updateStatus(jobId, 'checking_seo');
    currentStep = 'checking_seo';
    const seo = await timeStep(() => runSEOChecks(pageData, url));
    stepTimings.seo_ms = seo.ms;
    const seoData = seo.result;

    await updateStatus(jobId, 'building_report');
    currentStep = 'building_report';
    const reportBuild = await timeStep(() => Promise.resolve(buildReport({
      url,
      lighthouseData: performanceData,
      accessibilityData,
      seoData
    })));
    stepTimings.report_ms = reportBuild.ms;
    const report = reportBuild.result;

    const processingTimeMs = Date.now() - startTime;
    const checksRun =
      seoData.checks.length +
      accessibilityData.violations.length +
      accessibilityData.passes;

    await pool.query(
      `UPDATE jobs SET
        status = 'complete',
        performance_score = $1,
        accessibility_score = $2,
        seo_score = $3,
        overall_score = $4,
        report = $5,
        processing_time_ms = $6,
        checks_run = $7,
        crawl_ms = $8,
        perf_ms = $9,
        a11y_ms = $10,
        seo_ms = $11,
        report_ms = $12,
        updated_at = NOW()
       WHERE id = $13`,
      [
        report.scores.performance,
        report.scores.accessibility,
        report.scores.seo,
        report.scores.overall,
        JSON.stringify(report),
        processingTimeMs,
        checksRun,
        stepTimings.crawl_ms,
        stepTimings.perf_ms,
        stepTimings.a11y_ms,
        stepTimings.seo_ms,
        stepTimings.report_ms,
        jobId
      ]
    );

    console.log(`[${jobId}] Complete in ${processingTimeMs}ms`, stepTimings);

  } catch (err) {
    console.error(`[${jobId}] Failed at step ${currentStep}:`, err.message);

    await pool.query(
      `UPDATE jobs SET
        status = 'failed',
        error = $1,
        failed_step = $2,
        updated_at = NOW()
       WHERE id = $3`,
      [err.message, currentStep, jobId]
    );

    throw err;
  }
};
