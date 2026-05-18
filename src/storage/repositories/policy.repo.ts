import type { Client } from '@libsql/client';

export interface PolicyRow {
  id?: number;
  ptype: string;
  values: string[];   // v0..v5, trailing empties trimmed
}

export class PolicyRepo {
  constructor(protected readonly client: Client) {}

  async append(p: { ptype: string; values: string[] }): Promise<void> {
    const v = [...p.values];
    while (v.length < 6) v.push('');
    await this.client.execute({
      sql: `INSERT INTO policies(ptype, v0, v1, v2, v3, v4, v5)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [p.ptype, v[0], v[1], v[2], v[3], v[4], v[5]],
    });
  }

  async list(): Promise<PolicyRow[]> {
    const r = await this.client.execute(
      'SELECT id, ptype, v0, v1, v2, v3, v4, v5 FROM policies ORDER BY id'
    );
    return r.rows.map((row) => {
      const values = [row.v0, row.v1, row.v2, row.v3, row.v4, row.v5]
        .map((v) => (v as string | null) ?? '');
      while (values.length > 0 && values[values.length - 1] === '') values.pop();
      return {
        id: Number(row.id),
        ptype: row.ptype as string,
        values: values as string[],
      };
    });
  }

  async replaceAll(rules: Array<{ ptype: string; values: string[] }>): Promise<void> {
    await this.client.execute('DELETE FROM policies');
    for (const p of rules) {
      const v = [...p.values];
      while (v.length < 6) v.push('');
      await this.client.execute({
        sql: `INSERT INTO policies(ptype, v0, v1, v2, v3, v4, v5)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [p.ptype, v[0], v[1], v[2], v[3], v[4], v[5]],
      });
    }
  }
}
