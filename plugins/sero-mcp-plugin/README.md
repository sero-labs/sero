# `@sero-ai/plugin-mcp`

Built-in first-party MCP control center for Sero.

This plugin adapts the `pi-mcp-adapter` backend ideas into a **Sero-native, UI-first** workflow for configuring, authenticating, inspecting, and using MCP servers from inside the desktop app.

## What v1 ships

- first-run setup wizard
- stdio and HTTP/SSE server setup
- server CRUD, enable/disable, connect/reconnect
- lazy/eager/keep-alive lifecycle handling through the singleton extension runtime
- metadata caching plus cache-backed snapshot state
- top-level MCP-only search workbench across cached tools/resources
- embedded OAuth auth flow inside Sero
- inline previews for normal MCP resources
- interactive loopback viewer sessions for `ui://` resources and UI-capable tools
- server detail tool runner for calling discovered tools
- exactly one bridged agent/CLI tool: `mcp`
- one UI-only management tool: `mcp_manager`

## Product shape

This plugin keeps the agent-facing MCP surface intentionally small.

### Bridged tool surface

Exactly one bridged tool is exposed:

- `mcp`

### UI-only management surface

The app uses one internal management tool:

- `mcp_manager`

`mcp_manager` is **not** bridged to the agent or CLI. It exists so the MCP app can handle config, auth, diagnostics, and viewer actions without exploding the tool surface.

### Explicit v1 guardrails

- no direct per-server tool registration
- no direct per-tool exposure
- no popup-first auth or viewer workflow
- no TUI `/mcp` panel port

## Quick start in Sero

1. Open the **MCP** app from the Sero sidebar.
2. On first launch, use the setup wizard to create your first server.
3. Choose either a **stdio** server or an **HTTP/SSE** server.
4. Save the server, then use **Connect** or **Reconnect**.
5. If the server requires OAuth, start auth from the MCP app and complete it in the embedded auth/viewer pane.
6. Inspect tools/resources from the server detail view, run tools from the tool runner, or use the search workbench to jump across cached MCP inventory.

The app also includes diagnostics and **Ask Sero to help** recovery actions when a server, auth flow, or resource viewer fails.

## Server setup

### Stdio servers

Use stdio mode for local MCP servers launched by a command such as `npx`, `uvx`, `python`, `docker`, or a local executable.

Typical fields:

- command
- args
- optional env
- optional cwd
- lifecycle mode

Example raw config:

```json
{
  "mcpServers": {
    "filesystem": {
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "lifecycle": "lazy"
    }
  }
}
```

### Streamable HTTP servers

Use HTTP mode for remote MCP servers that expose a Streamable HTTP endpoint.

Typical fields:

- url
- optional headers
- auth mode
- lifecycle mode

Example raw config:

```json
{
  "mcpServers": {
    "remote-demo": {
      "enabled": true,
      "transport": "http",
      "url": "https://example.com/mcp",
      "auth": "oauth",
      "lifecycle": "keep-alive"
    }
  }
}
```

Sero uses the deprecated SSE transport only as a fallback: when the Streamable HTTP endpoint answers `404` or `405`, or when an Agent Plugin sets `portableTransport: "sse"`. Any other HTTP error fails the connection. A server that connects over SSE shows **SSE, deprecated** on its row. Saved SSE servers keep working without a config change.

### Raw config editing

The MCP app also exposes a raw config editor for advanced edits. Validation errors are surfaced in-app before a broken config is accepted.

## Protocol versions

Sero supports MCP revision `2026-07-28` and the 2025 revisions. It picks the revision for each server when it connects:

1. Sero sends `server/discover`. A server that answers it with `2026-07-28` connects in the modern era, with no `initialize` handshake.
2. Any other answer selects the legacy era, and Sero connects with the 2025 `initialize` handshake.
3. On stdio, the probe runs in a separate short-lived process, so the server process that Sero keeps never receives `server/discover`.

An HTTP `401` or `403`, a `5xx` or a timeout never selects the legacy era. Sero reports it as a failure instead.

