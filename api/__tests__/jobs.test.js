import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { jest } from '@jest/globals';

// Mock dependencies before importing routes
jest.unstable_mockModule('../src/db.js', () => ({
  default: {
    query: jest.fn()
  }
}));

jest.unstable_mockModule('../src/redis.js', () => ({
  default: {
    get: jest.fn(),
    setex: jest.fn(),
    on: jest.fn()
  }
}));

jest.unstable_mockModule('../src/queue.js', () => ({
  default: {
    add: jest.fn()
  }
}));

const { default: pool } = await import('../src/db.js');
const { default: redis } = await import('../src/redis.js');
const { default: auditQueue } = await import('../src/queue.js');
const { default: jobsRouter } = await import('../src/routes/jobs.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/jobs', jobsRouter);

describe('POST /api/jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when URL is missing', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL is required');
  });

  test('returns 400 when URL is invalid', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid URL format');
  });

  test('returns cached job when recent audit exists', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'cached-job-id', status: 'complete', overall_score: 85, created_at: new Date() }]
      });

    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.jobId).toBe('cached-job-id');
  });

  test('creates new job and adds to queue when no cache exists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // no cached job
      .mockResolvedValueOnce({ rows: [{ id: 'new-job-id' }] }); // insert

    auditQueue.add.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(201);
    expect(res.body.cached).toBe(false);
    expect(res.body.jobId).toBe('new-job-id');
    expect(auditQueue.add).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/jobs/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns cached result from Redis when available', async () => {
    const cachedJob = { id: 'test-id', status: 'complete', overall_score: 90 };
    redis.get.mockResolvedValueOnce(JSON.stringify(cachedJob));

    const res = await request(app).get('/api/jobs/test-id');

    expect(res.status).toBe(200);
    expect(res.body.fromCache).toBe(true);
    expect(res.body.overall_score).toBe(90);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('returns 404 when job not found', async () => {
    redis.get.mockResolvedValueOnce(null);
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/jobs/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Job not found');
  });

  test('returns job from database when not in cache', async () => {
    const job = {
      id: 'test-id',
      status: 'complete',
      overall_score: 85,
      url: 'https://example.com'
    };
    redis.get.mockResolvedValueOnce(null);
    pool.query.mockResolvedValueOnce({ rows: [job] });
    redis.setex.mockResolvedValueOnce('OK');

    const res = await request(app).get('/api/jobs/test-id');

    expect(res.status).toBe(200);
    expect(res.body.overall_score).toBe(85);
  });

  test('caches completed jobs in Redis', async () => {
    const job = { id: 'test-id', status: 'complete', overall_score: 85 };
    redis.get.mockResolvedValueOnce(null);
    pool.query.mockResolvedValueOnce({ rows: [job] });
    redis.setex.mockResolvedValueOnce('OK');

    await request(app).get('/api/jobs/test-id');

    expect(redis.setex).toHaveBeenCalledWith(
      'job:test-id',
      86400,
      expect.any(String)
    );
  });

  test('does not cache in-progress jobs', async () => {
    const job = { id: 'test-id', status: 'processing', overall_score: null };
    redis.get.mockResolvedValueOnce(null);
    pool.query.mockResolvedValueOnce({ rows: [job] });

    await request(app).get('/api/jobs/test-id');

    expect(redis.setex).not.toHaveBeenCalled();
  });
});