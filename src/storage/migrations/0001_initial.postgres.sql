-- 0001_initial.postgres.sql — P0 schema (Postgres dialect)

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at BIGINT NOT NULL
);

CREATE TABLE principals (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('user','service_account','mcp_client')),
  display_name  TEXT NOT NULL,
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL,
  tenant_id     TEXT
);
CREATE INDEX idx_principals_type ON principals(type);

CREATE TABLE users (
  principal_id     TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
  email            TEXT NOT NULL UNIQUE,
  oidc_subject     TEXT,
  oidc_provider_id TEXT
);

CREATE TABLE service_accounts (
  principal_id   TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
  description    TEXT,
  is_bootstrap   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE mcp_clients (
  principal_id     TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
  description      TEXT,
  allowed_servers  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE tokens (
  id              TEXT PRIMARY KEY,
  principal_id    TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  prefix          TEXT NOT NULL,
  hash            TEXT NOT NULL,
  name            TEXT,
  scopes          TEXT NOT NULL DEFAULT '[]',
  expires_at      BIGINT,
  last_used_at    BIGINT,
  created_at      BIGINT NOT NULL,
  revoked_at      BIGINT
);
CREATE INDEX idx_tokens_principal ON tokens(principal_id);
CREATE INDEX idx_tokens_prefix    ON tokens(prefix);

CREATE TABLE servers (
  name              TEXT PRIMARY KEY,
  transport_type    TEXT NOT NULL CHECK (transport_type IN ('streamable-http','stdio','sse')),
  transport_config  TEXT NOT NULL,
  auto_discover     INTEGER NOT NULL DEFAULT 1,
  enabled           INTEGER NOT NULL DEFAULT 1,
  health_status     TEXT,
  health_checked_at BIGINT,
  created_at        BIGINT NOT NULL
);

CREATE TABLE tools (
  canonical_name TEXT PRIMARY KEY,
  server_name    TEXT NOT NULL REFERENCES servers(name) ON DELETE CASCADE,
  original_name  TEXT NOT NULL,
  description    TEXT,
  input_schema   TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  discovered_at  BIGINT NOT NULL
);
CREATE INDEX idx_tools_server ON tools(server_name);

CREATE TABLE groups (
  name           TEXT PRIMARY KEY,
  description    TEXT,
  enabled        INTEGER NOT NULL DEFAULT 1,
  allowed_roles  TEXT NOT NULL DEFAULT '[]',
  created_at     BIGINT NOT NULL
);

CREATE TABLE group_tools (
  group_name     TEXT NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL REFERENCES tools(canonical_name) ON DELETE CASCADE,
  PRIMARY KEY (group_name, canonical_name)
);

CREATE TABLE policies (
  id    BIGSERIAL PRIMARY KEY,
  ptype TEXT NOT NULL,
  v0    TEXT,
  v1    TEXT,
  v2    TEXT,
  v3    TEXT,
  v4    TEXT,
  v5    TEXT
);

CREATE TABLE audit_logs (
  id             TEXT PRIMARY KEY,
  ts             BIGINT NOT NULL,
  principal_id   TEXT,
  principal_type TEXT,
  action         TEXT NOT NULL,
  resource       TEXT,
  result         TEXT NOT NULL,
  duration_ms    BIGINT,
  metadata       TEXT
);
CREATE INDEX idx_audit_principal_ts ON audit_logs(principal_id, ts);
CREATE INDEX idx_audit_action_ts    ON audit_logs(action, ts);
