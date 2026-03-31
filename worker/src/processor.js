import pool from './db.js';
import { crawlPage } from './steps/crawlPage.js';
import { runLighthouse } from './steps/runLighthouse.js';
import { runAccessibility } from './steps/runAccessibility.js';
import { runSEOChecks } from './steps/runSEOChecks.js';
import { buildReport } from './steps/buildReport.js';

// Helper to update job status in PostgreSQL
const updateStatus = async (jobId, status) => {
  await pool.query(
    `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, jobId]
  );
  console.log(`[${jobId}] Status → ${status}`);
};

export const processJob = async (jobId, url) => {
  const startTime = Date.now();

  try {
    // Step 1: Crawl the page
    await updateStatus(jobId, 'crawling');
    const pageData = await crawlPage(url);

    // Step 2: Run Lighthouse performance scoring
    await updateStatus(jobId, 'scoring_performance');
    const lighthouseData = await runLighthouse(url);

    // Step 3: Run accessibility checks
    await updateStatus(jobId, 'checking_accessibility');
    const accessibilityData = await runAccessibility(pageData.html, url);

    // Step 4: Run SEO checks
    await updateStatus(jobId, 'checking_seo');
    const seoData = await runSEOChecks(pageData, url);

    // Step 5: Build the final report
    await updateStatus(jobId, 'building_report');
    const report = buildReport({
      url,
      lighthouseData,
      accessibilityData,
      seoData
    });

    // Calculate scores
    const processingTimeMs = Date.now() - startTime;
    const checksRun = 
      seoData.checks.length + 
      accessibilityData.violations.length + 
      accessibilityData.passes;

    // Save completed report to PostgreSQL
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
        updated_at = NOW()
       WHERE id = $8`,
      [
        report.scores.performance,
        report.scores.accessibility,
        report.scores.seo,
        report.scores.overall,
        JSON.stringify(report),
        processingTimeMs,
        checksRun,
        jobId
      ]
    );

    console.log(`[${jobId}] Complete in ${processingTimeMs}ms`);

  } catch (err) {
    console.error(`[${jobId}] Failed at step:`, err.message);

    await pool.query(
      `UPDATE jobs SET
        status = 'failed',
        error = $1,
        updated_at = NOW()
       WHERE id = $2`,
      [err.message, jobId]
    );

    throw err; // Re-throw so BullMQ knows the job failed and can retry
  }
};