-- 灵迈数据库初始化脚本

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  openid VARCHAR(128) UNIQUE NOT NULL,
  phone VARCHAR(20),
  nickname VARCHAR(100),
  avatar VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_openid ON users(openid);

-- 案件表
CREATE TABLE IF NOT EXISTS cases (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  accident_type VARCHAR(50),
  accident_date TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'collecting',
  status_label VARCHAR(100) NOT NULL DEFAULT '材料收集中',
  material_count INTEGER NOT NULL DEFAULT 0,
  liability TEXT,
  compensation TEXT,
  has_report BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_user_id ON cases(user_id);
CREATE INDEX idx_cases_is_active ON cases(is_active);

-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id VARCHAR(64) REFERENCES cases(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  agent_state JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_case_id ON conversations(case_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  kind VARCHAR(50) NOT NULL,
  text TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- 材料表
CREATE TABLE IF NOT EXISTS artifacts (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL,
  oss_url VARCHAR(1000) NOT NULL,
  oss_key VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_case_id ON artifacts(case_id);
CREATE INDEX idx_artifacts_type ON artifacts(type);

-- 提取字段表
CREATE TABLE IF NOT EXISTS extracted_fields (
  id VARCHAR(64) PRIMARY KEY,
  artifact_id VARCHAR(64) NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  field_label VARCHAR(200) NOT NULL,
  original_value TEXT,
  confirmed_value TEXT,
  confidence VARCHAR(20),
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_extracted_fields_artifact_id ON extracted_fields(artifact_id);

-- 报告表
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  model_version VARCHAR(100),
  rule_version VARCHAR(100),
  input_snapshot JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_case_id ON reports(case_id);

-- 咨询表
CREATE TABLE IF NOT EXISTS consultations (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lawyer_firm VARCHAR(200),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  contact_info JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consultations_case_id ON consultations(case_id);
CREATE INDEX idx_consultations_user_id ON consultations(user_id);
