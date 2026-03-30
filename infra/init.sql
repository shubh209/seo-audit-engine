CREATE TYPE job_status AS ENUM (
  'queued',
  'crawling',
  'scoring_performance',
  'checking_accessibility',
  'checking_seo',
  'building_report',
  'complete',
  'failed'
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  status job_status DEFAULT 'queued',
  performance_score INT,
  accessibility_score INT,
  seo_score INT,
  overall_score INT,
  report JSONB,
  error TEXT,
  failed_step TEXT,
  processing_time_ms INT,
  checks_run INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url);