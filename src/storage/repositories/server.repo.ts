import type { Client } from '@libsql/client';

export type ServerTransportType = 'streamable-http' | 'stdio' | 'sse' | 'openapi';

export interface ServerRow {
  name: string;
  transportType: ServerTransportType;
  transportConfig: Record<string, unknown>;
  autoDiscover: boolean;
  enabled: boolean;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  healthCheckedAt?: number;
  createdAt: number;
}

export interface UpsertServer {
  name: string;
  transportType: ServerTransportType;
  transportConfig: Record<string, unknown>;
  autoDiscover?: boolean;
}

export class ServerRepo {
  constructor(protected readonly client: Client) {}

  async upsert(s: UpsertServer): Promise<ServerRow> {
    const now = Date.now();
    const existing = await this.findByName(s.name);
    if (existing) {
      await this.client.execute({
        sql: `UPDATE servers SET transport_type = ?, transport_config = ?, auto_discover = ?
              WHERE name = ?`,
        args: [s.transportType, JSON.stringify(s.transportConfig),
               s.autoDiscover === false ? 0 : 1, s.name],
      });
      return (await this.findByName(s.name))!;
    }
    await this.client.execute({
      sql: `INSERT INTO servers(name, transport_type, transport_config, auto_discover,
                                enabled, created_at)
            VALUES (?, ?, ?, ?, 1, ?)`,
      args: [s.name, s.transportType, JSON.stringify(s.transportConfig),
             s.autoDiscover === false ? 0 : 1, now],
    });
    return (await this.findByName(s.name))!;
  }

  async findByName(name: string): Promise<ServerRow | null> {
    const r = await this.client.execute({
      sql: `SELECT name, transport_type, transport_config, auto_discover, enabled,
                   health_status, health_checked_at, created_at
            FROM servers WHERE name = ?`,
      args: [name],
    });
    if (r.rows.length === 0) return null;
    return rowToServer(r.rows[0]);
  }

  async list(): Promise<ServerRow[]> {
    const r = await this.client.execute(
      `SELECT name, transport_type, transport_config, auto_discover, enabled,
              health_status, health_checked_at, created_at
       FROM servers ORDER BY name`
    );
    return r.rows.map(rowToServer);
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE servers SET enabled = ? WHERE name = ?',
      args: [enabled ? 1 : 0, name],
    });
  }

  async setHealth(name: string, status: 'healthy' | 'unhealthy' | 'unknown'): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE servers SET health_status = ?, health_checked_at = ? WHERE name = ?',
      args: [status, Date.now(), name],
    });
  }

  async deleteByName(name: string): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM servers WHERE name = ?', args: [name] });
  }
}

function rowToServer(r: Record<string, unknown>): ServerRow {
  return {
    name: r.name as string,
    transportType: r.transport_type as ServerTransportType,
    transportConfig: JSON.parse(r.transport_config as string),
    autoDiscover: Number(r.auto_discover) === 1,
    enabled: Number(r.enabled) === 1,
    healthStatus: (r.health_status as ServerRow['healthStatus']) ?? undefined,
    healthCheckedAt: (r.health_checked_at as number | null) ?? undefined,
    createdAt: Number(r.created_at),
  };
}
