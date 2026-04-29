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

### HTTP / SSE servers

Use HTTP mode for remote MCP servers that expose an HTTP/SSE endpoint.

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

### Raw config editing

The MCP app also exposes a raw config editor for advanced edits. Validation errors are surfaced in-app before a broken config is accepted.

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

## Storage

### App config, state, and metadata cache

When `SERO_HOME` is available, MCP files live under:

```text
$SERO_HOME/apps/mcp/
  config.json
  state.json
  metadata-cache.json
```

### OAuth credentials

OAuth material lives under the active agent profile:

```text
$PI_CODING_AGENT_DIR/mcp-oauth/
```

Per-server auth data is split into files such as:

- `tokens.json`
- `client.json`
- `flow.json`

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