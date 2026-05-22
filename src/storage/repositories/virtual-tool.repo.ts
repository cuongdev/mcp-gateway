// ============================================================
// VirtualToolRepo — Tool composition / virtual tools (P10).
//
// Backed by `virtual_tools` (migration 0009). Stores DAG plans
// as JSON. Callers are responsible for validating plan JSON
// BEFORE create()/update() — the repo persists strings as-is.
// ============================================================

import type { Client } from '@libsql/client';

export type ErrorPolicy = 'fail_fast' | 'best_effort';

export interface VirtualToolRow {
  canonicalName: string;
  description: string | null;
  inputSchemaJson: string;
  planJson: string;
  errorPolicy: ErrorPolicy;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
  tenantId: string;
}

export interface CreateVirtualToolInput {
  canonicalName: string;
  description?: string | null;
  /** Already-validated JSON-schema string for the virtual tool's input shape. */
  inputSchemaJson: string;
  /** Already-validated plan JSON string. */
  planJson: string;
  errorPolicy?: ErrorPolicy;
  createdBy?: string | null;
  tenantId?: string;
}

export interface UpdateVirtualToolPatch {
  description?: string | null;
  inputSchemaJson?: string;
  planJson?: string;
  errorPolicy?: ErrorPolicy;
  enabled?: boolean;
}

const COLS = `canonical_name, description, input_schema_json, plan_json,
              error_policy, enabled, created_at, updated_at, created_by, tenant_id`;

export class VirtualToolRepo {
  constructor(protected readonly client: Client) {}

  async create(input: CreateVirtualToolInput): Promise<VirtualToolRow> {
    const now = Date.now();
    const tenantId = input.tenantId ?? 'tnt_default';
    const errorPolicy: ErrorPolicy = input.errorPolicy ?? 'fail_fast';
    await this.client.execute({
      sql: `INSERT INTO virtual_tools(${COLS})
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      args: [
        input.canonicalName,
        input.description ?? null,
        input.inputSchemaJson,
        input.planJson,
        errorPolicy,
        now,
        now,
        input.createdBy ?? null,
        tenantId,
      ],
    });
    const found = await this.findByName(input.canonicalName, tenantId);
    if (!found) throw new Error('Failed to read back virtual tool');
    return found;
  }

  async findByName(canonical: string, tenantId: string = 'tnt_default'): Promise<VirtualToolRow | null> {
    const r = await this.client.execute({
      sql: `SELECT ${COLS} FROM virtual_tools
            WHERE canonical_name = ? AND tenant_id = ?`,
      args: [canonical, tenantId],
    });
    if (r.rows.length === 0) return null;
    return rowToVT(r.rows[0]);
  }

  async list(tenantId: string = 'tnt_default'): Promise<VirtualToolRow[]> {
    const r = await this.client.execute({
      sql: `SELECT ${COLS} FROM virtual_tools
            WHERE tenant_id = ?
            ORDER BY canonical_name`,
      args: [tenantId],
    });
    return r.rows.map(rowToVT);
  }

  async update(
    canonical: string,
    patch: UpdateVirtualToolPatch,
    tenantId: string = 'tnt_default',
  ): Promise<VirtualToolRow | null> {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.description !== undefined) { sets.push('description = ?'); args.push(patch.description); }
    if (patch.inputSchemaJson !== undefined) { sets.push('input_schema_json = ?'); args.push(patch.inputSchemaJson); }
    if (patch.planJson !== undefined) { sets.push('plan_json = ?'); args.push(patch.planJson); }
    if (patch.errorPolicy !== undefined) { sets.push('error_policy = ?'); args.push(patch.errorPolicy); }
    if (patch.enabled !== undefined) { sets.push('enabled = ?'); args.push(patch.enabled ? 1 : 0); }
    if (sets.length === 0) return this.findByName(canonical, tenantId);
    sets.push('updated_at = ?'); args.push(Date.now());
    args.push(canonical, tenantId);
    await this.client.execute({
      sql: `UPDATE virtual_tools SET ${sets.join(', ')}
            WHERE canonical_name = ? AND tenant_id = ?`,
      args: args as never,
    });
    return this.findByName(canonical, tenantId);
  }

  async setEnabled(canonical: string, enabled: boolean, tenantId: string = 'tnt_default'): Promise<void> {
    await this.client.execute({
      sql: `UPDATE virtual_tools SET enabled = ?, updated_at = ?
            WHERE canonical_name = ? AND tenant_id = ?`,
      args: [enabled ? 1 : 0, Date.now(), canonical, tenantId],
    });
  }

  async delete(canonical: string, tenantId: string = 'tnt_default'): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM virtual_tools WHERE canonical_name = ? AND tenant_id = ?`,
      args: [canonical, tenantId],
    });
  }
}

function rowToVT(r: Record<string, unknown>): VirtualToolRow {
  // Postgres may return JSON-typed columns as parsed objects; coerce to string.
  const inputSchema = r.input_schema_json;
  const plan = r.plan_json;
  return {
    canonicalName: r.canonical_name as string,
    description: (r.description as string | null) ?? null,
    inputSchemaJson: typeof inputSchema === 'string' ? inputSchema : JSON.stringify(inputSchema),
    planJson: typeof plan === 'string' ? plan : JSON.stringify(plan),
    errorPolicy: (r.error_policy as ErrorPolicy) ?? 'fail_fast',
    enabled: Number(r.enabled) === 1,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    createdBy: (r.created_by as string | null) ?? null,
    tenantId: r.tenant_id as string,
  };
}
