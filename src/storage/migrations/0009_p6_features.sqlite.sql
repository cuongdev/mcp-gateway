-- 0009_p6_features.sqlite.sql — v0.8 Pipeline Platform feature tables (P7-P10)

CREATE TABLE redaction_rules (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  pattern         TEXT NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'redact',
  replacement     TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  built_in        INTEGER NOT NULL DEFAULT 0,
  priority        INTEGER NOT NULL DEFAULT 100,
  scope_request   INTEGER NOT NULL DEFAULT 1,
  scope_response  INTEGER NOT NULL DEFAULT 1,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt_default',
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_redaction_rules_name ON redaction_rules(tenant_id, name);
CREATE INDEX idx_redaction_rules_enabled ON redaction_rules(tenant_id, enabled);

CREATE TABLE redaction_findings (
  id              TEXT PRIMARY KEY,
  rule_id         TEXT NOT NULL,
  request_id      TEXT NOT NULL,
  capability_name TEXT,
  capability_kind TEXT,
  server_name     TEXT,
  scope           TEXT NOT NULL,
  mode            TEXT NOT NULL,
  match_count     INTEGER NOT NULL,
  occurred_at     INTEGER NOT NULL,
  principal_id    TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE INDEX idx_findings_occurred ON redaction_findings(tenant_id, occurred_at);
CREATE INDEX idx_findings_rule ON redaction_findings(tenant_id, rule_id);
CREATE INDEX idx_findings_server ON redaction_findings(tenant_id, server_name);

CREATE TABLE sampling_log (
  id                    TEXT PRIMARY KEY,
  request_id            TEXT NOT NULL,
  upstream_server       TEXT NOT NULL,
  client_session_id     TEXT NOT NULL,
  principal_id          TEXT,
  method                TEXT NOT NULL,
  request_payload_hash  TEXT NOT NULL,
  response_payload_hash TEXT,
  latency_ms            INTEGER,
  outcome               TEXT NOT NULL,
  occurred_at           INTEGER NOT NULL,
  tenant_id             TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE INDEX idx_sampling_log_occurred ON sampling_log(tenant_id, occurred_at);

CREATE TABLE catalog_installs (
  id                    TEXT PRIMARY KEY,
  connector_id          TEXT NOT NULL,
  template_version      TEXT NOT NULL,
  server_name           TEXT NOT NULL,
  config_snapshot_json  TEXT NOT NULL,
  installed_at          INTEGER NOT NULL,
  installed_by          TEXT,
  tenant_id             TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE UNIQUE INDEX idx_catalog_installs_server ON catalog_installs(tenant_id, server_name);

CREATE TABLE virtual_tools (
  canonical_name        TEXT PRIMARY KEY,
  description           TEXT,
  input_schema_json     TEXT NOT NULL,
  plan_json             TEXT NOT NULL,
  error_policy          TEXT NOT NULL DEFAULT 'fail_fast',
  enabled               INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  created_by            TEXT,
  tenant_id             TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE INDEX idx_virtual_tools_enabled ON virtual_tools(tenant_id, enabled);
