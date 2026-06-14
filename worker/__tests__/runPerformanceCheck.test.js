import { jest } from '@jest/globals';
import { runPerformanceCheck, scoreFromLoadTime } from '../src/steps/runPerformanceCheck.js';

describe('scoreFromLoadTime', () => {
  test('scores fast loads highly', () => {
    const result = scoreFromLoadTime(800);
    expect(result.score).toBe(90);
  });

  test('scores slow loads lower', () => {
    const result = scoreFromLoadTime(7000);
    expect(result.score).toBe(20);
  });
});

describe('runPerformanceCheck', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('uses crawl timing when provided (no fetch)', async () => {
    const result = await runPerformanceCheck('https://example.com', 1500);
    expect(result.score).toBe(75);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('falls back to fetch when crawl timing missing', async () => {
    global.fetch.mockResolvedValueOnce({
      text: async () => '<html></html>'
    });

    const result = await runPerformanceCheck('https://example.com');
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(global.fetch).toHaveBeenCalled();
  });

  test('returns fallback score on fetch failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network error'));

    const result = await runPerformanceCheck('https://example.com');
    expect(result.score).toBe(50);
  });
});
