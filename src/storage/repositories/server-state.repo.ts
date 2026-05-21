import type { Client } from '@libsql/client';

/**
 * Persistence-level types for ServerStateRepo. Mirrors the runtime types in
 * `src/health/state-machine.ts` but kept independent so the repo doesn't need
 * a runtime dependency on the state machine.
 */
export type ServerHealthStatePersisted =
  | 'healthy'
  | 'degraded'
  | 'circuit_open'
  | 'half_open'
  | 'quarantined'
  | 'manual_disabled';

export interface CallRecordPersisted {
  ts: number;
  success: boolean;
  errorCode?: string;
  latencyMs: number;
}

export interface ServerStateRow {
  serverName: string;
  state: ServerHealthStatePersisted;
  lastProbeAt: number | null;
  lastErrorAt: number | null;
  consecutiveErrors: number;
  rollingWindow: CallRecordPersisted[];
  openedAt: number | null;
  halfOpenTestAt: number | null;
  reopenCount: number;
  config: Record<string, unknown> | null;
  lastTransitionReason: string | null;
  updatedAt: number;
  tenantId: string;
}

export interface UpsertServerStateInput {
  serverName: string;
  state: ServerHealthStatePersisted;
  lastProbeAt?: number | null;
  lastErrorAt?: number | null;
  consecutiveErrors?: number;
  rollingWindow?: CallRecordPersisted[];
  openedAt?: number | null;
  halfOpenTestAt?: number | null;
  reopenCount?: number;
  config?: Record<string, unknown> | null;
  lastTransitionReason?: string | null;
  tenantId?: string;
}

/**
 * Repository for per-server circuit-breaker / health state. Each row is the
 * persisted snapshot of the in-memory state machine. Written on every
 * transition + periodically flushed.
 */
export class ServerStateRepo {
  constructor(protected readonly client: Client) {}

  async upsert(input: UpsertServerStateInput): Promise<void> {
    const now = Date.now();
    const tenantId = input.tenantId ?? 'tnt_default';
    await this.client.execute({
      sql: `INSERT INTO server_state (server_name, state, last_probe_at, last_error_at,
                                       consecutive_errors, rolling_window_json,
                                       opened_at, half_open_test_at, reopen_count,
                                       config_json, last_transition_reason, updated_at, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(server_name) DO UPDATE SET
              state = excluded.state,
              last_probe_at = excluded.last_probe_at,
              last_error_at = excluded.last_error_at,
              consecutive_errors = excluded.consecutive_errors,
              rolling_window_json = excluded.rolling_window_json,
              opened_at = excluded.opened_at,
              half_open_test_at = excluded.half_open_test_at,
              reopen_count = excluded.reopen_count,
              config_json = excluded.config_json,
              last_transition_reason = excluded.last_transition_reason,
              updated_at = excluded.updated_at`,
      args: [
        input.serverName,
        input.state,
        input.lastProbeAt ?? null,
        input.lastErrorAt ?? null,
        input.consecutiveErrors ?? 0,
        JSON.stringify(input.rollingWindow ?? []),
        input.openedAt ?? null,
        input.halfOpenTestAt ?? null,
        input.reopenCount ?? 0,
        input.config ? JSON.stringify(input.config) : null,
        input.lastTransitionReason ?? null,
        now,
        tenantId,
      ],
    });
  }

  async get(serverName: string, tenantId = 'tnt_default'): Promise<ServerStateRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT * FROM server_state WHERE server_name = ? AND tenant_id = ?',
      args: [serverName, tenantId],
    });
    if (r.rows.length === 0) return null;
    return rowToServerState(r.rows[0]);
  }

  async list(tenantId = 'tnt_default'): Promise<ServerStateRow[]> {
    const r = await this.client.execute({
      sql: 'SELECT * FROM server_state WHERE tenant_id = ? ORDER BY server_name',
      args: [tenantId],
    });
    return r.rows.map(rowToServerState);
  }

  async delete(serverName: string, tenantId = 'tnt_default'): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM server_state WHERE server_name = ? AND tenant_id = ?',
      args: [serverName, tenantId],
    });
  }
}

function rowToServerState(r: Record<string, unknown>): ServerStateRow {
  return {
    serverName: String(r.server_name),
    state: String(r.state) as ServerHealthStatePersisted,
    lastProbeAt: r.last_probe_at == null ? null : Number(r.last_probe_at),
    lastErrorAt: r.last_error_at == null ? null : Number(r.last_error_at),
    consecutiveErrors: Number(r.consecutive_errors),
    rollingWindow: r.rolling_window_json
      ? (JSON.parse(String(r.rolling_window_json)) as CallRecordPersisted[])
      : [],
    openedAt: r.opened_at == null ? null : Number(r.opened_at),
    halfOpenTestAt: r.half_open_test_at == null ? null : Number(r.half_open_test_at),
    reopenCount: Number(r.reopen_count),
    config: r.config_json ? (JSON.parse(String(r.config_json)) as Record<string, unknown>) : null,
    lastTransitionReason: r.last_transition_reason == null ? null : String(r.last_transition_reason),
    updatedAt: Number(r.updated_at),
    tenantId: String(r.tenant_id),
  };
}
