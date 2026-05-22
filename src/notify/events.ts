export const EVENTS = {
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_APPROVED: 'approval.approved',
  APPROVAL_REJECTED: 'approval.rejected',
  APPROVAL_EXPIRED: 'approval.expired',
  TOOL_CALLED: 'tool.called',
  QUOTA_EXCEEDED: 'quota.exceeded',
  /** P6 circuit breaker — fired on every state-machine transition */
  SERVER_STATE_CHANGED: 'server.state.changed',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