After a server answers only the 2025 handshake, Sero saves a legacy verdict for that server and config hash in `era-verdicts.json`. The next connect skips the probe. **Reconnect** in the MCP app and any change to the server config drop the verdict, so the next connect probes again.

In the modern era every request carries the protocol version, client identity and client capabilities in its `_meta` envelope, and HTTP requests carry the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers. Sero declares an extension (MCP Apps, Tasks or Skills) only when its host support is on, and it never declares the deprecated sampling or roots features.

### Protocol details on the server view

The **Protocol** card on each server shows:

- the negotiated revision, and whether the server uses the legacy handshake
- the extensions that the server declares
- the transport, with a notice when it is the deprecated SSE transport
- the metadata cache state
- the failed step when a connection fails: discovery, legacy handshake, sign-in or extension setup

## Server input requests

A server can ask the user for input during a tool call or a resource read. Legacy servers send `elicitation/create`; `2026-07-28` servers return `input_required`, and Sero sends the call again with the answers and the unchanged `requestState`, for up to 10 rounds. Both go through one handler:

- A form request becomes a User Feedback questionnaire with one question for each field. The source line names the server label and the tool. The first question has a **Decline** option. Server text is shown as plain text.
- Sero checks each answer against the field schema and asks once more after a bad value. A form with a field type that Sero does not support is declined without being shown.
- A URL request becomes one chat question with the full URL, **Decline** and **Open page**. Only `http` and `https` URLs are offered.
- **Decline** sends `decline`, **Cancel** sends `cancel`, and an aborted tool call cancels the open question.
- With no question UI (a headless session or the plain Pi CLI), Sero declines at once.

The `mcp` tool sets `cli.interactive`, so the CLI bridge applies no timeout while the user answers. Tool calls and resource reads run outside the runtime queue, so a waiting question does not block other MCP actions.

## UI behavior

### Resources

- standard resources open as inline previews when possible
- text, JSON, HTML, and image content render directly in the MCP viewer pane
- binary/unsupported content falls back to summarized preview states

### Interactive MCP UIs

When a resource URI starts with `ui://`, or when a discovered tool advertises `_meta.ui.resourceUri`, the plugin launches an **interactive loopback viewer session** inside the dedicated viewer pane.

That viewer host:

- runs entirely inside Sero
- uses ephemeral localhost session URLs
- speaks AppBridge-style JSON-RPC to the embedded MCP UI
- keeps viewer session identifiers and URLs out of persisted app state

### Tool runner

The server detail view includes a basic MCP tool runner that can:

- list cached tools
- inspect tool descriptions and schemas
- submit structured JSON arguments
- render results
- open advertised MCP tool UIs when available

## CLI

The built-in CLI bridge currently supports:

```bash
sero mcp status
sero mcp list
sero mcp search <query>
sero mcp tools <server>
sero mcp resources <server>
sero mcp read <server> <resourceUri>
sero mcp describe <server> <tool>
sero mcp call <server> <tool> [jsonArgs]
sero mcp connect <server>
sero mcp reconnect <server>
sero mcp enable <server>
sero mcp disable <server>
```

Examples:

```bash
sero mcp search github
sero mcp tools github
sero mcp resources github
sero mcp read github file://README.md
sero mcp describe github search_docs
sero mcp call github search_docs '{"query":"oauth"}'
```

## OAuth behavior

OAuth-backed HTTP MCP servers authenticate entirely inside Sero.

Current behavior:

- auth is started from the MCP app
- provider sign-in opens in the dedicated auth/viewer pane
- loopback callback URLs are intercepted in-app and completed without leaving Sero
- tokens, client info, and flow state are stored under the active Sero agent profile
- if a live tool call or resource read becomes unauthorized, the runtime:
  - closes the stale connection
  - marks the server as `needs-auth`
  - guides the user back to the in-app auth flow

### Issuer checks

Sero follows the `2026-07-28` authorization rules through the v2 SDK:

