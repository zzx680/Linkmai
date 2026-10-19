CREATE TABLE IF NOT EXISTS feedback (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_created_at ON feedback(user_id, created_at DESC);

WITH latest_active_conversations AS (
  SELECT DISTINCT ON (case_id) id, case_id
  FROM conversations
  WHERE status = 'active' AND case_id IS NOT NULL
  ORDER BY case_id, created_at DESC
)
UPDATE conversations
SET status = 'closed', updated_at = NOW()
WHERE status = 'active'
  AND case_id IS NOT NULL
  AND id NOT IN (SELECT id FROM latest_active_conversations);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_conversations_case
  ON conversations(case_id)
  WHERE status = 'active' AND case_id IS NOT NULL;
