import PgBoss from 'pg-boss';
import dotenv from 'dotenv';

dotenv.config();

// pg-boss uses Postgres as its queue backend — no Redis required.
// It creates its own `pgboss` schema in your database on first start.
const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },

  // Retention: keep completed jobs for 24 h, failed jobs for 7 days
  deleteAfterHours: 24,
  archiveFailedAfterHours: 168,
});

boss.on('error', (err) => console.error('[pg-boss] error:', err));

let started = false;

/**
 * Start pg-boss (idempotent — safe to call multiple times).
 * Must be awaited before sending or working jobs.
 */
export const startBoss = async () => {
  if (!started) {
    await boss.start();
    started = true;
    console.log('[pg-boss] started');
  }
  return boss;
};

export default boss;
