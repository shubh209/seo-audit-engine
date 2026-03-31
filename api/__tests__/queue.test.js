import { jest } from '@jest/globals';

jest.unstable_mockModule('ioredis', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn()
    }))
  };
});

jest.unstable_mockModule('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJobs: jest.fn().mockResolvedValue([]),
    close: jest.fn()
  }))
}));

const { Queue } = await import('bullmq');
const { default: auditQueue } = await import('../src/queue.js');

describe('Queue configuration', () => {
  test('Queue is initialized with correct name', () => {
    expect(Queue).toHaveBeenCalledWith(
      'seo-audits',
      expect.any(Object)
    );
  });

  test('Queue has correct default job options', () => {
    const queueOptions = Queue.mock.calls[0][1];
    expect(queueOptions.defaultJobOptions.attempts).toBe(3);
    expect(queueOptions.defaultJobOptions.backoff.type).toBe('exponential');
  });

  test('can add a job to the queue', async () => {
    const result = await auditQueue.add('audit', {
      jobId: 'test-id',
      url: 'https://example.com'
    });
    expect(auditQueue.add).toHaveBeenCalledWith(
      'audit',
      { jobId: 'test-id', url: 'https://example.com' }
    );
  });
});