import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/db.js', () => ({
  default: { query: mockQuery }
}));

const { default: streamRouter } = await import('../src/routes/stream.js');

const app = express();
app.use('/api/stream', streamRouter);

describe('GET /api/stream/:id', () => {
  let setIntervalSpy;

  beforeEach(() => {
    mockQuery.mockReset();
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((fn) => {
      fn();
      return 1;
    });
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('returns SSE content type and job-not-found payload', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/stream/missing-id');

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('Job not found');
  });

  test('streams terminal complete status in response body', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: '1',
        status: 'complete',
        performance_score: 80,
        accessibility_score: 90,
        seo_score: 85,
        overall_score: 85,
        error: null,
        failed_step: null,
        updated_at: new Date().toISOString()
      }]
    });

    const res = await request(app).get('/api/stream/job-1');

    expect(res.text).toContain('complete');
    expect(res.text).toContain('"overall_score":85');
  });
});
