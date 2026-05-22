# Circuit Breaker (P6)

Per-server circuit breakers automatically isolate failing upstream MCP servers and recover them once they stabilise. Every upstream call goes through `SessionManager.send()`, which consults the in-process `StateMachine` before issuing the request and records the outcome after.

## States

```
healthy ──fail-rate ≥ threshold──▶ degraded
degraded ──consec ≥ trip OR rate stays high──▶ circuit_open  (rejects with 503)
circuit_open ──cooldown elapsed──▶ half_open  (one trial probe)
half_open ──probe ok──▶ healthy
half_open ──probe fail──▶ circuit_open (reopen_count++)
                     ──reopen_count ≥ N──▶ quarantined (manual ack required)
admin --------------------------▶ manual_disabled / reset
```

Per-server config (defaults in parens):
| Knob | Default | Effect |
|---|---|---|
| `errorRateThreshold` | 0.5 | degrade when error rate over window crosses this |
| `windowSize` | 20 | rolling window size for rate calc |
| `consecutiveErrorsToTrip` | 5 | trip directly to `circuit_open` after N back-to-back failures |
| `cooldownMs` | 30000 | how long to stay open before half-open |
| `halfOpenProbes` | 1 | trial calls allowed in half-open |
| `quarantineAfterReopens` | 3 | quarantine after this many open→half_open→open flap cycles |
| `warmupCalls` | 5 | ignore failures during warm-up |

## Admin surface

```bash
# REST
GET    /api/circuits                      # all
GET    /api/circuits/:server              # single + history
POST   /api/circuits/:server/trip         # { reason }
POST   /api/circuits/:server/close
POST   /api/circuits/:server/reset
PATCH  /api/circuits/:server/config       # partial CircuitConfig

# CLI
mcp-gateway circuit status [--server X]
mcp-gateway circuit trip <server> [--reason ...]
mcp-gateway circuit close <server>
mcp-gateway circuit reset <server>
mcp-gateway circuit config <server> --error-rate 0.5 --window 20 --cooldown 30s
```

## Observability

Prometheus metrics emitted on every state transition:
- `mcp_circuit_state{server, state}` — gauge (1 for active state)
- `mcp_circuit_trips_total{server, reason}` — counter
- `mcp_circuit_rejections_total{server}` — counter
- `mcp_server_call_total{server, success}` — counter

Webhook event: `server.state.changed { from, to, reason, server, ts }`.

## Dashboard

`/circuits` page shows a card grid (one per server) with a sparkline of the rolling window. Click a card to open the detail side-sheet with full transition history, editable config, and manual trip/close/reset buttons.

## Probe loop

A background timer probes degraded and half-open servers via `tools/list` every 5 s. Healthy servers are heartbeat-probed every 60 s. Probes bypass the circuit breaker itself so a closed circuit can still test for recovery.
