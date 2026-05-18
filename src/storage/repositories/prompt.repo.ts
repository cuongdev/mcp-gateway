import type { Client } from '@libsql/client';

export interface PromptRow {
  canonicalName: string;
  serverName: string;
  originalName: string;
  description: string;
  argumentsSchema: Record<string, unknown>;
  enabled: boolean;
  discoveredAt: number;
}

export interface DiscoveredPrompt {
  originalName: string;
  description: string;
  argumentsSchema: Record<string, unknown>;
}

export class PromptRepo {
  constructor(protected readonly client: Client) {}

  async replaceServerPrompts(serverName: string, prompts: DiscoveredPrompt[]): Promise<void> {
    const now = Date.now();
    await this.client.execute({ sql: 'DELETE FROM prompts WHERE server_name = ?', args: [serverName] });
    for (const p of prompts) {
      const canonical = `${serverName}__${p.originalName}`;
      await this.client.execute({
        sql: `INSERT INTO prompts(canonical_name, server_name, original_name, description,
                                   arguments_schema, enabled, discovered_at)
              VALUES (?, ?, ?, ?, ?, 1, ?)`,
        args: [canonical, serverName, p.originalName, p.description,
               JSON.stringify(p.argumentsSchema), now],
      });
    }
  }

  async findByCanonicalName(canonical: string): Promise<PromptRow | null> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, original_name, description,
                   arguments_schema, enabled, discovered_at
            FROM prompts WHERE canonical_name = ?`,
      args: [canonical],
    });
    if (r.rows.length === 0) return null;
    return rowToPrompt(r.rows[0]);
  }

  async list(): Promise<PromptRow[]> {
    const r = await this.client.execute(
      `SELECT canonical_name, server_name, original_name, description,
              arguments_schema, enabled, discovered_at
       FROM prompts ORDER BY canonical_name`
    );
    return r.rows.map(rowToPrompt);
  }

  async listForServer(serverName: string): Promise<PromptRow[]> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, original_name, description,
                   arguments_schema, enabled, discovered_at
            FROM prompts WHERE server_name = ? ORDER BY canonical_name`,
      args: [serverName],
    });
    return r.rows.map(rowToPrompt);
  }

  async setEnabled(canonical: string, enabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE prompts SET enabled = ? WHERE canonical_name = ?',
      args: [enabled ? 1 : 0, canonical],
    });
  }
}

function rowToPrompt(r: Record<string, unknown>): PromptRow {
  return {
    canonicalName: r.canonical_name as string,
    serverName: r.server_name as string,
    originalName: r.original_name as string,
    description: (r.description as string | null) ?? '',
    argumentsSchema: JSON.parse(r.arguments_schema as string),
    enabled: Number(r.enabled) === 1,
    discoveredAt: Number(r.discovered_at),
  };
}
