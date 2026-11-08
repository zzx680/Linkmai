-- Keep existing email-based review administrators compatible while storing invited lawyers by phone.
ALTER TABLE reviewers ADD COLUMN IF NOT EXISTS phone VARCHAR(11);
ALTER TABLE reviewers ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviewers_phone_unique ON reviewers(phone) WHERE phone IS NOT NULL;
