import { Worker } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { processJob } from './processor.js';

dotenv.config();

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableAutoPipelining: true
});

const worker = new Worker('seo-audits', async (job) => {
  console.log(`\nPicked up job ${job.id} for URL: ${job.data.url}`);
  await processJob(job.data.jobId, job.data.url);
}, {
  connection,
  concurrency: 3 // Process up to 3 jobs at the same time
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log('Worker is running and waiting for jobs...');