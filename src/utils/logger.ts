// ============================================================
// Logger - Structured logging with Pino
// ============================================================

import pino from "pino";

export function createLogger(options?: {
  level?: string;
  name?: string;
  pretty?: boolean;
}) {
  const level = options?.level ?? process.env.LOG_LEVEL ?? "info";
  const pretty =
    options?.pretty ?? process.env.NODE_ENV === "development";

  return pino({
    name: options?.name ?? "mcp-gateway",
    level,
    ...(pretty && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    }),
    serializers: {
      err: pino.stdSerializers.err,
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: {
          "user-agent": req.headers?.["user-agent"],
          "content-type": req.headers?.["content-type"],
        },
      }),
    },
  });
}

export type Logger = pino.Logger;

/** Default logger instance */
export const logger = createLogger();
