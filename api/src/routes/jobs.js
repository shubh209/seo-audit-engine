import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import pool from '../db.js';
import redis from '../redis.js';
import auditQueue from '../queue.js';

const router = Router();

// POST /api/jobs — submit a new audit job
router.post('/', async (req, res) => {
  const { url } = req.body;

  // Basic validation
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url); // Throws if URL is invalid
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    // Check if we already have a recent completed audit for this URL
    // "Recent" = within the last 24 hours
    const { rows: existing } = await pool.query(
      `SELECT id, status, overall_score, created_at 
       FROM jobs 
       WHERE url = $1 
       AND status = 'complete' 
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC 
       LIMIT 1`,
      [url]
    );

    if (existing.length > 0) {
        return res.status(200).json({
            jobId: existing[0].id,
            cached: true,
            message: 'Returning cached audit from the last 24 hours'
        });
    }

    // Create a new job record in PostgreSQL
    const { rows } = await pool.query(
      `INSERT INTO jobs (url, status) 
       VALUES ($1, 'queued') 
       RETURNING id`,
      [url]
    );

    const jobId = rows[0].id;

    // Add to BullMQ queue
    await auditQueue.add('audit', { jobId, url }, { jobId });

    res.status(201).json({ jobId, cached: false });

  } catch (err) {
    console.error('POST /api/jobs error:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /api/jobs/:id — get job status and result
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check Redis cache first
    const cached = await redis.get(`job:${id}`);
    if (cached) {
      return res.json({ ...JSON.parse(cached), fromCache: true });
    }

    const { rows } = await pool.query(
      `SELECT id, url, status, performance_score, accessibility_score,
              seo_score, overall_score, report, error, failed_step,
              processing_time_ms, checks_run, created_at, updated_at
       FROM jobs WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = rows[0];

    // Only cache completed or failed jobs — in-progress jobs change constantly
    if (job.status === 'complete' || job.status === 'failed') {
      await redis.setex(`job:${id}`, 86400, JSON.stringify(job)); // 24hr TTL
    }

    res.json(job);

  } catch (err) {
    console.error('GET /api/jobs/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

export default router;