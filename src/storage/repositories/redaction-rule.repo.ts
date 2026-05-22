import type { Client } from '@libsql/client';

export type RedactionMode = 'redact' | 'block' | 'warn';

export interface RedactionRuleRow {
  id: string;
  name: string;
  kind: string;
  pattern: string;
  mode: RedactionMode;
  replacement: string | null;
  enabled: boolean;
  builtIn: boolean;
  priority: number;
  scopeRequest: boolean;
  scopeResponse: boolean;
  tenantId: string;
  createdAt: number;
}

export interface CreateRedactionRuleInput {
  id: string;
  name: string;
  kind: string;
  pattern: string;
  mode?: RedactionMode;
  replacement?: string | null;
  enabled?: boolean;
  builtIn?: boolean;
  priority?: number;
  scopeRequest?: boolean;
  scopeResponse?: boolean;
  tenantId?: string;
}

export interface ListRedactionRulesOpts {
  tenantId?: string;
  builtIn?: boolean;
  enabled?: boolean;
}

export class RedactionRuleRepo {
  constructor(protected readonly client: Client) {}

  async create(input: CreateRedactionRuleInput): Promise<RedactionRuleRow> {
    const now = Date.now();
    const tenantId = input.tenantId ?? 'tnt_default';
    await this.client.execute({
      sql: `INSERT INTO redaction_rules
              (id, name, kind, pattern, mode, replacement, enabled, built_in,
               priority, scope_request, scope_response, tenant_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.id,
        input.name,
        input.kind,
        input.pattern,
        input.mode ?? 'redact',
        input.replacement ?? null,
        input.enabled === false ? 0 : 1,
        input.builtIn ? 1 : 0,
        input.priority ?? 100,
        input.scopeRequest === false ? 0 : 1,
        input.scopeResponse === false ? 0 : 1,
        tenantId,
        now,
      ],
    });
    const row = await this.findById(input.id);
    if (!row) throw new Error('Failed to read back redaction rule');
    return row;
  }

  async findById(id: string): Promise<RedactionRuleRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT * FROM redaction_rules WHERE id = ?',
      args: [id],
    });
    if (r.rows.length === 0) return null;
    return rowToRule(r.rows[0]);
  }

  async findByName(name: string, tenantId = 'tnt_default'): Promise<RedactionRuleRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT * FROM redaction_rules WHERE tenant_id = ? AND name = ?',
      args: [tenantId, name],
    });
    if (r.rows.length === 0) return null;
    return rowToRule(r.rows[0]);
  }

  async list(opts: ListRedactionRulesOpts = {}): Promise<RedactionRuleRow[]> {
    const tenantId = opts.tenantId ?? 'tnt_default';
    const clauses: string[] = ['tenant_id = ?'];
    const args: unknown[] = [tenantId];
    if (opts.builtIn !== undefined) {
      clauses.push('built_in = ?');
      args.push(opts.builtIn ? 1 : 0);
    }
    if (opts.enabled !== undefined) {
      clauses.push('enabled = ?');
      args.push(opts.enabled ? 1 : 0);
    }
    const r = await this.client.execute({
      sql: `SELECT * FROM redaction_rules WHERE ${clauses.join(' AND ')} ORDER BY priority, name`,
      args: args as never,
    });
    return r.rows.map(rowToRule);
  }

  async update(id: string, patch: {
    mode?: RedactionMode;
    replacement?: string | null;
    enabled?: boolean;
    priority?: number;
    scopeRequest?: boolean;
    scopeResponse?: boolean;
    pattern?: string;
    name?: string;
  }): Promise<void> {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.mode !== undefined) { sets.push('mode = ?'); args.push(patch.mode); }
    if (patch.replacement !== undefined) { sets.push('replacement = ?'); args.push(patch.replacement); }
    if (patch.enabled !== undefined) { sets.push('enabled = ?'); args.push(patch.enabled ? 1 : 0); }
    if (patch.priority !== undefined) { sets.push('priority = ?'); args.push(patch.priority); }
    if (patch.scopeRequest !== undefined) { sets.push('scope_request = ?'); args.push(patch.scopeRequest ? 1 : 0); }
    if (patch.scopeResponse !== undefined) { sets.push('scope_response = ?'); args.push(patch.scopeResponse ? 1 : 0); }
    if (patch.pattern !== undefined) { sets.push('pattern = ?'); args.push(patch.pattern); }
    if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name); }
    if (sets.length === 0) return;
    args.push(id);
    await this.client.execute({
      sql: `UPDATE redaction_rules SET ${sets.join(', ')} WHERE id = ?`,
      args: args as never,
    });
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE redaction_rules SET enabled = ? WHERE id = ?',
      args: [enabled ? 1 : 0, id],
    });
  }

  async setMode(id: string, mode: RedactionMode): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE redaction_rules SET mode = ? WHERE id = ?',
      args: [mode, id],
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM redaction_rules WHERE id = ?',
      args: [id],
    });
  }
}

function rowToRule(r: Record<string, unknown>): RedactionRuleRow {
  return {
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
    pattern: String(r.pattern),
    mode: String(r.mode) as RedactionMode,
    replacement: r.replacement == null ? null : String(r.replacement),
    enabled: Number(r.enabled) === 1,
    builtIn: Number(r.built_in) === 1,
    priority: Number(r.priority),
    scopeRequest: Number(r.scope_request) === 1,
    scopeResponse: Number(r.scope_response) === 1,
    tenantId: String(r.tenant_id),
    createdAt: Number(r.created_at),
  };
}
