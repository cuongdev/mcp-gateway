// ============================================================
// Audit Logger
// Persists audit entries to file (JSONL format) or console
// ============================================================

import { appendFileSync, mkdirSync, existsSync, statSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditConfig } from "../../config/schema.js";
import type { AuditEntry } from "../../types/gateway.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ component: "audit-logger" });

export class AuditLogger {
  private config: AuditConfig;
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private currentFileSize = 0;

  constructor(config: AuditConfig) {
    this.config = config;

    if (config.storage === "file") {
      this.ensureLogDirectory();
      this.initFileSize();

      // Flush buffer every 5 seconds
      this.flushInterval = setInterval(() => this.flush(), 5000);
    }
  }

  /**
   * Log an audit entry.
   * Entries are buffered and flushed periodically for performance.
   */
  async log(entry: AuditEntry): Promise<void> {
    const line = JSON.stringify(entry);

    switch (this.config.storage) {
      case "file":
        this.buffer.push(line);
        // Flush immediately if buffer is large
        if (this.buffer.length >= 100) {
          await this.flush();
        }
        break;

      case "console":
        log.info({ audit: entry }, "Audit entry");
        break;

      case "custom":
        // Custom storage can be implemented via plugin
        break;
    }
  }

  /**
   * Flush buffered entries to file.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0);
    const data = entries.join("\n") + "\n";

    try {
      // Check if rotation is needed
      if (this.currentFileSize + data.length > this.config.maxFileSize) {
        this.rotateLog();
      }

      appendFileSync(this.config.logPath, data, "utf-8");
      this.currentFileSize += data.length;
    } catch (err) {
      log.error({ err }, "Failed to write audit log file");
      // Put entries back in buffer
      this.buffer.unshift(...entries);
    }
  }

  /**
   * Rotate log file when it exceeds max size.
   */
  private rotateLog(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotatedPath = `${this.config.logPath}.${timestamp}`;

    try {
      if (existsSync(this.config.logPath)) {
        renameSync(this.config.logPath, rotatedPath);
        log.info({ from: this.config.logPath, to: rotatedPath }, "Rotated audit log");
      }
      this.currentFileSize = 0;
    } catch (err) {
      log.error({ err }, "Failed to rotate audit log");
    }
  }

  /**
   * Ensure the log directory exists.
   */
  private ensureLogDirectory(): void {
    const dir = dirname(this.config.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      log.info({ dir }, "Created audit log directory");
    }
  }

  /**
   * Initialize current file size tracking.
   */
  private initFileSize(): void {
    try {
      if (existsSync(this.config.logPath)) {
        this.currentFileSize = statSync(this.config.logPath).size;
      }
    } catch {
      this.currentFileSize = 0;
    }
  }

  /**
   * Graceful shutdown — flush remaining entries.
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
    log.info("Audit logger shut down");
  }
}
