# Observability

The Observability section of the MCP Gateway dashboard provides five screens for monitoring gateway behaviour: aggregated tool-call statistics, a per-event audit log, a reverse-channel sampling audit trail, live Prometheus metrics, and gateway health status. Together they give administrators a full picture of what is happening inside the gateway and its upstream MCP servers.

**Screens in this section:**

- [Usage](#usage)
- [Audit](#audit)
- [Sampling Log](#sampling-log)
- [Metrics](#metrics)
- [Health](#health)

---

## Usage

The Usage page displays aggregated tool-call statistics over a chosen time window, grouped by tool name, principal, or upstream server. It is the quickest way to answer questions such as "which tools are called most?" or "which principals are generating the most traffic?"

![Usage](../images/usage.png)

### How to use

1. In the top-right toolbar, click one of the time-range buttons — **1h**, **24h**, **7d**, or **30d** — to set the look-back window. The page refreshes immediately and updates every minute automatically.
2. Use the **Group by** dropdown (next to the range buttons) to pivot the data by:
   - `By tool` — aggregate counts per tool name.
   - `By principal` — aggregate counts per authenticated principal ID.
   - `By server` — aggregate counts per upstream server name.
3. The **area chart** renders the top 12 entries (by total call count) for the selected grouping. Hover over any bar to see the breakdown of `success`, `denied`, and `error` counts.
4. The **All entries** table below the chart lists every entry sorted by total calls in descending order. Each row shows:

   | Column | Description |
   |---|---|
   | Key | The tool name, principal ID, or server name (depending on grouping). |
   | `ok` | Calls that completed successfully. |
   | `deny` | Calls rejected by a policy. |
   | `err` | Calls that resulted in an error. |
   | Total | Sum of all outcomes. |

### API reference

`GET /api/usage?since=<ms>&until=<ms>&by=tool|principal|server`

---

## Audit

The Audit page shows a filterable log of individual gateway events — every tool call, policy decision, authentication event, and system action that the gateway records. It is the primary tool for investigating specific incidents.

![Audit](../images/audit.png)

### How to use

1. Select a time range with the **1h**, **24h**, or **7d** buttons in the top-right corner.
2. Use the **Result** dropdown to filter events by outcome: `all`, `success`, `denied`, or `error`.
3. Type into the **Search** field to filter events by `principalId` or `resource` (case-insensitive, partial match).
4. Type into the **Action filter** field to match a specific action string such as `tool.call`. The field accepts any substring.
5. The event list shows up to 200 events. Each row displays:

   | Column | Description |
   |---|---|
   | Timestamp | When the event occurred (relative time). |
   | Action | The event type, e.g. `tool.call`, `auth.login`. |
   | Principal | The authenticated principal ID that triggered the event. |
   | Resource | The target resource (tool name, endpoint path, etc.). |
   | Result | `success`, `denied`, or `error` badge. |

6. Click any row to expand its full detail panel, which surfaces captured metadata:

   | Field | Description |
   |---|---|
   | `HTTP` | HTTP method, path, and status code (for HTTP-origin events). |
   | `MCP method` | The MCP protocol method name. |
   | `Tool` | Tool name for `tool.call` events. |
   | `Target server` | The upstream server the tool was routed to. |
   | `Authorization` | Policy decision and the matched policy name. |
   | `IP address` | Client IP address if captured. |
   | `User agent` | Client user agent string. |
   | `Request ID` | Correlation ID for cross-log tracing. |
   | `Error` | Error code and message for `error`-result events. |

### API reference

`GET /api/audit/events?since=<ms>&until=<ms>&action=<str>&principalId=<str>&result=success|denied|error&limit=<n>`

---

## Sampling Log

The Sampling Log page shows an audit trail of reverse-channel requests — specifically `sampling/createMessage` and `roots/list` MCP method calls that originate from an upstream server back toward a connected client. Because the full reverse-channel multiplexer ships in a future release (v0.9), the gateway records every attempt at v0.8 for admin visibility even when it cannot fulfil the request itself. This log may therefore be empty on a fresh gateway with no active MCP client traffic.

![Sampling Log](../images/sampling-log.png)

### How to use

1. The three **stat cards** at the top show:
   - **Attempts (24h)** — total reverse-channel attempts in the last 24 hours.
   - **Top outcome** — the most frequent outcome code across all attempts.
   - **Top server** — the upstream server that generated the most attempts.
2. Use the **Server** text field to filter entries to a specific upstream server name (exact or partial match).
3. Use the **Method** dropdown to narrow entries to a specific MCP method: `all`, `sampling/createMessage`, or `roots/list`.
4. The entry list (last 24 hours, up to 200 rows) shows each attempt with:

   | Column | Description |
   |---|---|
   | Timestamp | When the attempt was recorded (relative time). |
   | Method | `sampling/createMessage` or `roots/list`. |
   | Upstream server | The MCP server that initiated the reverse-channel call. |
   | Principal | The principal associated with the client session, if available. |
   | Outcome | See the table below. |
   | Latency | Round-trip latency in milliseconds, if measured. |

5. **Outcome values:**

   | Outcome | Meaning |
   |---|---|
   | `success` | The request was fulfilled and a response was returned. |
   | `client_refused` | The connected client rejected the request. |
   | `timeout` | No response was received within the timeout window. |
   | `error` | An internal error occurred processing the request. |
   | `method_not_supported` | The client or gateway does not support this MCP method yet. |

### API reference

- `GET /api/sampling-log?since=<ms>&serverName=<str>&outcome=<str>&method=<str>&principalId=<str>&limit=<n>`
- `GET /api/sampling-log/stats?since=<ms>`

---

## Metrics

The Metrics page exposes the gateway's Prometheus metrics endpoint in two forms: a set of tracked counter cards with live sparkline charts, and the full raw Prometheus text exposition. The page polls `/api/metrics` every 10 seconds.

![Metrics](../images/metrics.png)

### How to use

1. The **tracked counter cards** section displays real-time values for three key counters, each with a 30-sample rolling sparkline:

   | Counter | Description |
   |---|---|
   | `mcp_tool_calls_total` | Cumulative count of all tool calls processed by the gateway. |
   | `mcp_tool_errors_total` | Cumulative count of tool calls that resulted in an error. |
   | `mcp_session_active` | Number of currently active MCP sessions (gauge). |

2. The **Raw exposition** card below the counters displays the complete Prometheus text output from `/api/metrics`. The line count is shown in the card header. You can copy this text to feed into any Prometheus-compatible scraper or monitoring system.
3. The **Last fetched** badge in the page header shows the time of the most recent successful poll.
4. If the `/api/metrics` endpoint is unavailable (e.g. metrics are disabled in gateway config), an empty-state message is shown instead.

### API reference

`GET /api/metrics` — returns Prometheus text exposition (`Content-Type: text/plain; version=0.0.4`).

**Tip:** To scrape metrics with Prometheus, add a scrape target pointing to `http://<gateway-host>/api/metrics`. No authentication header is required if the gateway is deployed behind a network boundary; add a bearer token via Prometheus `authorization` config if the admin API is exposed publicly.

---

## Health

The Health page shows the overall health of the gateway process and the connection status of every registered upstream MCP server. The page polls `/api/health` every 10 seconds.

![Health](../images/health.png)

### How to use

1. The **Gateway** card at the top reports three fields:

   | Field | Description |
   |---|---|
   | `Overall` | Overall health status: `healthy`, `degraded`, or `unhealthy`. |
   | `Version` | The gateway version string (e.g. `v0.8.0`). |
   | `Uptime` | Time since the gateway process started (e.g. `2h 14m`). |

2. The **Upstream servers** card lists every server registered with the gateway. Each row shows:

   | Column | Description |
   |---|---|
   | Server name | The configured name of the upstream MCP server. |
   | Transport | The connection transport type (e.g. `stdio`, `sse`, `streamable-http`). |
   | Status | `healthy`, `degraded`, or `unhealthy` badge with a colour indicator dot. |

3. The **Last checked** badge in the page header shows the local time of the most recent poll.
4. If the `/api/health` endpoint is unreachable, an empty-state message is shown.
5. The endpoint returns HTTP `503` when the overall status is `unhealthy`, making it suitable as a load-balancer or Kubernetes liveness/readiness probe target.

### API reference

`GET /api/health` — returns a JSON object with `status`, `version`, `uptime` (seconds), and a `servers` array. Returns HTTP `200` when `healthy` or `degraded`, `503` when `unhealthy`.

---

## See also

- [Architecture](./architecture.md)
- [Reliability](./reliability.md)
- [Security](./security.md)
- [System](./system.md)
