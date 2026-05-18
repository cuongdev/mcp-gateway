import type { Client, InValue } from '@libsql/client';

export type TenantStatus = 'active' | 'suspended' | 'deleted';

export interface TenantRow {
  id: string;
  slug: string;
  displayName: string;
  plan: string;
  status: TenantStatus;
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface CreateTenantInput {
  id: string;
  slug: string;
  displayName: string;
  plan?: string;
  metadata?: Record<string, unknown>;
}

export class TenantRepo {
  constructor(protected readonly client: Client) {}

  async create(input: CreateTenantInput): Promise<TenantRow> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO tenants(id, slug, display_name, plan, status, created_at, metadata)
            VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [input.id, input.slug, input.displayName, input.plan ?? 'free', now, JSON.stringify(input.metadata ?? {})],
    });
    const row = await this.findById(input.id);
    if (!row) throw new Error('Failed to read back tenant');
    return row;
  }

  async findById(id: string): Promise<TenantRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT id, slug, display_name, plan, status, created_at, metadata FROM tenants WHERE id = ?',
      args: [id],
    });
    if (r.rows.length === 0) return null;
    return rowToTenant(r.rows[0]);
  }

  async findBySlug(slug: string): Promise<TenantRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT id, slug, display_name, plan, status, created_at, metadata FROM tenants WHERE slug = ?',
      args: [slug],
    });
    if (r.rows.length === 0) return null;
    return rowToTenant(r.rows[0]);
  }

  async list(): Promise<TenantRow[]> {
    const r = await this.client.execute(
      'SELECT id, slug, display_name, plan, status, created_at, metadata FROM tenants ORDER BY slug',
    );
    return r.rows.map(rowToTenant);
  }

  async setStatus(id: string, status: TenantStatus): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE tenants SET status = ? WHERE id = ?',
      args: [status, id],
    });
  }

  async update(id: string, patch: { displayName?: string; plan?: string; metadata?: Record<string, unknown> }): Promise<void> {
    const sets: string[] = [];
    const args: InValue[] = [];
    if (patch.displayName !== undefined) { sets.push('display_name = ?'); args.push(patch.displayName); }
    if (patch.plan !== undefined) { sets.push('plan = ?'); args.push(patch.plan); }
    if (patch.metadata !== undefined) { sets.push('metadata = ?'); args.push(JSON.stringify(patch.metadata)); }
    if (sets.length === 0) return;
    args.push(id);
    await this.client.execute({
      sql: `UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }
}

function rowToTenant(r: Record<string, unknown>): TenantRow {
  return {
    id: r.id as string,
    slug: r.slug as string,
    displayName: r.display_name as string,
    plan: r.plan as string,
    status: r.status as TenantStatus,
    createdAt: Number(r.created_at),
    metadata: JSON.parse(r.metadata as string),
  };
}
