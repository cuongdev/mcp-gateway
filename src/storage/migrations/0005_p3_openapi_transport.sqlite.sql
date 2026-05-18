-- 0005_p3_openapi_transport.sqlite.sql
-- Extend `servers.transport_type` CHECK to allow 'openapi'.
-- SQLite doesn't support ALTER TABLE for CHECK constraints, so we
-- recreate the table preserving rows and indexes.

PRAGMA foreign_keys = OFF;

CREATE TABLE servers_new (
  name              TEXT PRIMARY KEY,
  transport_type    TEXT NOT NULL CHECK (transport_type IN ('streamable-http','stdio','sse','openapi')),
  transport_config  TEXT NOT NULL,
  auto_discover     INTEGER NOT NULL DEFAULT 1,
  enabled           INTEGER NOT NULL DEFAULT 1,
  health_status     TEXT,
  health_checked_at INTEGER,
  created_at        INTEGER NOT NULL
);

INSERT INTO servers_new (name, transport_type, transport_config, auto_discover, enabled, health_status, health_checked_at, created_at)
  SELECT name, transport_type, transport_config, auto_discover, enabled, health_status, health_checked_at, created_at
  FROM servers;

DROP TABLE servers;
ALTER TABLE servers_new RENAME TO servers;

PRAGMA foreign_keys = ON;
