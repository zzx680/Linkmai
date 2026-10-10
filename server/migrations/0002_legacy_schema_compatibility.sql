ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS agent_state JSONB;

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS model_version VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rule_version VARCHAR(100),
  ADD COLUMN IF NOT EXISTS input_snapshot JSONB;

ALTER TABLE extracted_fields
  ADD COLUMN IF NOT EXISTS revised_value TEXT,
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS law_firm VARCHAR(200),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'extracted_fields' AND column_name = 'confirmed_value'
  ) THEN
    EXECUTE 'UPDATE extracted_fields SET revised_value = confirmed_value WHERE revised_value IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'extracted_fields' AND column_name = 'is_confirmed'
  ) THEN
    EXECUTE 'UPDATE extracted_fields SET confirmed = is_confirmed WHERE confirmed = FALSE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consultations' AND column_name = 'lawyer_firm'
  ) THEN
    EXECUTE 'UPDATE consultations SET law_firm = lawyer_firm WHERE law_firm IS NULL';
  END IF;
END $$;
