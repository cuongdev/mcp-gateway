-- 0006_p4_tenants.sqlite.sql — Tenant table + tenant_id columns with tnt_default backfill

CREATE TABLE tenants (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'free',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at   INTEGER NOT NULL,
  metadata     TEXT NOT NULL DEFAULT '{}'
);

INSERT INTO tenants(id, slug, display_name, plan, status, created_at, metadata)
  VALUES ('tnt_default', 'default', 'Default Tenant', 'unlimited', 'active',
          CAST(strftime('%s', 'now') AS INTEGER) * 1000, '{}');

-- principals.tenant_id existed as nullable TEXT in 0001. Drop and re-add with
-- NOT NULL DEFAULT 'tnt_default' so existing/legacy inserts that omit tenant_id
-- still satisfy the constraint via the default backfill.
ALTER TABLE principals      DROP COLUMN tenant_id;
ALTER TABLE principals      ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tnt_default';
ALTER TABLE servers         ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tnt_default';
ALTER TABLE tools           ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tnt_default';
ALTER TABLE audit_logs      ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tnt_default';
ALTER TABLE usage_counters  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tnt_default';

CREATE INDEX idx_principals_tenant     ON principals(tenant_id);
CREATE INDEX idx_servers_tenant        ON servers(tenant_id);
CREATE INDEX idx_tools_tenant          ON tools(tenant_id);
CREATE INDEX idx_audit_logs_tenant     ON audit_logs(tenant_id);
CREATE INDEX idx_usage_counters_tenant ON usage_counters(tenant_id);
