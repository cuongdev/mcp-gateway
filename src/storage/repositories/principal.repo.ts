import type { Client } from '@libsql/client';
export class PrincipalRepo {
  constructor(protected readonly client: Client) {}
}
