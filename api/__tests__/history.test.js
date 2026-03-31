import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/db.js', () => ({
  default: { query: jest.fn() }
}));

const { default: pool } = await import('../src/db.js');
const { default: historyRouter } = await import('../src/routes/history.js');

const app = express();
app.use(express.json());
app.use('/api/history', historyRouter);

describe('GET /api/history', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns list of jobs', async () => {
    const jobs = [
      { id: '1', url: 'https://example.com', status: 'complete', overall_score: 85, created_at: new Date() },
      { id: '2', url: 'https://github.com', status: 'complete', overall_score: 90, created_at: new Date() }
    ];
    pool.query.mockResolvedValueOnce({ rows: jobs });

    const res = await request(app).get('/api/history');

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.hasMore).toBe(false);
  });

  test('returns hasMore true when more pages exist', async () => {
    const jobs = Array(21).fill(null).map((_, i) => ({
      id: String(i),
      url: `https://example${i}.com`,
      status: 'complete',
      overall_score: 80,
      created_at: new Date()
    }));
    pool.query.mockResolvedValueOnce({ rows: jobs });

    const res = await request(app).get('/api/history?limit=20');

    expect(res.body.hasMore).toBe(true);
    expect(res.body.jobs).toHaveLength(20);
    expect(res.body.nextCursor).not.toBeNull();
  });

  test('respects limit parameter', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/history?limit=5');

    const queryCall = pool.query.mock.calls[0];
    expect(queryCall[1]).toContain(6); // pageSize + 1
  });

  test('returns empty list when no jobs exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/history');

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(0);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.nextCursor).toBeNull();
  });
});