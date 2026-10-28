CREATE TABLE IF NOT EXISTS report_notification_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  run_id VARCHAR(64) REFERENCES agent_runs(id) ON DELETE SET NULL,
  template_id VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('awaiting_run','pending','sending','sent','failed')),
  expires_at TIMESTAMPTZ,
  error_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS report_notification_run_status
  ON report_notification_subscriptions(run_id, status) WHERE run_id IS NOT NULL;
