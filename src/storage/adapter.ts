import type { PrincipalRepo } from './repositories/principal.repo.js';
import type { TokenRepo } from './repositories/token.repo.js';
import type { ServerRepo } from './repositories/server.repo.js';
import type { ToolRepo } from './repositories/tool.repo.js';
import type { GroupRepo } from './repositories/group.repo.js';
import type { PolicyRepo } from './repositories/policy.repo.js';
import type { AuditRepo } from './repositories/audit.repo.js';
import type { PromptRepo } from './repositories/prompt.repo.js';
import type { UsageCounterRepo } from './repositories/usage-counter.repo.js';
import type { CacheEntryRepo } from './repositories/cache-entry.repo.js';
import type { ApprovalRepo } from './repositories/approval.repo.js';
import type { WebhookRepo } from './repositories/webhook.repo.js';
import type { WebhookDeliveryRepo } from './repositories/webhook-delivery.repo.js';
import type { TenantRepo } from './repositories/tenant.repo.js';
import type { ProxyRepo } from './repositories/proxy.repo.js';
import type { ResourceRepo } from './repositories/resource.repo.js';
import type { RootRepo } from './repositories/root.repo.js';
import type { ServerStateRepo } from './repositories/server-state.repo.js';
import type { RedactionRuleRepo } from './repositories/redaction-rule.repo.js';
import type { RedactionFindingRepo } from './repositories/redaction-finding.repo.js';
import type { CatalogInstallRepo } from './repositories/catalog-install.repo.js';
import type { VirtualToolRepo } from './repositories/virtual-tool.repo.js';
import type { SamplingLogRepo } from './repositories/sampling-log.repo.js';

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
  cache: CacheEntryRepo;
  approvals: ApprovalRepo;
  webhooks: WebhookRepo;
  webhookDeliveries: WebhookDeliveryRepo;
  tenants: TenantRepo;
  proxies: ProxyRepo;
  resources: ResourceRepo;
  roots: RootRepo;
  serverStates: ServerStateRepo;
  redactionRules: RedactionRuleRepo;
  redactionFindings: RedactionFindingRepo;
  catalogInstalls: CatalogInstallRepo;
  virtualTools: VirtualToolRepo;
  samplingLog: SamplingLogRepo;
}
