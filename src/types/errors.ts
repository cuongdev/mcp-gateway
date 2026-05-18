// ============================================================
// Custom Error Classes for MCP Gateway
// ============================================================

export class GatewayError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// ── Authentication Errors ──────────────────────────────────

export class AuthenticationError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "AUTHENTICATION_ERROR", 401, details);
    this.name = "AuthenticationError";
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor(reason: string) {
    super(`Invalid token: ${reason}`, { reason });
    this.name = "InvalidTokenError";
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor() {
    super("Token has expired");
    this.name = "TokenExpiredError";
  }
}

export class MissingTokenError extends AuthenticationError {
  constructor() {
    super("No authorization token provided");
    this.name = "MissingTokenError";
  }
}

// ── Authorization Errors ───────────────────────────────────

export class AuthorizationError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "AUTHORIZATION_ERROR", 403, details);
    this.name = "AuthorizationError";
  }
}

export class InsufficientPermissionsError extends AuthorizationError {
  constructor(
    userId: string,
    action: string,
    resource: string
  ) {
    super(`User ${userId} lacks permission to ${action} on ${resource}`, {
      userId,
      action,
      resource,
    });
    this.name = "InsufficientPermissionsError";
  }
}

export class ToolAccessDeniedError extends AuthorizationError {
  constructor(userId: string, toolName: string) {
    super(`User ${userId} is not authorized to execute tool: ${toolName}`, {
      userId,
      toolName,
    });
    this.name = "ToolAccessDeniedError";
  }
}

// ── MCP Protocol Errors ────────────────────────────────────

export class MCPProtocolError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "MCP_PROTOCOL_ERROR", 400, details);
    this.name = "MCPProtocolError";
  }
}

export class InvalidMessageError extends MCPProtocolError {
  constructor(reason: string) {
    super(`Invalid MCP message: ${reason}`, { reason });
    this.name = "InvalidMessageError";
  }
}

// ── Transport Errors ───────────────────────────────────────

export class TransportError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "TRANSPORT_ERROR", 502, details);
    this.name = "TransportError";
  }
}

export class UpstreamConnectionError extends TransportError {
  constructor(serverName: string, cause?: string) {
    super(`Failed to connect to upstream server: ${serverName}`, {
      serverName,
      cause,
    });
    this.name = "UpstreamConnectionError";
  }
}

export class UpstreamTimeoutError extends TransportError {
  constructor(serverName: string, timeoutMs: number) {
    super(
      `Upstream server ${serverName} timed out after ${timeoutMs}ms`,
      { serverName, timeoutMs }
    );
    this.name = "UpstreamTimeoutError";
  }
}

// ── Configuration Errors ───────────────────────────────────

export class ConfigurationError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIGURATION_ERROR", 500, details);
    this.name = "ConfigurationError";
  }
}
