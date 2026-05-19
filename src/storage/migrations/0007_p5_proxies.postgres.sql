-- 0007_p5_proxies.postgres.sql — Outbound proxy management

CREATE TABLE proxies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  url         TEXT NOT NULL,
  description TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  BIGINT NOT NULL
);
CREATE INDEX idx_proxies_name ON proxies(name);

ALTER TABLE servers ADD COLUMN proxy_name TEXT;
ALTER TABLE groups  ADD COLUMN proxy_name TEXT;
