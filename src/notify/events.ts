export const EVENTS = {
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_APPROVED: 'approval.approved',
  APPROVAL_REJECTED: 'approval.rejected',
  APPROVAL_EXPIRED: 'approval.expired',
  TOOL_CALLED: 'tool.called',
  QUOTA_EXCEEDED: 'quota.exceeded',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
