import type { Client } from '@libsql/client';
export class ServerRepo {
  constructor(protected readonly client: Client) {}
}
