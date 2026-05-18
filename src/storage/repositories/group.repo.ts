import type { Client } from '@libsql/client';
export class GroupRepo {
  constructor(protected readonly client: Client) {}
}
