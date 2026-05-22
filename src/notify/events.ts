export const EVENTS = {
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_APPROVED: 'approval.approved',
  APPROVAL_REJECTED: 'approval.rejected',
  APPROVAL_EXPIRED: 'approval.expired',
  TOOL_CALLED: 'tool.called',
  QUOTA_EXCEEDED: 'quota.exceeded',
  /** P6 circuit breaker — fired on every state-machine transition */
  SERVER_STATE_CHANGED: 'server.state.changed',
  /** P7 redaction — fired when a rule blocks an MCP call */
  REDACTION_BLOCK: 'redaction.block',
  /** P9 catalog — fired after a connector is installed */
  CATALOG_INSTALLED: 'catalog.installed',
  /** P9 catalog — fired after a cataloged server is uninstalled */
  CATALOG_UNINSTALLED: 'catalog.uninstalled',
  /** P10 virtual tools — fired after a virtual tool is created or updated */
  VIRTUAL_TOOL_CHANGED: 'virtual-tool.changed',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
