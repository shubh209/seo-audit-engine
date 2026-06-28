-- Migration 003: Multi-tenancy — users, businesses, and scoped jobs
-- Run this against your Neon / Supabase Postgres instance.

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  google_id       TEXT UNIQUE,           -- populated after Google OAuth
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- ── Businesses ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Core identity
  business_name     TEXT NOT NULL,
  website_url       TEXT NOT NULL,
  category          TEXT,                -- e.g. "Dental Clinic", "Physiotherapist"
  city              TEXT,
  country_code      CHAR(2) DEFAULT 'IN',
  timezone          TEXT DEFAULT 'Asia/Kolkata',

  -- Google Business Profile (populated after OAuth)
  gbp_account_id    TEXT,
  gbp_location_id   TEXT,

  -- Subscription
  plan              TEXT NOT NULL DEFAULT 'trial',  -- trial | starter | pro
  trial_ends_at     TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_id   TEXT,               -- Stripe / Razorpay subscription ID

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);

-- ── Scope existing (and future) audit jobs to a business ────────────────────
-- Nullable so that legacy anonymous audits are not broken.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_business_id ON jobs(business_id);

-- ── Keywords tracked per business ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keywords (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword       TEXT NOT NULL,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_keywords_business_id ON keywords(business_id);

-- ── Rank snapshots (one row per keyword per weekly check) ────────────────────
CREATE TABLE IF NOT EXISTS rank_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id    UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  position      INT,                    -- NULL = not in top 100
  result_url    TEXT,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (keyword_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_keyword_id ON rank_snapshots(keyword_id);
CREATE INDEX IF NOT EXISTS idx_rank_snapshots_date       ON rank_snapshots(snapshot_date DESC);

-- ── GBP posts generated and/or published ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS gbp_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | published | failed
  gbp_post_id     TEXT,                           -- ID returned by GBP API once live
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gbp_posts_business_id ON gbp_posts(business_id);

-- ── NAP audit results ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nap_audits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,         -- e.g. 'yelp', 'bing_places', 'google_maps'
  found_name      TEXT,
  found_address   TEXT,
  found_phone     TEXT,
  is_consistent   BOOLEAN,
  checked_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nap_audits_business_id ON nap_audits(business_id);

-- ── Monthly SEO tips ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_tips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tip_text        TEXT NOT NULL,
  category        TEXT,                  -- e.g. 'content', 'nap', 'gbp', 'on_page'
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_tips_business_id ON monthly_tips(business_id);
