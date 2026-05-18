import type { PrincipalRepo } from './repositories/principal.repo.js';
import type { TokenRepo } from './repositories/token.repo.js';
import type { ServerRepo } from './repositories/server.repo.js';
import type { ToolRepo } from './repositories/tool.repo.js';
import type { GroupRepo } from './repositories/group.repo.js';
import type { PolicyRepo } from './repositories/policy.repo.js';
import type { AuditRepo } from './repositories/audit.repo.js';
import type { PromptRepo } from './repositories/prompt.repo.js';
import type { UsageCounterRepo } from './repositories/usage-counter.repo.js';

export interface Tx {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertRowid?: bigint }>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
}

export interface StorageAdapter {
  init(): Promise<void>;
  close(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;

  principals: PrincipalRepo;
  tokens: TokenRepo;
  servers: ServerRepo;
  tools: ToolRepo;
  groups: GroupRepo;
  policies: PolicyRepo;
  audit: AuditRepo;
  prompts: PromptRepo;
  usage: UsageCounterRepo;
}
