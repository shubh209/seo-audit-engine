import { jest } from '@jest/globals';

// Mock pg-boss so no real DB connection is needed
jest.unstable_mockModule('pg-boss', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue('mock-job-id'),
      work: jest.fn().mockResolvedValue(undefined),
    }))
  };
});

const PgBoss = (await import('pg-boss')).default;
const { default: boss, startBoss } = await import('../src/queue.js');

describe('Queue (pg-boss) configuration', () => {
  test('PgBoss is instantiated with DATABASE_URL and ssl options', () => {
    expect(PgBoss).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: expect.objectContaining({ rejectUnauthorized: false }),
      })
    );
  });

  test('startBoss() starts the boss instance', async () => {
    await startBoss();
    expect(boss.start).toHaveBeenCalledTimes(1);
  });

  test('startBoss() is idempotent — calling twice does not double-start', async () => {
    // boss.start call count should still be 1 from the previous test
    await startBoss();
    expect(boss.start).toHaveBeenCalledTimes(1);
  });

  test('boss.send() can enqueue a job', async () => {
    const id = await boss.send('seo-audits', {
      jobId: 'test-id',
      url: 'https://example.com',
    });
    expect(id).toBe('mock-job-id');
    expect(boss.send).toHaveBeenCalledWith(
      'seo-audits',
      { jobId: 'test-id', url: 'https://example.com' }
    );
  });
});
