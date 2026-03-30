import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Required for Neon
  },
  max: 10,                     // Maximum 10 connections in the pool
  idleTimeoutMillis: 30000,    // Close idle connections after 30s
  connectionTimeoutMillis: 2000 // Fail fast if can't connect in 2s
});

// Test the connection on startup
pool.on('connect', () => {
  console.log('Connected to Neon PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
  process.exit(-1); // Crash the process — don't run without a DB
});

export default pool;