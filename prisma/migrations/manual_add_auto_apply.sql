-- ============================================================================
-- Auto Apply Schema Migration
-- Apply via: Supabase Dashboard → SQL Editor, or Railway DB console
-- ============================================================================

-- ─── Auto Apply Sessions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_apply_sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  job_id               UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status               TEXT        NOT NULL DEFAULT 'queued',
  ats_platform         TEXT,
  ats_confidence       INT,
  automation_confidence INT,
  simulation_mode      BOOLEAN     NOT NULL DEFAULT true,
  failure_reason       TEXT,
  failure_details      TEXT,
  retry_count          INT         NOT NULL DEFAULT 0,
  max_retries          INT         NOT NULL DEFAULT 3,
  browser_session_id   TEXT,
  browser_metadata     JSONB,
  current_step         TEXT,
  steps_completed      INT         NOT NULL DEFAULT 0,
  steps_total          INT,
  worker_id            TEXT,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_apply_user_status  ON auto_apply_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_auto_apply_job           ON auto_apply_sessions(job_id);
-- Partial index for fast worker queue polling
CREATE INDEX IF NOT EXISTS idx_auto_apply_queue         ON auto_apply_sessions(status, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_auto_apply_created       ON auto_apply_sessions(created_at DESC);

-- ─── Execution Logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES auto_apply_sessions(id) ON DELETE CASCADE,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  level           TEXT        NOT NULL DEFAULT 'info',
  step            TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  metadata        JSONB,
  duration_ms     INT,
  screenshot_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_exec_logs_session_time ON execution_logs(session_id, timestamp);

-- ─── Intervention Requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intervention_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES auto_apply_sessions(id) ON DELETE CASCADE,
  user_id        TEXT        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  job_id         UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reason         TEXT        NOT NULL,
  description    TEXT        NOT NULL,
  screenshot_url TEXT,
  page_url       TEXT,
  resolved_at    TIMESTAMPTZ,
  resolution     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_user    ON intervention_requests(user_id, resolved_at);
CREATE INDEX IF NOT EXISTS idx_intervention_session ON intervention_requests(session_id);

-- ─── ATS Platform Profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ats_platform_profiles (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform             TEXT        UNIQUE NOT NULL,
  display_name         TEXT        NOT NULL,
  automation_supported BOOLEAN     NOT NULL DEFAULT false,
  detection_signatures JSONB       NOT NULL DEFAULT '{}',
  success_rate         FLOAT       NOT NULL DEFAULT 0,
  total_attempts       INT         NOT NULL DEFAULT 0,
  total_successes      INT         NOT NULL DEFAULT 0,
  notes                TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Seed ATS Platforms ───────────────────────────────────────────────────────
INSERT INTO ats_platform_profiles (platform, display_name, automation_supported) VALUES
  ('workday',          'Workday',          true),
  ('greenhouse',       'Greenhouse',       false),
  ('lever',            'Lever',            false),
  ('ashby',            'Ashby',            false),
  ('smartrecruiters',  'SmartRecruiters',  false),
  ('taleo',            'Taleo',            false),
  ('icims',            'iCIMS',            false),
  ('unknown',          'Unknown',          false)
ON CONFLICT (platform) DO NOTHING;

-- ─── GlobalSettings: add Auto Apply Pro gate ─────────────────────────────────
ALTER TABLE global_settings
  ADD COLUMN IF NOT EXISTS auto_apply_is_pro BOOLEAN NOT NULL DEFAULT true;
