CREATE TABLE IF NOT EXISTS legal_documents (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  authority VARCHAR(200) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  document_number VARCHAR(200),
  jurisdiction VARCHAR(100) NOT NULL DEFAULT 'CN',
  publish_date DATE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'repealed', 'superseded')),
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  source_url TEXT NOT NULL,
  source_hash CHAR(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  version VARCHAR(100) NOT NULL,
  supersedes_id VARCHAR(64) REFERENCES legal_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT legal_documents_effective_interval CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT legal_documents_title_version_unique UNIQUE (title, version)
);

CREATE TABLE IF NOT EXISTS legal_sections (
  id VARCHAR(64) PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  legal_ref_id VARCHAR(160) NOT NULL UNIQUE,
  article_number VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  search_vector TSVECTOR NOT NULL DEFAULT ''::tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT legal_sections_document_article_unique UNIQUE (document_id, article_number)
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_lookup
  ON legal_documents(review_status, status, jurisdiction, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_legal_sections_article ON legal_sections(article_number);
CREATE INDEX IF NOT EXISTS idx_legal_sections_keywords ON legal_sections USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_legal_sections_search ON legal_sections USING GIN(search_vector);
