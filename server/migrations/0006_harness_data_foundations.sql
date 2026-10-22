-- Harness vertical slice: versioned case input and idempotent agent runs.
-- This migration is intentionally additive and expects the base cases/reports tables from 0001.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS input_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_input_revision_nonnegative;

ALTER TABLE cases
  ADD CONSTRAINT cases_input_revision_nonnegative CHECK (input_revision >= 0);

CREATE TABLE IF NOT EXISTS case_facts (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  fact_key VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  value TEXT NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(128) NOT NULL,
  confidence VARCHAR(20),
  confirmation_status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (confirmation_status = 'confirmed'),
  revision INTEGER NOT NULL CHECK (revision > 0),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT case_facts_case_key_unique UNIQUE (case_id, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_case_facts_case_id ON case_facts(case_id, confirmed_at);

CREATE TABLE IF NOT EXISTS case_revisions (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  input_revision INTEGER NOT NULL,
  reason_code VARCHAR(100) NOT NULL,
  changed_entity_type VARCHAR(50),
  changed_entity_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT case_revisions_case_revision_unique UNIQUE (case_id, input_revision),
  CONSTRAINT case_revisions_input_revision_positive CHECK (input_revision > 0)
);

CREATE INDEX IF NOT EXISTS idx_case_revisions_case_created ON case_revisions(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  task VARCHAR(100) NOT NULL,
  input_revision INTEGER NOT NULL,
  skill_version VARCHAR(100) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'stale', 'cancelled')),
  output JSONB,
  safe_error_code VARCHAR(100),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_runs_case_task_revision_skill_unique UNIQUE (case_id, task, input_revision, skill_version),
  CONSTRAINT agent_runs_input_revision_nonnegative CHECK (input_revision >= 0)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_case_status_created ON agent_runs(case_id, status, created_at DESC);

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS input_revision INTEGER,
  ADD COLUMN IF NOT EXISTS agent_run_id VARCHAR(64) REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_case_revision ON reports(case_id, input_revision DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_agent_run_unique ON reports(agent_run_id) WHERE agent_run_id IS NOT NULL;
