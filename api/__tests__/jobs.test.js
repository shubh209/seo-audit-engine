import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { jest } from '@jest/globals';

// ── Mock dependencies before importing routes ──────────────────────────────

jest.unstable_mockModule('../src/db.js', () => ({
  default: { query: jest.fn() }
}));

// queue.js now exports a pg-boss instance (default) and startBoss()
jest.unstable_mockModule('../src/queue.js', () => ({
  default: {
    send: jest.fn().mockResolvedValue('mock-job-id'),
    on: jest.fn(),
  },
  startBoss: jest.fn().mockResolvedValue(undefined),
}));

const { default: pool }      = await import('../src/db.js');
const { default: boss, startBoss } = await import('../src/queue.js');
const { default: jobsRouter } = await import('../src/routes/jobs.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/jobs', jobsRouter);

// ── POST /api/jobs ─────────────────────────────────────────────────────────

describe('POST /api/jobs', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 400 when URL is missing', async () => {
    const res = await request(app).post('/api/jobs').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL is required');
  });

  test('returns 400 when URL is invalid', async () => {
    const res = await request(app).post('/api/jobs').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid URL format');
  });

  test('returns cached job when a recent completed audit exists', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 'cached-job-id',
        status: 'complete',
        overall_score: 85,
        created_at: new Date(),
      }],
    });

    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.jobId).toBe('cached-job-id');
    expect(boss.send).not.toHaveBeenCalled();
  });

  test('creates new job and enqueues via pg-boss when no cache exists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })                      // dedup check
      .mockResolvedValueOnce({ rows: [{ id: 'new-job-id' }] }); // INSERT

    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(201);
    expect(res.body.cached).toBe(false);
    expect(res.body.jobId).toBe('new-job-id');
    expect(boss.send).toHaveBeenCalledWith(
      'seo-audits',
      { jobId: 'new-job-id', url: 'https://example.com' },
      expect.objectContaining({ retryLimit: 3, retryBackoff: true })
    );
  });

  test('normalises URL — strips trailing slash before dedup check', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-job-id' }] });

    await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com/' }); // trailing slash

    // The URL stored in the DB should not have a trailing slash
    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[1][0]).toBe('https://example.com');
  });

  test('normalises URL — strips hash fragment', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-job-id' }] });

    await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com/#section' });

    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[1][0]).toBe('https://example.com');
  });
});

// ── GET /api/jobs/:id ──────────────────────────────────────────────────────

describe('GET /api/jobs/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when job not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/jobs/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Job not found');
  });

  test('returns job data directly from Postgres', async () => {
    const job = {
      id: 'test-id',
      status: 'complete',
      overall_score: 85,
      url: 'https://example.com',
    };
    pool.query.mockResolvedValueOnce({ rows: [job] });

    const res = await request(app).get('/api/jobs/test-id');

    expect(res.status).toBe(200);
    expect(res.body.overall_score).toBe(85);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('returns in-progress job without caching', async () => {
    const job = { id: 'test-id', status: 'crawling', overall_score: null };
    pool.query.mockResolvedValueOnce({ rows: [job] });

    const res = await request(app).get('/api/jobs/test-id');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('crawling');
    // Only one DB call — no secondary cache write
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
