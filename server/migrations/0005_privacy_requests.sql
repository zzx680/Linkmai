CREATE TABLE IF NOT EXISTS privacy_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('export_data', 'delete_data', 'close_account')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  response VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_user_created
  ON privacy_requests(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_requests_open_kind
  ON privacy_requests(user_id, kind)
  WHERE status IN ('pending', 'processing');
