import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/stream/:id — SSE endpoint for real-time status updates
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Poll PostgreSQL every 2 seconds and push status to browser
  const interval = setInterval(async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id, status, performance_score, accessibility_score,
                seo_score, overall_score, error, failed_step, updated_at
         FROM jobs WHERE id = $1`,
        [id]
      );

      if (rows.length === 0) {
        sendEvent({ error: 'Job not found' });
        clearInterval(interval);
        return res.end();
      }

      const job = rows[0];
      sendEvent(job);

      // Stop polling once job is terminal
      if (job.status === 'complete' || job.status === 'failed') {
        clearInterval(interval);
        res.end();
      }

    } catch (err) {
      console.error('SSE polling error:', err);
      clearInterval(interval);
      res.end();
    }
  }, 2000);

  // Heartbeat every 30s to keep the connection alive
  const heartbeat = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 30000);

  // Clean up when browser disconnects
  req.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

export default router;