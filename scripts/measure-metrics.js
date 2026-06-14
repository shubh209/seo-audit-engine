#!/usr/bin/env node
/**
 * Pull [MEASURED] production metrics from Neon jobs table.
 * Usage: cd api && node ../scripts/measure-metrics.js
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../api/package.json'));
const pg = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../api/.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const q = async (label, sql) => {
  const { rows } = await pool.query(sql);
  console.log(`${label}:`, rows[0]);
};

try {
  await q('completed_audits', "SELECT COUNT(*)::int AS n FROM jobs WHERE status = 'complete'");
  await q('failed_audits', "SELECT COUNT(*)::int AS n FROM jobs WHERE status = 'failed'");
  await q('unique_urls', "SELECT COUNT(DISTINCT url)::int AS n FROM jobs WHERE status = 'complete'");
  await q('failure_rate_pct', `
    SELECT ROUND(100.0 * SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) /
      NULLIF(SUM(CASE WHEN status IN ('complete','failed') THEN 1 ELSE 0 END), 0), 1) AS n
    FROM jobs`);
  await q('median_processing_ms', `
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY processing_time_ms)::int AS n
    FROM jobs WHERE status = 'complete' AND processing_time_ms IS NOT NULL`);
  await q('p95_processing_ms', `
    SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY processing_time_ms)::int AS n
    FROM jobs WHERE status = 'complete' AND processing_time_ms IS NOT NULL`);
  await q('avg_crawl_ms', `
    SELECT ROUND(AVG(crawl_ms))::int AS n FROM jobs WHERE status = 'complete' AND crawl_ms IS NOT NULL`);
} finally {
  await pool.end();
}
