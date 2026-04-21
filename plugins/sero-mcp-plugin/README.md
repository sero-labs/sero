# `@sero-ai/plugin-mcp`

Built-in first-party MCP control center for Sero.

This plugin adapts the `pi-mcp-adapter` backend ideas into a **Sero-native, UI-first** workflow:

- configure MCP servers from inside Sero
- authenticate OAuth-backed servers in-app
- inspect connection/auth/metadata state
- preview embedded MCP resources inside the plugin
- launch basic UI-capable MCP tool resources in the dedicated viewer pane
- use a single bridged `mcp` proxy tool from Sero chat or the CLI

## Current v1 surface

### UI

The MCP app currently supports:

- server CRUD
- enable / disable
- connect / reconnect
- raw config editing
- diagnostics
- embedded OAuth browser flows
- dedicated viewer/auth pane for resources, tool UIs, and OAuth flows
- resource preview
- basic UI-tool launching by opening the advertised UI resource
- basic MCP tool runner in the server detail view
- auth clearing / re-auth / cancel-auth controls

### Bridged tool

Exactly one bridged tool is exposed:

- `mcp`

The plugin also uses one UI-only management tool internally:

- `mcp_manager`

`mcp_manager` is **not** part of the agent-facing MCP proxy surface.

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
sero mcp read github file://README.md
sero mcp describe github search_docs
sero mcp call github search_docs '{"query":"oauth"}'
```

## OAuth behavior

OAuth-backed HTTP MCP servers authenticate entirely inside Sero.

Current behavior:

- start auth from the MCP app
- complete the provider redirect inside the dedicated embedded auth browser pane
- persist OAuth client info / tokens under the Sero agent profile
- if a live MCP call or resource read becomes unauthorized, the plugin:
  - closes the stale connection
  - marks the server as `needs-auth`
  - guides the user back to the MCP app auth flow

## Storage locations

### App config / state / cache

Stored under the Sero app home for the global `mcp` app.

### OAuth credentials

Stored under:

```text
$PI_CODING_AGENT_DIR/mcp-oauth/
```

This keeps auth material aligned with the active Sero agent profile.

## Notes on UI-capable MCP tools

Current v1 behavior is intentionally modest:

- the plugin discovers tools that advertise `_meta.ui.resourceUri`
- the server detail view can launch that advertised UI resource in the dedicated viewer pane
- the bridged `mcp` tool can describe and call those tools, but it does **not** yet host a full AppBridge-backed interactive MCP app session

That fuller MCP UI hosting slice is still in progress.

## Troubleshooting

### A server says it needs auth

Open the MCP app in Sero and authenticate the server there.

### A previously working OAuth server stopped working

Use one of:

- **Re-authenticate**
- **Clear saved auth**
- reconnect the server after auth completes

The runtime now automatically drops expired live auth back to `needs-auth` when a call or resource read is rejected.

### Tools/resources do not appear

Connect or reconnect the server so metadata can be refreshed and cached.

### A resource or tool UI does not render

Use the embedded **Ask Sero to help** recovery actions from the MCP app.

## Validation

Common local validation commands:

```bash
pnpm --filter @sero-ai/plugin-mcp typecheck
pnpm --filter @sero-ai/plugin-mcp test
pnpm --filter @sero-ai/plugin-mcp build
pnpm typecheck
```
