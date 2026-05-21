// ============================================================
// Connector template registry — types (spec §4.4)
// ============================================================

export type ConnectorCategory =
  | 'developer-tools'
  | 'databases'
  | 'productivity'
  | 'cloud'
  | 'ai-ml'
  | 'communications'
  | 'local';

export interface ConnectorEnv {
  key: string;
  description: string;
  secret: boolean;
  pattern?: string;
}

export interface ConnectorArg {
  key: string;
  description: string;
  default?: unknown;
  type: 'string' | 'number' | 'boolean';
}

export type ConnectorTransport =
  | {
      kind: 'stdio';
      command: string;
      args: string[];
      envPassthrough?: string[];
    }
  | {
      kind: 'streamable-http';
      urlTemplate: string;
    };

export interface ConnectorSupports {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  sampling: boolean;
  roots: boolean;
}

export interface ConnectorDefaults {
  rateLimit?: { perSecond: number };
  quota?: { perDay: number };
  circuit?: Record<string, unknown>;
}

export interface ConnectorTemplate {
  id: string;
  displayName: string;
  category: ConnectorCategory;
  iconSlug?: string;
  docsUrl: string;
  templateVersion: string;
  transport: ConnectorTransport;
  requiredEnv: ConnectorEnv[];
  requiredArgs?: ConnectorArg[];
  optionalArgs?: ConnectorArg[];
  supports: ConnectorSupports;
  defaults?: ConnectorDefaults;
}

export interface ConnectorCatalogFile {
  version: string;
  connectors: ConnectorTemplate[];
}

export interface ConnectorFilter {
  category?: ConnectorCategory;
  supports?: keyof ConnectorSupports;
}
