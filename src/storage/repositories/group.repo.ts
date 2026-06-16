import type { Client } from '@libsql/client';

export interface GroupRow {
  name: string;
  description: string;
  enabled: boolean;
  allowedRoles: string[];
  allowedUsers: string[];
  tools: string[];
  createdAt: number;
  includedServers?: string[];
  excludedTools?: string[];
  proxyName?: string;
}

export interface NewGroup {
  name: string;
  description: string;
  allowedRoles: string[];
  allowedUsers?: string[];
  tools: string[];
}

export class GroupRepo {
  constructor(protected readonly client: Client) {}

  async create(g: NewGroup): Promise<GroupRow> {
    const now = Date.now();
    // Sequential inserts (see T6 transaction note). If a group_tools insert fails
    // partway, the group row will exist with partial tools — caller can retry.
    await this.client.execute({
      sql: `INSERT INTO groups(name, description, enabled, allowed_roles, allowed_users, created_at)
            VALUES (?, ?, 1, ?, ?, ?)`,
      args: [g.name, g.description, JSON.stringify(g.allowedRoles), JSON.stringify(g.allowedUsers ?? []), now],
    });
    for (const t of g.tools) {
      await this.client.execute({
        sql: 'INSERT INTO group_tools(group_name, canonical_name) VALUES (?, ?)',
        args: [g.name, t],
      });
    }
    return {
      name: g.name, description: g.description, enabled: true,
      allowedRoles: g.allowedRoles, allowedUsers: g.allowedUsers ?? [], tools: g.tools, createdAt: now,
    };
  }

  async findByName(name: string): Promise<GroupRow | null> {
    const r = await this.client.execute({
      sql: `SELECT name, description, enabled, allowed_roles, allowed_users, created_at, proxy_name
            FROM groups WHERE name = ?`,
      args: [name],
    });
    if (r.rows.length === 0) return null;
    const tools = await this.client.execute({
      sql: 'SELECT canonical_name FROM group_tools WHERE group_name = ? ORDER BY canonical_name',
      args: [name],
    });
    const included = await this.client.execute({
      sql: 'SELECT server_name FROM group_included_servers WHERE group_name = ? ORDER BY server_name',
      args: [name],
    });
    const excluded = await this.client.execute({
      sql: 'SELECT canonical_name FROM group_excluded_tools WHERE group_name = ? ORDER BY canonical_name',
      args: [name],
    });
    return {
      name: r.rows[0].name as string,
      description: (r.rows[0].description as string | null) ?? '',
      enabled: Number(r.rows[0].enabled) === 1,
      allowedRoles: JSON.parse(r.rows[0].allowed_roles as string),
      allowedUsers: JSON.parse((r.rows[0].allowed_users as string | null) ?? '[]'),
      tools: tools.rows.map((t) => t.canonical_name as string),
      createdAt: Number(r.rows[0].created_at),
      includedServers: included.rows.map((s) => s.server_name as string),
      excludedTools: excluded.rows.map((t) => t.canonical_name as string),
      proxyName: (r.rows[0].proxy_name as string | null) ?? undefined,
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

  async setIncludedServers(name: string, servers: string[]): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM group_included_servers WHERE group_name = ?', args: [name] });
    for (const s of servers) {
      await this.client.execute({
        sql: 'INSERT INTO group_included_servers(group_name, server_name) VALUES (?, ?)',
        args: [name, s],
      });
    }
  }

  async setExcludedTools(name: string, tools: string[]): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM group_excluded_tools WHERE group_name = ?', args: [name] });
    for (const t of tools) {
      await this.client.execute({
        sql: 'INSERT INTO group_excluded_tools(group_name, canonical_name) VALUES (?, ?)',
        args: [name, t],
      });
    }
  }

  async deleteByName(name: string): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM groups WHERE name = ?', args: [name] });
  }

  async setProxyName(name: string, proxyName: string | null): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE groups SET proxy_name = ? WHERE name = ?',
      args: [proxyName, name],
    });
  }

  async setAllowedRoles(name: string, roles: string[]): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE groups SET allowed_roles = ? WHERE name = ?',
      args: [JSON.stringify(roles), name],
    });
  }

  async setAllowedUsers(name: string, users: string[]): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE groups SET allowed_users = ? WHERE name = ?',
      args: [JSON.stringify(users), name],
    });
  }

  async setDescription(name: string, description: string): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE groups SET description = ? WHERE name = ?',
      args: [description, name],
    });
  }
}
