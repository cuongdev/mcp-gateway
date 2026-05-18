-- 0005_p3_openapi_transport.postgres.sql
-- Extend `servers.transport_type` CHECK to allow 'openapi'.

ALTER TABLE servers DROP CONSTRAINT IF EXISTS servers_transport_type_check;
ALTER TABLE servers ADD CONSTRAINT servers_transport_type_check
  CHECK (transport_type IN ('streamable-http','stdio','sse','openapi'));
