import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createStorage } from '../../../src/storage/index.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';

export interface PgTestEnv {
  storage: StorageAdapter;
  container: StartedPostgreSqlContainer;
  close: () => Promise<void>;
}

export async function makePgStorage(): Promise<PgTestEnv> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const storage = await createStorage({ driver: 'postgres', url });
  return {
    storage,
    container,
    close: async () => {
      await storage.close();
      await container.stop();
    },
  };
}

/**
 * Postgres integration tests are opt-in: CI sets RUN_PG_TESTS=1, and any
 * environment with a DOCKER_HOST exported is presumed to have a working
 * Docker daemon.  Local runs without Docker should skip cleanly.
 */
export const HAS_DOCKER =
  process.env.RUN_PG_TESTS === '1' || process.env.DOCKER_HOST !== undefined;
