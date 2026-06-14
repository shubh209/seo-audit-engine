import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/stream/:id — SSE endpoint for real-time status updates
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let interval = null;
  let heartbeat = null;

  const cleanup = () => {
    if (interval) clearInterval(interval);
    if (heartbeat) clearInterval(heartbeat);
    interval = null;
    heartbeat = null;
  };

  interval = setInterval(async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id, status, performance_score, accessibility_score,
                seo_score, overall_score, error, failed_step,
                processing_time_ms, crawl_ms, perf_ms, a11y_ms, seo_ms, report_ms,
                updated_at
         FROM jobs WHERE id = $1`,
        [id]
      );

      if (rows.length === 0) {
        sendEvent({ error: 'Job not found' });
        cleanup();
        return res.end();
      }

      const job = rows[0];
      sendEvent(job);

      if (job.status === 'complete' || job.status === 'failed') {
        cleanup();
        res.end();
      }

    } catch (err) {
      console.error('SSE polling error:', err);
      cleanup();
      res.end();
    }
  }, 2000);

  heartbeat = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 30000);

  req.on('close', cleanup);
});

export default router;
