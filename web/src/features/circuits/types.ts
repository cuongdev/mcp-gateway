export type ServerHealthState =
  | 'healthy'
  | 'degraded'
  | 'circuit_open'
  | 'half_open'
  | 'quarantined'
  | 'manual_disabled';

export interface CallRecord {
  ts: number;
  success: boolean;
  errorCode?: string;
  latencyMs: number;
}

export interface CircuitConfig {
  errorRateThreshold: number;
  windowSize: number;
  consecutiveErrorsToTrip: number;
  cooldownMs: number;
  halfOpenProbes: number;
  quarantineAfterReopens: number;
  warmupCalls: number;
}

export interface CircuitSummary {
  serverName: string;
  state: ServerHealthState;
  config: CircuitConfig;
  rolling: CallRecord[];
  consecutiveErrors: number;
  totalCallsSinceRegister: number;
  openedAt?: number;
  halfOpenTestAt?: number;
  reopenCount: number;
  lastTransitionAt: number;
  lastTransitionReason?: string;
}
