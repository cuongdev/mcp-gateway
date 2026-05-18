-- 0002_p1_prompts_groups.postgres.sql

CREATE TABLE prompts (
  canonical_name   TEXT PRIMARY KEY,
  server_name      TEXT NOT NULL REFERENCES servers(name) ON DELETE CASCADE,
  original_name    TEXT NOT NULL,
  description      TEXT,
  arguments_schema TEXT NOT NULL DEFAULT '{}',
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  discovered_at    BIGINT NOT NULL
);
CREATE INDEX idx_prompts_server ON prompts(server_name);

CREATE TABLE group_included_servers (
  group_name   TEXT NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
  server_name  TEXT NOT NULL REFERENCES servers(name) ON DELETE CASCADE,
  PRIMARY KEY (group_name, server_name)
);

CREATE TABLE group_excluded_tools (
  group_name     TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  PRIMARY KEY (group_name, canonical_name)
);
