import type { Client } from '@libsql/client';
export class AuditRepo {
  constructor(protected readonly client: Client) {}
}