- The callback `state` is checked first. Then the full callback query goes to the SDK, which compares `iss` with the issuer of the authorization server metadata before it exchanges the code. A different `iss`, or a missing `iss` when the server declares `authorization_response_iss_parameter_supported`, stops the sign-in before any token request. Sero then shows a fixed message and never the callback's `error_description` or other text.
- Tokens and client information are stored as the SDK gives them, with the SDK's `issuer` stamp, and the discovery state is stored in `discovery.json`. Tokens saved before the upgrade have no stamp; they keep working and get one on the next sign-in.
- When the server's resource metadata starts to name another authorization server, the SDK does not send the stored tokens or client credentials there. The server becomes `needs-auth`, and the user signs in again.
- The SDK refuses to send credentials to a token endpoint that uses neither TLS nor a loopback host.
- For `403 insufficient_scope`, Sero keeps the SDK default (`onInsufficientScope: 'reauthorize'`): one authorization request for the wider scope, then one retry.

### Client registration

A client ID in the server's `oauth` config always wins. Otherwise Sero would use its Client ID Metadata Document URL (`CLIENT_METADATA_URL` in `oauth-provider.ts`) when the authorization server supports it; that URL is not published yet, so Sero uses Dynamic Client Registration. The registration is a native app with the loopback redirect `http://127.0.0.1:19876/mcp/oauth/callback`.

## Storage

### App config, state, and metadata cache

When `SERO_HOME` is available, MCP files live under:

```text
$SERO_HOME/apps/mcp/
  config.json
  state.json
  metadata-cache.json
  era-verdicts.json
```

### Metadata cache

`metadata-cache.json` (version 2) keeps the last known tool and resource list of each server, for offline display and for Agent Plugin CLI commands. Sero keeps one entry for each server, and an entry is used only when all of these match:

- the server name and the config hash of the server entry
- the principal: `anon` without auth, `bearer:<sha256 of the token>` for a bearer token, or `oauth:<random ID>` for an OAuth sign-in
- the cache scope: a `private` entry is never shown for another principal; a `public` entry is

Each entry also stores `expiresAt` from the server's `ttlMs`. A server that sends no TTL (a 2025 server) keeps its entry until it reports a change. A `2026-07-28` server without cache hints sends `ttlMs: 0`, so its entry is stale at once. Sero lists a connected server again when its entry has expired; while the TTL holds, the client answers from its response cache and sends no request. A `list_changed` notification lists the server again at once. The client response cache uses the same principal as its partition.

Sero removes an entry when the server is removed or its config changes, and removes a private entry on sign-out. A bearer token is never written to disk; only its hash is. A version 1 file is read as stale and rewritten as version 2.

### OAuth credentials

OAuth material lives under the active agent profile:

```text
$PI_CODING_AGENT_DIR/mcp-oauth/
```

Per-server auth data is split into files such as:

- `tokens.json`
- `client.json`
- `flow.json`
- `discovery.json`

### Persistence rules

The following stay **ephemeral** and are not persisted in app state:

- viewer session IDs
- viewer URLs
- auth callback URLs
- transient auth/viewer pane state

## Troubleshooting

### A server says it needs auth

Open the MCP app in Sero and authenticate the server there.

### A previously working OAuth server stopped working

Use one of:

- **Re-authenticate**
- **Clear saved auth**
- reconnect the server after auth completes

The runtime automatically drops expired live auth back to `needs-auth` when a call or resource read is rejected.

### Tools or resources do not appear

Connect or reconnect the server so metadata can be refreshed and cached.

### A resource preview or tool UI does not render

Use the embedded **Ask Sero to help** recovery actions from the MCP app. For interactive MCP UIs, closing the viewer pane session and reopening the resource/tool UI is also a useful first recovery step.

### I only want one MCP tool exposed to chat/CLI

That is the intended v1 design. The plugin exposes only `mcp` through the bridge. Config/auth/viewer actions stay behind `mcp_manager` inside the app.

## Validation

Recommended local validation commands:

```bash
pnpm --filter @sero-ai/plugin-mcp typecheck
pnpm --filter @sero-ai/plugin-mcp test
pnpm --filter @sero-ai/plugin-mcp build
pnpm --filter @sero/desktop exec vitest run electron/__tests__/features/plugins/plugin-cli-bridge.test.ts electron/__tests__/platform/window-security.test.ts electron/__tests__/platform/csp.test.ts
pnpm typecheck
```