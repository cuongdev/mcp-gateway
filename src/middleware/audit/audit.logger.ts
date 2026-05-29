// ============================================================
// Audit Logger
// Primary target: AuditRepo (DB)
// Optional secondary: JSONL file export when fileExport=true
// Legacy "console" storage mode preserved.
// ============================================================

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditConfig } from "../../config/schema.js";
import type { StorageAdapter } from "../../storage/adapter.js";
import type { NewAuditEntry } from "../../storage/repositories/audit.repo.js";
import type { AuditEntry } from "../../types/gateway.js";
import { logger } from "../../utils/logger.js";
import { newId } from "../../utils/uuid.js";

const log = logger.child({ component: "audit-logger" });

export interface AuditLoggerOptions {
  /** Storage adapter (provides AuditRepo via storage.audit). */
  storage: StorageAdapter;
  /** Audit config (file export flags, legacy storage mode, etc). */
  config: AuditConfig;
}

export class AuditLogger {
  private readonly storage: StorageAdapter;
  private readonly config: AuditConfig;
  private fileReady = false;

  constructor(opts: AuditLoggerOptions) {
    this.storage = opts.storage;
    this.config = opts.config;
  }

  /**
   * Log an audit entry.
   * Always writes to AuditRepo (DB). Optionally appends a JSONL line when
   * `fileExport=true`. Failures in either path are logged but never thrown,
   * so audit writes can never break the request path.
   */
  async log(entry: AuditEntry): Promise<void> {
    // ── Primary: write to AuditRepo (DB) ─────────────
    const id = entry.id || newId();
    const repoEntry: NewAuditEntry = {
      id,
      principalId: entry.userId,
      principalType: entry.userOrg ? "user" : undefined,
      action: entry.action,
      // Tool name / target server for MCP calls; otherwise the request path
      // so HTTP/dashboard events aren't logged as a bare "GET" with no target.
      resource: entry.toolName ?? entry.targetServer ?? (entry.metadata?.path as string | undefined),
      result: mapResult(entry.result.status, entry.authorization.decision),
      durationMs: Math.round(entry.result.responseTimeMs),
      metadata: {
        requestId: entry.requestId,
        userEmail: entry.userEmail,
        userOrg: entry.userOrg,
        method: entry.method,
        toolName: entry.toolName,
        targetServer: entry.targetServer,
        authorization: entry.authorization,
        errorCode: entry.result.errorCode,
        errorMessage: entry.result.errorMessage,
        ...entry.metadata,
      },
    };

    try {
      await this.storage.audit.write(repoEntry);
    } catch (err) {
      // Never let audit DB write failures break the request path.
      log.error({ err }, "Failed to write audit entry to AuditRepo");
    }

    // ── Legacy: console storage mode ─────────────────
    if (this.config.storage === "console") {
      log.info({ audit: entry }, "Audit entry");
    }

    // ── Secondary: optional JSONL file export ────────
    if (this.config.fileExport && this.config.fileExportPath) {
      await this.appendJsonl(this.config.fileExportPath, { ...entry, id });
    }
  }

  /**
   * Append a single JSON line to the configured export file.
   * Ensures the parent directory exists on first write.
   */
  private async appendJsonl(path: string, entry: AuditEntry): Promise<void> {
    try {
      if (!this.fileReady) {
        await mkdir(dirname(path), { recursive: true });
        this.fileReady = true;
      }
      const line = JSON.stringify(entry) + "\n";
      await appendFile(path, line, "utf-8");
    } catch (err) {
      log.error({ err, path }, "Failed to append audit entry to JSONL file");
    }
  }

  /**
   * No-op flush, preserved for backward compatibility with the previous
   * buffered file writer. DB writes are immediate; file writes are
   * fire-and-forget per call.
   */
  async flush(): Promise<void> {
    // intentionally empty
  }

  /**
   * Graceful shutdown — preserved for backward compatibility.
   */
  async shutdown(): Promise<void> {
    await this.flush();
    log.info("Audit logger shut down");
  }
}

/**
 * Map the gateway's rich result/authorization shape to the repo's
 * compact `'success' | 'denied' | 'error'` enum.
 */
function mapResult(
  status: AuditEntry["result"]["status"],
  decision: AuditEntry["authorization"]["decision"],
): NewAuditEntry["result"] {
  if (decision === "DENY") return "denied";
  if (status === "error" || status === "timeout") return "error";
  return "success";
}
