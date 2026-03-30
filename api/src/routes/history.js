import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/history — cursor-based paginated job history
router.get('/', async (req, res) => {
  const { cursor, limit = 20 } = req.query;
  const pageSize = Math.min(Number(limit), 100);

  try {
    let query = `
      SELECT id, url, status, overall_score, 
             processing_time_ms, created_at
      FROM jobs
    `;
    const params = [];

    if (cursor) {
      query += ` WHERE created_at < $1`;
      params.push(new Date(cursor));
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(pageSize + 1); // fetch one extra to know if there's a next page

    const { rows } = await pool.query(query, params);
    const hasMore = rows.length > pageSize;
    const jobs = rows.slice(0, pageSize);

    res.json({
      jobs,
      nextCursor: hasMore ? jobs[jobs.length - 1].created_at : null,
      hasMore
    });

  } catch (err) {
    console.error('GET /api/history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;