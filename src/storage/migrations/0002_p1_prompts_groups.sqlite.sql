-- 0002_p1_prompts_groups.sqlite.sql — Prompts + Group includes/excludes

CREATE TABLE prompts (
  canonical_name   TEXT PRIMARY KEY,
  server_name      TEXT NOT NULL REFERENCES servers(name) ON DELETE CASCADE,
  original_name    TEXT NOT NULL,
  description      TEXT,
  arguments_schema TEXT NOT NULL DEFAULT '{}',
  enabled          INTEGER NOT NULL DEFAULT 1,
  discovered_at    INTEGER NOT NULL
);
CREATE INDEX idx_prompts_server ON prompts(server_name);

CREATE TABLE group_included_servers (
  group_name   TEXT NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
  server_name  TEXT NOT NULL REFERENCES servers(name) ON DELETE CASCADE,
  PRIMARY KEY (group_name, server_name)
);

CREATE TABLE group_excluded_tools (
  group_name     TEXT NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,    -- NO FK: tool may not exist yet at seed time (same pattern as group_tools per P0 T21 workaround)
  PRIMARY KEY (group_name, canonical_name)
);
