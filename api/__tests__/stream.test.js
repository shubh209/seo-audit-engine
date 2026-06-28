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
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('returns SSE content-type header', async () => {
    // Job not found — SSE closes immediately after sending error event
    mockQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/stream/missing-id');

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('Job not found');
  });

  test('streams complete status and scores in response body', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 'job-1',
        status: 'complete',
        performance_score: 80,
        accessibility_score: 90,
        seo_score: 85,
        overall_score: 85,
        error: null,
        failed_step: null,
        processing_time_ms: 4200,
        crawl_ms: 1000,
        perf_ms: 1200,
        a11y_ms: 800,
        seo_ms: 600,
        report_ms: 200,
        updated_at: new Date().toISOString(),
      }],
    });

    const res = await request(app).get('/api/stream/job-1');

    expect(res.text).toContain('"status":"complete"');
    expect(res.text).toContain('"overall_score":85');
  });

  test('streams failed status when job has errored', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 'job-2',
        status: 'failed',
        performance_score: null,
        accessibility_score: null,
        seo_score: null,
        overall_score: null,
        error: 'Timeout exceeded',
        failed_step: 'crawling',
        processing_time_ms: null,
        crawl_ms: null,
        perf_ms: null,
        a11y_ms: null,
        seo_ms: null,
        report_ms: null,
        updated_at: new Date().toISOString(),
      }],
    });

    const res = await request(app).get('/api/stream/job-2');

    expect(res.text).toContain('"status":"failed"');
    expect(res.text).toContain('Timeout exceeded');
  });
});
