-- 0003_p2_usage_cache.postgres.sql

CREATE TABLE usage_counters (
  principal_id   TEXT NOT NULL,
  scope          TEXT NOT NULL,
  count          BIGINT NOT NULL DEFAULT 0,
  updated_at     BIGINT NOT NULL,
  PRIMARY KEY (principal_id, scope)
);
CREATE INDEX idx_usage_principal ON usage_counters(principal_id);
CREATE INDEX idx_usage_scope ON usage_counters(scope);

CREATE TABLE cache_entries (
  key_hash       TEXT PRIMARY KEY,
  tool           TEXT NOT NULL,
  principal_id   TEXT,
  value          TEXT NOT NULL,
  expires_at     BIGINT NOT NULL,
  created_at     BIGINT NOT NULL
);
CREATE INDEX idx_cache_expires ON cache_entries(expires_at);
CREATE INDEX idx_cache_tool ON cache_entries(tool);

ALTER TABLE tools ADD COLUMN cacheable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tools ADD COLUMN cache_ttl_sec INTEGER;
ALTER TABLE tools ADD COLUMN cache_per_principal INTEGER NOT NULL DEFAULT 0;
