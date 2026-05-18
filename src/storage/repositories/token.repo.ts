import type { Client } from '@libsql/client';
export class TokenRepo {
  constructor(protected readonly client: Client) {}
}
