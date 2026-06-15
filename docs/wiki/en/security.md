# Security

The Security section of the MCP Gateway dashboard gives administrators visibility into and control over the rules that scrub sensitive data from every MCP request and response before it reaches an upstream server or a connected client. Rules are evaluated at runtime by the built-in redaction engine and any matches are recorded as findings for audit purposes.

**Screens in this section:**

- [Redaction](#redaction)

---

## Redaction

The Redaction page lets you manage PII and secret-scrubbing rules that the gateway applies to MCP request arguments and response content. Each rule contains a regex pattern; when the pattern matches, the engine either replaces the text, rejects the call, or records a finding without modifying the payload — depending on the configured mode.

![Redaction](../images/redaction.png)

### How to use

The page is organised into three tabs: **Rules**, **Findings**, and **Test playground**.

#### Rules tab

1. The **Built-in rules** card lists rules shipped with the gateway (for example, credit-card numbers, AWS access keys, GitHub tokens). Built-in rules cannot be deleted, but you can disable a rule by toggling it off via the row controls.
2. The **Custom rules** card lists rules you have added. Each row shows the rule name, kind label, mode badge, and the lifetime hit count sourced from finding statistics.
3. To create a new rule, click **New custom rule**. A side sheet opens with the following fields:

   | Field | Description |
   |---|---|
   | `Name` | Human-readable label displayed in the UI and in findings. |
   | `Kind` | A free-text category label (e.g. `api-key`, `pii`) used in finding records and the `[REDACTED:<kind>]` replacement placeholder. |
   | `Pattern` | An ECMAScript regular expression. The gateway runs a safe-regex check to reject patterns with catastrophic backtracking before saving. |
   | `Mode` | See the table below. |

4. Choose a **Mode**:

   | Mode | Behaviour |
   |---|---|
   | `redact` | Replaces every match with `[REDACTED:<kind>]` and lets the call proceed. |
   | `block` | Rejects the entire MCP call with an error the moment the pattern matches. |
   | `warn` | Records the finding in the audit trail but passes the payload through unchanged. |

5. Click **Create** to save. The rule takes effect immediately for all subsequent traffic.

#### Findings tab

The **Findings** tab shows a log of rule matches recorded over the last 24 hours.

1. Use the **Server** text field to narrow findings to a specific upstream server (partial match).
2. Use the **Rule ID** text field to filter by a specific rule.
3. Use the **Scope** dropdown to filter by `request`, `response`, or show `all` findings.
4. The **stat cards** at the top show total findings in the last 24 hours, the top-matched rule, and the server with the most findings.
5. Each finding row shows the timestamp, rule name, kind, mode, match count, scope, and originating server. Click a row to expand detail.

#### Test playground tab

The **Test playground** tab lets you scan arbitrary text against all currently enabled rules without generating live traffic.

1. Paste or type any text (or JSON) into the **Sample text** area. A built-in sample demonstrating common secret formats is pre-filled.
2. Select a **Scope** (`request` or `response`) to simulate which set of rules applies.
3. Click **Scan**. The engine runs all enabled rules against your input.
4. The **Findings** panel appears below, listing every matched rule with its mode badge, kind, rule name, and match count. A `BLOCKED` badge appears if any `block`-mode rule matched.
5. The **Redacted output** panel shows the transformed text after all `redact`-mode substitutions have been applied.

### Concepts

| Concept | Detail |
|---|---|
| `scopeRequest` / `scopeResponse` | Each rule can be scoped to requests, responses, or both. Built-in rules expose this; custom rules via the UI apply to both by default. |
| Safe-regex check | The gateway rejects patterns that could cause catastrophic backtracking (ReDoS), protecting gateway latency. |
| Strings ≥ 1 MB | Strings above the 1 MB threshold are skipped by the engine as a cost-guard; this is logged but does not fail the call. |
| `postFilter` | Built-in rules may attach a post-filter (e.g. Luhn check for credit-card numbers) that rejects false positives before recording a finding. |
| Hit count | Displayed beside each rule row — sourced from persistent finding statistics, not an in-memory counter. It survives gateway restarts. |

---

## See also

- [Architecture](./architecture.md)
- [Reliability](./reliability.md)
- [Observability](./observability.md)
- [Identity](./identity.md)
