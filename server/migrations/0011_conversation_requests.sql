ALTER TABLE messages ADD COLUMN IF NOT EXISTS request_id VARCHAR(128);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS request_hash VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_request
  ON messages(conversation_id, request_id) WHERE request_id IS NOT NULL;
