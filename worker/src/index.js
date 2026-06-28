import PgBoss from 'pg-boss';
import dotenv from 'dotenv';
import http from 'http';
import { processJob } from './processor.js';

dotenv.config();

// pg-boss worker — polls Postgres for queued jobs, no Redis required.
const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  deleteAfterHours: 24,
  archiveFailedAfterHours: 168,
});

boss.on('error', (err) => console.error('[pg-boss] error:', err));

const QUEUE_NAME = 'seo-audits';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 1;

const start = async () => {
  await boss.start();
  console.log('[pg-boss] started — waiting for jobs on queue:', QUEUE_NAME);

  await boss.work(
    QUEUE_NAME,
    { teamSize: CONCURRENCY, teamConcurrency: CONCURRENCY },
    async (job) => {
      const { jobId, url } = job.data;
      console.log(`\n[worker] picked up job ${jobId} for URL: ${url}`);
      // processJob handles all DB status updates and error recording internally.
      // pg-boss will mark the job failed if this throws, and retry per the
      // retryLimit / retryBackoff options set when the job was sent.
      await processJob(jobId, url);
      console.log(`[worker] completed job ${jobId}`);
    }
  );
};

start().catch((err) => {
  console.error('[worker] fatal startup error:', err);
  process.exit(1);
});

// Minimal HTTP server so Fly.io / Render health checks have something to hit
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Worker is running');
});

server.listen(3001, '0.0.0.0', () => {
  console.log('[worker] health server listening on port 3001');
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`[worker] received ${signal} — shutting down`);
  await boss.stop();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
