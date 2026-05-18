-- 0004_p3_approvals_webhooks.postgres.sql

CREATE TABLE approvals (
  id              TEXT PRIMARY KEY,
  ts_requested    BIGINT NOT NULL,
  ts_decided      BIGINT,
  ts_expires      BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired','executed','failed')),
  principal_id    TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  tool            TEXT NOT NULL,
  args_json       TEXT NOT NULL,
  args_hash       TEXT NOT NULL,
  approver_id     TEXT REFERENCES principals(id),
  decision_reason TEXT,
  result_json     TEXT
);
CREATE INDEX idx_approvals_status_ts ON approvals(status, ts_requested);
CREATE INDEX idx_approvals_principal ON approvals(principal_id);

ALTER TABLE tools ADD COLUMN sensitive INTEGER NOT NULL DEFAULT 0;

CREATE TABLE webhooks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  secret      TEXT,
  events      TEXT NOT NULL DEFAULT '[]',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  BIGINT NOT NULL
);

CREATE TABLE webhook_deliveries (
  id            TEXT PRIMARY KEY,
  webhook_id    TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  status_code   INTEGER,
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_retry_at BIGINT,
  delivered_at  BIGINT,
  error         TEXT
);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries(delivered_at, next_retry_at);
