# Identity & Access

MCP Gateway uses a unified principal model for authentication and authorization. Every entity that interacts with the gateway — a human signing in through an identity provider, a service script using a personal access token, or an AI agent authenticating with a machine credential — is represented as a **principal** with one of three types: `user`, `service_account`, or `mcp_client`. Access decisions are evaluated by a Casbin RBAC engine against policy rules and role bindings that you manage from this section.

**Screens in this section:**

- [Users](#users)
- [MCP Clients](#mcp-clients)
- [My Tokens](#my-tokens)
- [OIDC Providers](#oidc-providers)
- [Policies](#policies)

---

## Users

Manage human user accounts in the gateway. Users authenticate either via an OIDC provider (browser-based single sign-on) or by presenting a Personal Access Token (PAT) they have generated from the [My Tokens](#my-tokens) screen.

![Users screen](../images/users.png)

### How to use

1. Navigate to **Identity → Users** in the sidebar.
2. The table lists all principals of type `user`, showing **Name**, **Email**, and **Status** (`Active` / `Disabled`).
3. Click any row to open the detail panel for that user.
4. To create a user, click **New User** (top right).

#### Creating a user

1. Click **New User**. A slide-over panel appears.
2. Fill in **Email** (must be a valid email address) and **Display name**.
3. Click **Create**. The gateway creates a `user` principal and returns the new `principalId`. The user may then authenticate via OIDC or generate a PAT.

#### Viewing and managing a user

1. Click a row in the table.
2. The detail panel shows the user's email, display name, and current status.
3. Use the **Active** toggle to enable or disable the account. Disabled users cannot authenticate via any method until re-enabled.
4. To permanently remove the account, click **Hard delete user** in the **Danger zone** and confirm. A hard delete cascades to all PATs and Casbin role bindings owned by that user. Use **Disable** instead if you want a reversible action.

### Fields

| Field | Description |
|---|---|
| `Email` | Unique identifier used to match the user during OIDC login or PAT authentication. |
| `Display name` | Human-readable label shown throughout the dashboard. |
| `Status` | `Active` (can authenticate) or `Disabled` (all authentication blocked). |
| `principalId` | Internal UUID assigned at creation; used in policy rules and API calls. |

---

## MCP Clients

Manage machine principals (`mcp_client` type) that represent AI agents, automation scripts, or other non-human callers. Each MCP client is issued a bearer token at creation time. Clients authenticate by sending this token in the `Authorization: Bearer <token>` header.

![MCP Clients screen](../images/mcp-clients.png)

### How to use

1. Navigate to **Identity → MCP Clients** in the sidebar.
2. The table lists all `mcp_client` principals with their **Name**, **Description**, **Allowed Servers**, and **Status**.
3. Click any row to open the detail panel.
4. To register a new client, click **New MCP Client** (top right).

#### Creating an MCP client

1. Click **New MCP Client**. A slide-over panel appears.
2. Fill in **Name** (required) and optionally **Description**.
3. In the **Allowed servers** chip input, enter the server IDs this client may access. Enter `*` to grant access to all registered servers. Type an ID and press Enter to add it as a chip.
4. Click **Create**. The gateway generates a token prefixed `mct_live_…` and displays it **once** in a reveal dialog. Copy it immediately — it cannot be retrieved again.

#### Managing an existing client

1. Click a client row to open the detail panel.
2. Edit **Allowed servers** and click **Save allowedServers** to update which servers the client can reach.
3. Use the **Active** toggle to enable or disable the client without deleting it.
4. Click **Rotate token** to invalidate the current token and generate a new one. The new token is shown once in the reveal dialog.
5. To permanently remove the client, click **Delete client** in the **Danger zone** and confirm. This cascades to all tokens and audit-log references.

### Fields

| Field | Description |
|---|---|
| `Name` | Display name for the client (also used as the initial token name). |
| `Description` | Optional free-text note about the client's purpose. |
| `Allowed servers` | List of server IDs (or `*`) this client is permitted to proxy. |
| `Status` | `Active` or `Disabled`. |
| Token prefix | First characters of the token shown in the table (e.g. `mct_live_ab12…`) for identification without exposing the secret. |

> **Security note:** Tokens are hashed before storage. Only the prefix is kept in plaintext. If you lose a token, rotate it — there is no way to recover the original value.

---

## My Tokens

Create and revoke Personal Access Tokens (PATs) that authenticate you — the currently signed-in `user` principal — against the gateway API and CLI. PAT management is available only to principals of type `user`; `mcp_client` and `service_account` principals cannot access this screen.

![My Tokens screen](../images/my-tokens.png)

### How to use

1. Navigate to **Identity → My Tokens** in the sidebar.
2. The table lists your active PATs with columns: **Name**, **Prefix**, **Created**, and **Expires**.
3. To create a token, click **New PAT** (top right).
4. To revoke a token, click the trash icon in its row and confirm in the dialog.

#### Creating a token

1. Click **New PAT**. A slide-over panel appears.
2. Enter a **Name** (e.g. `laptop-cli`) to identify the token later.
3. Optionally enter **Expires in (days)** — leave blank for a non-expiring token. Expiry is calculated from the moment you click **Create**.
4. Click **Create**. The token (prefixed `pat_live_…`) is displayed **once** in a reveal dialog. Copy it immediately before closing.

#### Revoking a token

1. Locate the token in the table by **Name** or **Prefix**.
2. Click the trash icon on the right.
3. Confirm in the dialog. Revocation is immediate and permanent — the token stops working at once and cannot be restored.

### Fields

| Field | Description |
|---|---|
| `Name` | Label you choose at creation. |
| `Prefix` | First characters of the token for identification (e.g. `pat_live_ab12…`). |
| `Created` | Timestamp when the token was created. |
| `Expires` | Expiry date/time, or `never` if no expiry was set. |

> **Tip:** Use short-lived tokens for CI pipelines and non-expiring tokens only for local development where you can rotate them manually.

---

## OIDC Providers

View the identity providers that the gateway uses for browser-based single sign-on. This is a **read-only** screen; providers are configured in the gateway config file (`oidcProviders[]` array) and take effect after a gateway restart. No create, update, or delete operations are available at runtime.

![OIDC Providers screen](../images/oidc.png)

### How to use

1. Navigate to **Identity → OIDC Providers** in the sidebar.
2. Each configured provider appears as a card showing:
   - **Provider name** and **ID** (the short identifier used in the `loginUrl`).
   - A **Login URL** link (`/auth/login/<id>`) that initiates the authorization code + PKCE flow for that provider.
   - A **copy** button next to the login URL.
3. If no providers are listed, the gateway is running in development mode or the `oidcProviders` array in the config file is empty.

#### Adding or modifying a provider

Providers cannot be added or changed through the dashboard. To configure a new provider:

1. Edit the gateway config file and add an entry to `oidcProviders[]` with the required fields: `id`, `name`, `discoveryUrl`, `clientId`, `clientSecret`, and `scopes`.
2. Restart the gateway. The new provider appears on this screen immediately on next load.

### Fields (per provider card)

| Field | Description |
|---|---|
| `id` | Short identifier used in the login and callback URLs (e.g. `google`). |
| `name` | Human-readable provider name shown on the login screen. |
| `loginUrl` | Full URL to initiate the OIDC flow: `<publicUrl>/auth/login/<id>`. |

### OIDC authentication flow

When a user clicks the login URL, the gateway:

1. Generates a PKCE `code_verifier` / `code_challenge` pair and a random `state`.
2. Redirects the browser to the provider's `authorization_endpoint`.
3. The provider authenticates the user and redirects back to `/auth/callback/<id>`.
4. The gateway exchanges the authorization code for an ID token, verifies it, and upserts a `user` principal in storage.
5. A signed session cookie (valid for 8 hours) is set and the browser is redirected to the dashboard.

---

## Policies

Manage the Casbin RBAC rules that control which principals can perform which actions on which resources. The screen has two tabs: **Rules** (policy rules of the form `subject, object, action`) and **Role Bindings** (assignments of users to roles).

![Policies screen](../images/policies.png)

### How to use

#### Viewing and reloading policies

1. Navigate to **Identity → Policies** in the sidebar.
2. The **Rules** tab lists all active `p` (policy) rules. Each row shows **Subject**, **Object**, and **Action**.
3. The **Role Bindings** tab lists all `g` (grouping) rules showing **User** and **Role**.
4. Click **Reload from file** (top right) to reload policies from the persisted store without restarting the gateway.

#### Adding a policy rule

1. Select the **Rules** tab.
2. In the **Add policy rule** form at the top, fill in:
   - **Subject** — the principal or role being granted access (e.g. `admin`, `alice@example.com`).
   - **Object** — the resource being protected (e.g. `tool:db__query`, `tool:github__*`).
   - **Action** — the operation being permitted (e.g. `execute`).
3. Click **Add**. The rule takes effect immediately.

#### Removing a policy rule

1. In the **Rules** table, find the rule to remove.
2. Click the trash icon on its row. The rule is removed and the enforcer is reloaded.

#### Assigning a role to a user

1. Select the **Role Bindings** tab.
2. In the **Assign role to user** form, enter the **User** (typically the user's email or `principalId`) and the **Role** name (e.g. `admin`).
3. Click **Assign**. The binding is stored as a `g, user, role` rule in Casbin.

#### Removing a role binding

1. In the **Role Bindings** table, find the binding.
2. Click the trash icon on its row. The binding is removed immediately.

### Concepts

| Concept | Description |
|---|---|
| **Subject** (`sub`) | The principal or role being granted access. Can be a `principalId`, an email, or a role name. |
| **Object** (`obj`) | The resource being protected. Use `tool:<server>__<tool>` for individual tools, or glob patterns like `tool:db__*`. |
| **Action** (`act`) | The operation allowed. Typically `execute` for MCP tool calls. |
| **Role binding** | A `g, user, role` rule that assigns a user to a role, enabling role-based inheritance of policy rules. |
| **Reload** | Forces the policy engine to re-read rules from storage. Use after bulk imports or external edits to the policy file. |

> **Tip:** Assign broad rules to roles (e.g. give the `admin` role `*, *, execute`) and then bind specific users to those roles rather than writing per-user rules. This makes access control easier to audit and maintain.

---

## See also

- [Architecture](./architecture.md)
- [Servers & Tools](./servers-and-tools.md)
- [Reliability](./reliability.md)
- [System](./system.md)
