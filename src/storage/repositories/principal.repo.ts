import type { Client } from '@libsql/client';

export type PrincipalType = 'user' | 'service_account' | 'mcp_client';

export interface PrincipalRow {
  id: string;
  type: PrincipalType;
  displayName: string;
  disabled: boolean;
  createdAt: number;
  email?: string;
  oidcSubject?: string;
  oidcProviderId?: string;
  description?: string;
  isBootstrap?: boolean;
  allowedServers?: string[];
}

export interface NewServiceAccount {
  id: string;
  displayName: string;
  description?: string;
  isBootstrap?: boolean;
}

export interface NewUser {
  id: string;
  displayName: string;
  email: string;
  oidcSubject?: string;
  oidcProviderId?: string;
}

export interface NewMCPClient {
  id: string;
  displayName: string;
  description?: string;
  allowedServers: string[];
}

export class PrincipalRepo {
  constructor(protected readonly client: Client) {}

  async createServiceAccount(p: NewServiceAccount): Promise<PrincipalRow> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO principals(id, type, display_name, disabled, created_at)
            VALUES (?, 'service_account', ?, 0, ?)`,
      args: [p.id, p.displayName, now],
    });
    await this.client.execute({
      sql: `INSERT INTO service_accounts(principal_id, description, is_bootstrap)
            VALUES (?, ?, ?)`,
      args: [p.id, p.description ?? null, p.isBootstrap ? 1 : 0],
    });
    return {
      id: p.id, type: 'service_account', displayName: p.displayName,
      disabled: false, createdAt: now,
      description: p.description, isBootstrap: !!p.isBootstrap,
    };
  }

  async createUser(p: NewUser): Promise<PrincipalRow> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO principals(id, type, display_name, disabled, created_at)
            VALUES (?, 'user', ?, 0, ?)`,
      args: [p.id, p.displayName, now],
    });
    await this.client.execute({
      sql: `INSERT INTO users(principal_id, email, oidc_subject, oidc_provider_id)
            VALUES (?, ?, ?, ?)`,
      args: [p.id, p.email, p.oidcSubject ?? null, p.oidcProviderId ?? null],
    });
    return {
      id: p.id, type: 'user', displayName: p.displayName,
      disabled: false, createdAt: now,
      email: p.email, oidcSubject: p.oidcSubject, oidcProviderId: p.oidcProviderId,
    };
  }

  async createMCPClient(p: NewMCPClient): Promise<PrincipalRow> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO principals(id, type, display_name, disabled, created_at)
            VALUES (?, 'mcp_client', ?, 0, ?)`,
      args: [p.id, p.displayName, now],
    });
    await this.client.execute({
      sql: `INSERT INTO mcp_clients(principal_id, description, allowed_servers)
            VALUES (?, ?, ?)`,
      args: [p.id, p.description ?? null, JSON.stringify(p.allowedServers)],
    });
    return {
      id: p.id, type: 'mcp_client', displayName: p.displayName,
      disabled: false, createdAt: now,
      description: p.description, allowedServers: p.allowedServers,
    };
  }

  async findById(id: string): Promise<PrincipalRow | null> {
    const base = await this.client.execute({
      sql: 'SELECT id, type, display_name, disabled, created_at FROM principals WHERE id = ?',
      args: [id],
    });
    if (base.rows.length === 0) return null;
    const r = base.rows[0];
    const type = r.type as PrincipalType;
    const row: PrincipalRow = {
      id: r.id as string,
      type,
      displayName: r.display_name as string,
      disabled: Number(r.disabled) === 1,
      createdAt: Number(r.created_at),
    };
    if (type === 'user') {
      const u = await this.client.execute({
        sql: 'SELECT email, oidc_subject, oidc_provider_id FROM users WHERE principal_id = ?',
        args: [id],
      });
      if (u.rows[0]) {
        row.email = u.rows[0].email as string;
        row.oidcSubject = (u.rows[0].oidc_subject as string | null) ?? undefined;
        row.oidcProviderId = (u.rows[0].oidc_provider_id as string | null) ?? undefined;
      }
    } else if (type === 'service_account') {
      const s = await this.client.execute({
        sql: 'SELECT description, is_bootstrap FROM service_accounts WHERE principal_id = ?',
        args: [id],
      });
      if (s.rows[0]) {
        row.description = (s.rows[0].description as string | null) ?? undefined;
        row.isBootstrap = Number(s.rows[0].is_bootstrap) === 1;
      }
    } else if (type === 'mcp_client') {
      const m = await this.client.execute({
        sql: 'SELECT description, allowed_servers FROM mcp_clients WHERE principal_id = ?',
        args: [id],
      });
      if (m.rows[0]) {
        row.description = (m.rows[0].description as string | null) ?? undefined;
        row.allowedServers = JSON.parse(m.rows[0].allowed_servers as string);
      }
    }
    return row;
  }

  async findBootstrapAdmin(): Promise<PrincipalRow | null> {
    const r = await this.client.execute(`
      SELECT p.id FROM principals p
      JOIN service_accounts sa ON sa.principal_id = p.id
      WHERE sa.is_bootstrap = 1 LIMIT 1
    `);
    if (r.rows.length === 0) return null;
    return this.findById(r.rows[0].id as string);
  }

  async setDisabled(id: string, disabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE principals SET disabled = ? WHERE id = ?',
      args: [disabled ? 1 : 0, id],
    });
  }

  async findByOidc(
    oidcSubject: string,
    oidcProviderId: string,
  ): Promise<PrincipalRow | null> {
    const r = await this.client.execute({
      sql: `SELECT principal_id FROM users
            WHERE oidc_subject = ? AND oidc_provider_id = ?`,
      args: [oidcSubject, oidcProviderId],
    });
    if (r.rows.length === 0) return null;
    return this.findById(r.rows[0].principal_id as string);
  }

  async upsertOidcUser(input: {
    oidcSubject: string;
    oidcProviderId: string;
    email: string;
    displayName: string;
  }): Promise<PrincipalRow> {
    const existing = await this.findByOidc(input.oidcSubject, input.oidcProviderId);
    if (existing) {
      await this.client.execute({
        sql: `UPDATE users SET email = ? WHERE principal_id = ?`,
        args: [input.email, existing.id],
      });
      await this.client.execute({
        sql: `UPDATE principals SET display_name = ? WHERE id = ?`,
        args: [input.displayName, existing.id],
      });
      const refreshed = await this.findById(existing.id);
      if (!refreshed) throw new Error('Principal disappeared mid-upsert');
      return refreshed;
    }
    const { newId } = await import('../../utils/uuid.js');
    const id = newId();
    await this.createUser({
      id,
      email: input.email,
      displayName: input.displayName,
      oidcSubject: input.oidcSubject,
      oidcProviderId: input.oidcProviderId,
    });
    const created = await this.findById(id);
    if (!created) throw new Error('createUser succeeded but findById returned null');
    return created;
  }
}
