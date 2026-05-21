-- 0008_p6_foundation.postgres.sql — v0.8 Pipeline Platform foundation tables

CREATE TABLE server_state (
  server_name             TEXT PRIMARY KEY,
  state                   TEXT NOT NULL DEFAULT 'healthy',
  last_probe_at           BIGINT,
  last_error_at           BIGINT,
  consecutive_errors      INTEGER NOT NULL DEFAULT 0,
  rolling_window_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  opened_at               BIGINT,
  half_open_test_at       BIGINT,
  reopen_count            INTEGER NOT NULL DEFAULT 0,
  config_json             JSONB,
  last_transition_reason  TEXT,
  updated_at              BIGINT NOT NULL,
  tenant_id               TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE INDEX idx_server_state_tenant ON server_state(tenant_id);

CREATE TABLE resources (
  canonical_name  TEXT PRIMARY KEY,
  server_name     TEXT NOT NULL,
  uri             TEXT NOT NULL,
  name            TEXT,
  description     TEXT,
  mime_type       TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  sensitive       INTEGER NOT NULL DEFAULT 0,
  discovered_at   BIGINT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE INDEX idx_resources_server ON resources(server_name);
CREATE UNIQUE INDEX idx_resources_uri ON resources(server_name, uri);

CREATE TABLE resource_templates (
  id              TEXT PRIMARY KEY,
  server_name     TEXT NOT NULL,
  uri_template    TEXT NOT NULL,
  name            TEXT,
  description     TEXT,
  mime_type       TEXT,
  discovered_at   BIGINT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE INDEX idx_resource_templates_server ON resource_templates(server_name);

CREATE TABLE roots (
  canonical_name  TEXT PRIMARY KEY,
  server_name     TEXT NOT NULL,
  uri             TEXT NOT NULL,
  name            TEXT,
  discovered_at   BIGINT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt_default'
);
CREATE INDEX idx_roots_server ON roots(server_name);
