CREATE TABLE IF NOT EXISTS run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'stale', 'cancelled')),
  safe_error_code VARCHAR(100) CHECK (safe_error_code ~ '^[A-Z0-9_]{1,100}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_created ON run_events(run_id, id);

CREATE OR REPLACE FUNCTION record_agent_run_event() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO run_events (run_id, status, safe_error_code)
      VALUES (NEW.id, NEW.status, NEW.safe_error_code);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_run_status_event ON agent_runs;
CREATE TRIGGER agent_run_status_event
  AFTER INSERT OR UPDATE OF status ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION record_agent_run_event();
