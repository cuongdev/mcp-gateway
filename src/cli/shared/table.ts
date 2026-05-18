export function table(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return '(no rows)';
  const cols = columns ?? Object.keys(rows[0]);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const sep = '  ';
  const header = cols.map((c, i) => c.padEnd(widths[i])).join(sep);
  const divider = cols.map((_, i) => '─'.repeat(widths[i])).join(sep);
  const body = rows.map((r) =>
    cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(sep),
  );
  return [header, divider, ...body].join('\n');
}

export function formatOutput(data: unknown, format: 'json' | 'table' = 'table'): string {
  if (format === 'json' || !Array.isArray(data)) return JSON.stringify(data, null, 2);
  return table(data as Array<Record<string, unknown>>);
}
