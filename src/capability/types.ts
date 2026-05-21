export type CapabilityKind = 'tool' | 'resource' | 'prompt' | 'sampling' | 'root' | 'completion';

export interface CapabilityBase {
  canonicalName: string;
  serverName: string;
  kind: CapabilityKind;
  enabled: boolean;
  sensitive: boolean;
  tenantId: string;
}

export interface ToolCapability extends CapabilityBase {
  kind: 'tool';
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  cacheable: boolean;
  cacheTtlSec: number | null;
  cachePerPrincipal: boolean;
}

export interface ResourceCapability extends CapabilityBase {
  kind: 'resource';
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

export interface PromptCapability extends CapabilityBase {
  kind: 'prompt';
  originalName: string;
  description: string;
  argumentsSchema?: Record<string, unknown>;
}

export interface RootCapability extends CapabilityBase {
  kind: 'root';
  uri: string;
  name: string;
}

export type Capability = ToolCapability | ResourceCapability | PromptCapability | RootCapability;

export interface ListCapabilityOptions {
  kind?: CapabilityKind;
  serverName?: string;
  enabledOnly?: boolean;
}
