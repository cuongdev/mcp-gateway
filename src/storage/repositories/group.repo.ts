import type { Client } from '@libsql/client';

export interface GroupRow {
  name: string;
  description: string;
  enabled: boolean;
  allowedRoles: string[];
  tools: string[];
  createdAt: number;
}

export interface NewGroup {
  name: string;
  description: string;
  allowedRoles: string[];
  tools: string[];
}

export class GroupRepo {
  constructor(protected readonly client: Client) {}

  async create(g: NewGroup): Promise<GroupRow> {
    const now = Date.now();
    // Sequential inserts (see T6 transaction note). If a group_tools insert fails
    // partway, the group row will exist with partial tools — caller can retry.
    await this.client.execute({
      sql: `INSERT INTO groups(name, description, enabled, allowed_roles, created_at)
            VALUES (?, ?, 1, ?, ?)`,
      args: [g.name, g.description, JSON.stringify(g.allowedRoles), now],
    });
    for (const t of g.tools) {
      await this.client.execute({
        sql: 'INSERT INTO group_tools(group_name, canonical_name) VALUES (?, ?)',
        args: [g.name, t],
      });
    }
    return {
      name: g.name, description: g.description, enabled: true,
      allowedRoles: g.allowedRoles, tools: g.tools, createdAt: now,
    };
  }

  async findByName(name: string): Promise<GroupRow | null> {
    const r = await this.client.execute({
      sql: `SELECT name, description, enabled, allowed_roles, created_at
            FROM groups WHERE name = ?`,
      args: [name],
    });
    if (r.rows.length === 0) return null;
    const tools = await this.client.execute({
      sql: 'SELECT canonical_name FROM group_tools WHERE group_name = ? ORDER BY canonical_name',
      args: [name],
    });
    return {
      name: r.rows[0].name as string,
      description: (r.rows[0].description as string | null) ?? '',
      enabled: Number(r.rows[0].enabled) === 1,
      allowedRoles: JSON.parse(r.rows[0].allowed_roles as string),
      tools: tools.rows.map((t) => t.canonical_name as string),
      createdAt: Number(r.rows[0].created_at),
    };
  }

  async list(): Promise<GroupRow[]> {
    const r = await this.client.execute(`SELECT name FROM groups ORDER BY name`);
    const out: GroupRow[] = [];
    for (const row of r.rows) {
      const g = await this.findByName(row.name as string);
      if (g) out.push(g);
    }
    return out;
  }

  async setTools(name: string, tools: string[]): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM group_tools WHERE group_name = ?', args: [name] });
    for (const t of tools) {
      await this.client.execute({
        sql: 'INSERT INTO group_tools(group_name, canonical_name) VALUES (?, ?)',
        args: [name, t],
      });
    }
  }

  async deleteByName(name: string): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM groups WHERE name = ?', args: [name] });
  }
}
