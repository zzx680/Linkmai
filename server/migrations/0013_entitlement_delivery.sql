-- Entitlement delivery model: keep the single case-level grant, but leave room for
-- expiry, review quota and grant provenance so a subscription or a review bundle can
-- later be written through the same row instead of a parallel table.
-- Every existing row stays active: expires_at NULL means "no expiry".
ALTER TABLE case_entitlements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE case_entitlements ADD COLUMN IF NOT EXISTS review_quota_remaining INTEGER NOT NULL DEFAULT 0;
ALTER TABLE case_entitlements ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'purchase';

ALTER TABLE case_entitlements DROP CONSTRAINT IF EXISTS case_entitlements_review_quota_check;
ALTER TABLE case_entitlements ADD CONSTRAINT case_entitlements_review_quota_check CHECK (review_quota_remaining >= 0);

ALTER TABLE case_entitlements DROP CONSTRAINT IF EXISTS case_entitlements_source_check;
ALTER TABLE case_entitlements ADD CONSTRAINT case_entitlements_source_check
  CHECK (source IN ('purchase', 'subscription', 'grant', 'review_bundle'));

CREATE INDEX IF NOT EXISTS idx_case_entitlements_expires_at ON case_entitlements(expires_at) WHERE expires_at IS NOT NULL;
