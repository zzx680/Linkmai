-- Additive, independently switchable workflow. Payloads remain case-protected business data.
CREATE TABLE IF NOT EXISTS harness_case_state (
  case_id VARCHAR(64) PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS harness_facts (
  id VARCHAR(64) PRIMARY KEY, case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  payload JSONB NOT NULL, CHECK (payload->>'status' IN ('proposed','confirmed','rejected','disputed'))
);
CREATE TABLE IF NOT EXISTS evidence_references (
  id VARCHAR(64) PRIMARY KEY, case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE, payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS fact_conflicts (
  id VARCHAR(64) PRIMARY KEY, case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE, payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS calculation_results (
  id VARCHAR(64) PRIMARY KEY, case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE, payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS document_versions (
  id VARCHAR(64) PRIMARY KEY, case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE, payload JSONB NOT NULL,
  CHECK (payload->>'status' IN ('draft','user_confirmed','lawyer_review','approved','stale','superseded'))
);
CREATE UNIQUE INDEX IF NOT EXISTS document_case_type_version ON document_versions(case_id,(payload->>'type'),(payload->>'version'));
CREATE TABLE IF NOT EXISTS review_tasks (
  id VARCHAR(64) PRIMARY KEY, case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE, payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS review_events (
  id VARCHAR(64) PRIMARY KEY, case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE, payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS calculator_versions (id VARCHAR(64) PRIMARY KEY, payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS regional_parameters (id VARCHAR(64) PRIMARY KEY, payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS reviewers (id VARCHAR(64) PRIMARY KEY, email TEXT NOT NULL UNIQUE, payload JSONB NOT NULL);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS harness_payload JSONB;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(100);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS harness_runs_ready ON agent_runs(status,lease_expires_at) WHERE task='case_bundle';
CREATE INDEX IF NOT EXISTS harness_facts_case ON harness_facts(case_id);
CREATE INDEX IF NOT EXISTS evidence_case ON evidence_references(case_id);
CREATE INDEX IF NOT EXISTS conflicts_case ON fact_conflicts(case_id);
CREATE INDEX IF NOT EXISTS calculation_case ON calculation_results(case_id);
CREATE INDEX IF NOT EXISTS documents_case ON document_versions(case_id);
CREATE INDEX IF NOT EXISTS reviews_case ON review_tasks(case_id);
CREATE INDEX IF NOT EXISTS review_events_case ON review_events(case_id);

-- Any legacy input revision advance immediately invalidates the new workflow as well.
CREATE OR REPLACE FUNCTION invalidate_case_workflow() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.input_revision IS DISTINCT FROM NEW.input_revision THEN
    UPDATE document_versions SET payload=jsonb_set(payload,'{status}','"stale"')
      WHERE case_id=NEW.id AND payload->>'status' NOT IN ('stale','superseded');
    UPDATE review_tasks SET payload=jsonb_set(payload,'{status}','"stale"')
      WHERE case_id=NEW.id AND payload->>'status' NOT IN ('stale','cancelled');
    UPDATE agent_runs SET status='stale',lease_owner=NULL,lease_expires_at=NULL,
      harness_payload=jsonb_set(harness_payload,'{status}','"stale"'),completed_at=NOW(),updated_at=NOW()
      WHERE case_id=NEW.id AND task='case_bundle' AND status IN ('queued','running');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER invalidate_harness_on_revision AFTER UPDATE OF input_revision ON cases
FOR EACH ROW EXECUTE FUNCTION invalidate_case_workflow();

CREATE TABLE IF NOT EXISTS legal_versions (
  id VARCHAR(64) PRIMARY KEY REFERENCES legal_documents(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL, imported_by VARCHAR(64) NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(64);
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS harness_admin_events (
  id BIGSERIAL PRIMARY KEY, actor_id VARCHAR(64) NOT NULL, entity_id VARCHAR(160) NOT NULL,
  code VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION invalidate_harness_policy() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  WITH changed AS (
    UPDATE cases SET input_revision=input_revision+1,has_report=FALSE,updated_at=NOW()
      WHERE id IN (SELECT case_id FROM harness_case_state) RETURNING id,input_revision
  ) INSERT INTO case_revisions(id,case_id,input_revision,reason_code,changed_entity_type)
    SELECT 'policy_' || md5(random()::text || id || input_revision::text),id,input_revision,'policy_changed','legal_source' FROM changed;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER calculator_policy_change AFTER INSERT OR UPDATE ON calculator_versions FOR EACH ROW EXECUTE FUNCTION invalidate_harness_policy();
CREATE TRIGGER regional_policy_change AFTER INSERT OR UPDATE ON regional_parameters FOR EACH ROW EXECUTE FUNCTION invalidate_harness_policy();
CREATE TRIGGER legal_document_policy_change AFTER UPDATE OF status,review_status,source_hash,effective_from,effective_to ON legal_documents FOR EACH ROW EXECUTE FUNCTION invalidate_harness_policy();
CREATE TRIGGER legal_section_policy_change AFTER UPDATE OF content_hash ON legal_sections FOR EACH ROW EXECUTE FUNCTION invalidate_harness_policy();
