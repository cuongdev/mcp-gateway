import type { Client } from '@libsql/client';
export class PolicyRepo {
  constructor(protected readonly client: Client) {}
}
