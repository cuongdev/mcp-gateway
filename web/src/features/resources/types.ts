export interface ResourceSummary {
  canonicalName: string;
  serverName: string;
  uri: string;
  name: string;
  description: string;
  mimeType: string | null;
  enabled: boolean;
  sensitive: boolean;
  discoveredAt: number;
}

export interface ResourceContents {
  contents: Array<{ uri?: string; mimeType?: string; text?: string; blob?: string }>;
}
