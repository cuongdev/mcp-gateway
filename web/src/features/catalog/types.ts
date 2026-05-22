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

export interface ConnectorSupports {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  sampling: boolean;
  roots: boolean;
}

export type ConnectorTransport =
  | { kind: 'stdio'; command: string; args: string[]; envPassthrough?: string[] }
  | { kind: 'streamable-http'; urlTemplate: string };

export type ConnectorCategory = 'developer-tools' | 'databases' | 'productivity' | 'cloud' | 'ai-ml' | 'communications' | 'local';

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
}

export interface InstalledConnector {
  id: string;
  connectorId: string;
  serverName: string;
  templateVersion: string;
  currentTemplateVersion?: string;
  updateAvailable: boolean;
  installedAt: number;
  installedBy: string | null;
}

export interface InstallResult {
  server: string;
  capabilitiesDiscovered: number;
  templateVersion: string;
}

export interface InstallOptions {
  autoDiscover?: boolean;
  enableCircuitBreaker?: boolean;
  applyRedaction?: boolean;
  proxyName?: string | null;
}
