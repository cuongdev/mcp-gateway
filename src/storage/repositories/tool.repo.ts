import type { Client } from '@libsql/client';
export class ToolRepo {
  constructor(protected readonly client: Client) {}
}
