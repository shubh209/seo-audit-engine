import { Router } from 'express';
import pool from '../db.js';
import boss, { startBoss } from '../queue.js';

const router = Router();

/**
 * Normalise a URL for deduplication:
 *  - strips fragments (#...)
 *  - strips trailing slash
 *  - lowercases scheme + host
 * Query params are preserved because /page?lang=en and /page?lang=fr are
 * genuinely different pages.
 */
const normaliseUrl = (raw) => {
  const u = new URL(raw);
  u.hash = '';
  return u.href.replace(/\/$/, '');
};

// POST /api/jobs — submit a new audit job
router.post('/', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let normalisedUrl;
  try {
    normalisedUrl = normaliseUrl(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    // Ensure pg-boss is running before we try to send a job
    await startBoss();

    // Return a cached result if we already audited this URL in the last 24 hours
    const { rows: existing } = await pool.query(
      `SELECT id, status, overall_score, created_at
       FROM jobs
       WHERE url = $1
         AND status = 'complete'
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalisedUrl]
    );

    if (existing.length > 0) {
      return res.status(200).json({
        jobId: existing[0].id,
        cached: true,
        message: 'Returning cached audit from the last 24 hours',
      });
    }

    // Insert the job row first so the worker can update it
    const { rows } = await pool.query(
      `INSERT INTO jobs (url, status)
       VALUES ($1, 'queued')
       RETURNING id`,
      [normalisedUrl]
    );

    const jobId = rows[0].id;

    // Enqueue via pg-boss — no Redis involved
    await boss.send('seo-audits', { jobId, url: normalisedUrl }, {
      retryLimit: 3,
      retryDelay: 5,          // seconds between retries
      retryBackoff: true,     // exponential backoff
      expireInHours: 1,       // abandon job if not picked up within 1 hour
    });

    res.status(201).json({ jobId, cached: false });

  } catch (err) {
    console.error('POST /api/jobs error:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /api/jobs/:id — get job status and result
// Completed jobs are cheap to re-query (indexed by id); no separate cache needed.
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, url, status, performance_score, accessibility_score,
              seo_score, overall_score, report, error, failed_step,
              processing_time_ms, checks_run,
              crawl_ms, perf_ms, a11y_ms, seo_ms, report_ms,
              created_at, updated_at
       FROM jobs WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error('GET /api/jobs/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

export default router;
