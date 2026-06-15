# Servers & Tools

The **Servers & Tools** sidebar group is the operational core of MCP Gateway. It lets you register upstream MCP servers, inspect and control everything they expose — tools, resources, and prompts — and compose new capabilities on top of them using virtual tools and tool groups. You can also manage the outbound HTTP/SOCKS5 proxies used to reach those upstreams.

**Screens in this section:**

- [Catalog](#catalog)
- [Servers](#servers)
- [Tools](#tools)
- [Tool Groups](#tool-groups)
- [Resources](#resources)
- [Virtual Tools](#virtual-tools)
- [Prompts](#prompts)
- [Proxies](#proxies)

---

## Catalog

![Catalog screen](../images/catalog.png)

The Catalog screen provides one-click installation of pre-built connector templates for popular MCP servers such as GitHub, Postgres, Slack, and more. Each template bundles the transport configuration, required environment variables, and capability declarations so you can register a new server without writing any configuration by hand.

### How to use

1. Open **Catalog** in the sidebar. The **Browse** tab is shown by default.
2. Use the **search box** to filter by connector name or ID, and use the **category selector** to narrow the list to one of: `All`, `Developer`, `Databases`, `Productivity`, `Cloud`, `AI/ML`, `Comms`, or `Local`.
3. Click **Install** on any connector card to open the Install Wizard.
4. In the wizard's **Configure** step (step 1 of 3):
   - Set the **Server name** — this is the identifier used throughout the gateway.
   - Fill in all **required environment variables** (marked with a lock icon for secrets; values are masked).
   - Toggle the **Options** switches as needed.
5. Click **Preview** to review the JSON configuration that will be submitted (secret values are redacted).
6. Click **Install** to register the server. On success, the wizard shows a confirmation with the number of capabilities discovered.
7. To view installed connectors, switch to the **Installed** tab. Each row shows the server name, connector ID, template version, and installation date.
8. To uninstall, click **Uninstall** on an installed connector row and confirm the destructive action.

### Install Wizard options

| Option | Default | Effect |
|---|---|---|
| **Auto-discover tools after install** | On | Triggers a sync immediately after registration to populate the tool list. |
| **Enable circuit breaker** | On | Activates the circuit breaker with default thresholds for the new server. |
| **Apply redaction rules** | On | Activates tenant-level redaction rules on traffic through this server. |

### Connector template fields

| Field | Description |
|---|---|
| `id` | Unique connector identifier (e.g., `github`, `postgres`). |
| `displayName` | Human-readable name shown in the catalog card. |
| `category` | One of `developer-tools`, `databases`, `productivity`, `cloud`, `ai-ml`, `communications`, `local`. |
| `transport` | Transport kind: `stdio` (command + args) or `streamable-http` (URL template). |
| `requiredEnv` | Environment variables that must be supplied before installation. Secrets are stored masked. |
| `supports` | Flags indicating which MCP capabilities the connector exposes: `tools`, `resources`, `prompts`, `sampling`, `roots`. |

---

## Servers

![Servers screen](../images/servers.png)

The Servers screen lists every upstream MCP server registered with the gateway. From here you can register new servers manually, inspect session status, enable or disable routing, trigger a tool re-sync, and deregister servers.

### How to use

**Browsing the list**

The table shows each server's name, connection status (a green dot means an active session), number of discovered tools, and enabled state. Click any row to open the detail sheet.

**Registering a server**

1. Click **New Server** in the top-right corner.
2. Enter a unique **Name** for the server.
3. Choose the **Transport** from the selector:
   - `Streamable HTTP` — enter the upstream **URL** and an optional **Bearer token**.
   - `SSE` — same fields as Streamable HTTP.
   - `STDIO` — enter the **Command** (e.g., `node`) and **Arguments** (e.g., `./server.js --port 8001`). Toggle **Stateful** to keep the child process alive between calls.
   - `OpenAPI` — enter a **Spec URL** or **Spec path**, an optional **Base URL**, an optional **Token**, and optionally filter by **Tags**, **Operation IDs**, or **Exclude operations**.
4. Click **Register** to submit. The gateway immediately attempts to connect.

**Server detail sheet**

Click a row to open the detail sheet, which shows:

- **Session status** — `Connected` or `Offline`.
- **Tools** — count of discovered tools.
- **Enabled** toggle — disabled servers are skipped by MCP routing; toggle it to enable or disable the server without deregistering it.
- **Sync tools from upstream** button — triggers `POST /api/servers/:name/sync` to re-discover tools, resources, and prompts from the upstream server.
- **Deregister server** — permanently removes the server from the gateway and disables all its tools. The upstream process is not affected.

### Transport field reference

| Transport | Required fields | Optional fields |
|---|---|---|
| `streamable-http` / `sse` | URL | Bearer token |
| `stdio` | Command | Arguments, Stateful |
| `openapi` | Spec URL or Spec path | Base URL, Token, Tags, Operation IDs, Exclude operations |

---

## Tools

![Tools screen](../images/tools.png)

The Tools screen displays all tools discovered from registered upstream servers. You can enable or disable individual tools, and configure caching behavior and sensitivity flags for each.

### How to use

**Browsing and filtering**

1. Use the **search box** to filter tools by name or server.
2. Toggle **Show disabled** to include disabled tools in the list.
3. The count shown below the title reflects how many tools are visible out of the total registered (e.g., "12 of 20 tools from 3 servers").

**Enabling and disabling a tool**

Toggle the **Enabled** switch in the table row directly. Disabled tools are hidden from MCP clients. The change takes effect immediately via `PUT /api/tools/:name/enable` or `PUT /api/tools/:name/disable`.

**Editing tool settings**

Click a table row to open the tool detail sheet:

1. Toggle **Enabled** to enable or disable the tool.
2. In the **Cache** section:
   - Toggle **Cacheable** to allow response caching for this tool.
   - Set **TTL (seconds)** — leave empty to use the gateway-wide default.
   - Toggle **Cache per principal** to bucket cache entries by caller identity (requires `Cacheable` to be on).
3. Toggle **Sensitive** to skip caching and auditing of tool arguments for privacy-sensitive tools.
4. Click **Save changes** to persist via `PATCH /api/tools/:name`.

### Tool fields reference

| Field | Description |
|---|---|
| **Tool** | Displayed as `server__originalName`. The canonical name is `server__tool`. |
| **Description** | Tool description provided by the upstream server. |
| **Enabled** | Whether the tool is exposed to MCP clients. |
| **Cacheable** | Enables response caching for this tool. |
| **TTL (seconds)** | Cache time-to-live; `null` means use the gateway default. |
| **Cache per principal** | When on, each caller identity gets its own cache bucket. |
| **Sensitive** | Skips caching and auditing of arguments. |

---

## Tool Groups

![Tool Groups screen](../images/groups.png)

Tool Groups let you define curated subsets of tools that are exposed at a dedicated MCP endpoint (`/mcp/groups/<name>`). A group can be scoped to specific tools, filtered by server, and restricted to named roles.

### How to use

**Creating a group**

1. Click **New Group** in the top-right corner.
2. Fill in:
   - **Name** — the group identifier, used in the endpoint URL.
   - **Description** (optional) — human-readable summary.
   - **Tools (canonical names)** — add tools by their `server__tool` canonical name using the chip input.
   - **Allowed roles** — leave empty to allow all roles, or enter specific role names (e.g., `analyst`, `admin`).
3. Click **Create**.

**Editing a group**

Click a group row to open the detail sheet. The sheet has three tabs:

- **Tools tab** — manage the explicit tool list using the chip input.
- **Filters tab** — set `Included servers` (include all tools from listed servers) and `Excluded tools` (tool names to block from the group, even if a server is included).
- **Roles tab** — set `Allowed roles`; empty means all roles are permitted.

Click **Save changes** to persist. Click **Delete group** (destructive, with confirmation) to permanently remove the group and its endpoint.

### Group fields reference

| Field | Description |
|---|---|
| **Name** | URL-safe identifier. Accessible at `/mcp/groups/<name>`. |
| **Description** | Optional free-text label. |
| **Tools** | Explicit list of canonical tool names (`server__tool`). |
| **Included servers** | All tools from these servers are included in the group. |
| **Excluded tools** | Tools to block from the group even if their server is included. |
| **Allowed roles** | Role names that may access this group's endpoint; empty = unrestricted. |

---

## Resources

![Resources screen](../images/resources.png)

The Resources screen shows all MCP resources discovered from upstream servers via the `resources/list` protocol method. Resources are grouped by server in the left panel; selecting one displays its content in the right panel.

### How to use

1. Use the **Search by URI** box at the top to filter resources across all servers.
2. In the left panel, expand a server group and click a resource to select it.
3. The right panel shows the resource's name, URI, MIME type, and a toggle to **enable or disable** it. Disabled resources return a `403` when read by MCP clients.
4. The resource content is loaded automatically when you select it. If the MIME type is text or JSON, the content is rendered inline; binary payloads show a **Download** button.
5. Toggle the **Enabled** switch in the right panel to enable or disable the resource immediately via `PUT /api/resources/:canonical/enable` or `PUT /api/resources/:canonical/disable`.

> **Note:** Resources are auto-discovered when a server is registered or when you trigger **Sync tools from upstream** on the Servers screen. They are not manually created.

### Resource fields reference

| Field | Description |
|---|---|
| **URI** | The MCP resource URI (e.g., `file:///data/report.csv`). |
| **Name** | Human-readable name provided by the upstream server. |
| **MIME type** | Content type (e.g., `text/plain`, `application/json`). `binary` shown when unknown. |
| **Enabled** | Whether MCP clients can read this resource. |
| **Sensitive** | When set by the upstream server, content is not cached or audited. |

---

## Virtual Tools

![Virtual Tools screen](../images/virtual-tools.png)

Virtual Tools are declarative, DAG-orchestrated meta-tools that compose multiple upstream tool calls into a single named tool. Each virtual tool is defined by a JSON **plan** that specifies the steps, argument mappings using `{{input.*}}` / `{{steps.*}}` template expressions, and output formatting.

### How to use

**Viewing the list**

The table shows each virtual tool's canonical name, step count, error policy, and last-updated timestamp. Click a row to open the editor for that tool.

**Creating a virtual tool**

1. Click **New virtual tool**.
2. The editor loads with a sample plan. Edit the JSON in the **Plan (JSON)** text area:
   - Set `name` to the canonical name (e.g., `myserver__analyze`).
   - Set `description` to a human-readable description.
   - Define `inputSchema` as a JSON Schema object describing the tool's arguments.
   - Add one or more `steps`, each with: `id`, `tool` (canonical name of an upstream tool), `args` (with template expressions), and optionally `parallel`, `when`, and `timeoutMs`.
   - Set `output` with `format` (`merged` or `select`) and `shape`.
   - Set `errorPolicy` to `fail_fast` or `best_effort`.
3. Click **Validate** to check the plan. Validation errors are listed below the text area.
4. Click **Save** to create the virtual tool via `POST /api/virtual-tools`.

**Editing an existing virtual tool**

1. Click the tool's row in the list to open the editor.
2. Modify the plan JSON and click **Validate**, then **Save** to persist via `PUT /api/virtual-tools/:name`.

**Testing a virtual tool**

On the editor page for an existing tool, enter JSON arguments in the **Test args** box and click **Run test**. The panel below shows per-step results (args, result or error, latency) and the final output.

**Deleting a virtual tool**

Click the trash icon on the list row and confirm the deletion.

### Plan field reference

| Field | Type | Description |
|---|---|---|
| `name` | string | Canonical name for the virtual tool. |
| `description` | string | Human-readable description shown to MCP clients. |
| `inputSchema` | JSON Schema | Describes the arguments the virtual tool accepts. |
| `steps` | array | Ordered list of tool calls. Each step has `id`, `tool`, `args`, and optional `parallel`, `when`, `timeoutMs`. |
| `output.format` | `merged` \| `select` | How step results are combined into the final output. |
| `output.shape` | object or string | Template expression selecting or merging step outputs. |
| `errorPolicy` | `fail_fast` \| `best_effort` | `fail_fast` stops on the first step error; `best_effort` continues and reports all errors. |

---

## Prompts

![Prompts screen](../images/prompts.png)

The Prompts screen lists all server-defined prompts discovered from upstream servers via the MCP `prompts/list` protocol method. Prompts are displayed grouped by server. You can enable or disable individual prompts.

### How to use

1. Open **Prompts** in the sidebar.
2. Prompts are organized in cards, one card per server. Each prompt shows its name and description.
3. Toggle the **switch** next to a prompt to enable or disable it. The change is applied immediately via `PUT /api/prompts/:name/enable` or `PUT /api/prompts/:name/disable`.
4. Disabled prompts are hidden from MCP clients that call `prompts/list`.

> **Note:** Prompts are auto-discovered when a server is registered and responds to the MCP `prompts/list` request. They cannot be created manually in the dashboard.

### Prompt fields reference

| Field | Description |
|---|---|
| **Name** | The prompt's original name as defined by the upstream server. |
| **Description** | Optional description provided by the upstream server. |
| **Enabled** | Whether MCP clients can see and invoke this prompt. |
| **Server** | The upstream server that defines this prompt. |

---

## Proxies

![Proxies screen](../images/proxies.png)

The Proxies screen manages outbound HTTP/SOCKS5 proxy configurations used to route egress traffic to upstream MCP servers through an intermediary. Proxies are referenced by name from server and group configurations.

### How to use

**Creating a proxy**

1. Click **New Proxy** in the top-right corner.
2. Fill in:
   - **Name** — lowercase alphanumeric and hyphens (e.g., `corp-proxy`). Referenced from servers and groups.
   - **URL** — the proxy address. Supports `http://`, `https://`, `socks5://`, and `socks5h://` schemes (e.g., `http://user:pass@proxy.example.com:3128`).
   - **Description** (optional) — free-text label.
3. Click **Create**.

**Viewing and editing a proxy**

Click a table row to open the detail sheet:

- **URL** — update the proxy URL directly. Passwords are redacted in the list view but are fully updatable here.
- **Description** — update the description.
- **Enabled** toggle — disabled proxies stop routing new requests; servers that reference them fall back to direct routing.
- Click **Save URL + description** to persist URL and description changes.

**References**

The detail sheet shows which servers and groups currently reference this proxy (displayed as `server:<name>` or `group:<name>` badges).

**Deleting a proxy**

In the detail sheet, click **Delete proxy** in the danger zone:

- If the proxy has no references, a standard confirmation dialog appears.
- If the proxy is referenced by one or more servers or groups, you must click **Force delete (cascade)**. The gateway detaches the proxy from all references, and those servers and groups fall back to direct routing.

### Proxy fields reference

| Field | Description |
|---|---|
| **Name** | Unique identifier; used when attaching a proxy to a server or group. |
| **URL** | Full proxy URL including scheme, optional credentials, host, and port. |
| **Description** | Optional free-text description. |
| **Enabled** | When disabled, the proxy is bypassed and references fall back to direct routing. |
| **References** | List of servers and groups currently using this proxy. |

---

## See also

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Identity](./identity.md)
- [Reliability](./reliability.md)
