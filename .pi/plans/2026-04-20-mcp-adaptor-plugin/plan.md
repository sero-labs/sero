# Built-in MCP Plugin Implementation Plan

**Date:** 2026-04-20
**Status:** Draft
**Spec:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/spec.md`
**Scout:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/scout-context.md`
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Overview

This work should add a new built-in **MCP** plugin to the Sero monorepo by
adapting `pi-mcp-adapter` into a **Sero-native, UI-first control center**.

The implementation should preserve the adapter’s strongest backend value:

- lazy/eager/keep-alive MCP lifecycle management,
- metadata caching,
- stdio + HTTP/SSE transport support,
- OAuth/token handling,
- MCP UI/resource hosting,
- one small proxy tool instead of exploding the agent tool surface.

But it should deliberately **not** ship as a thin wrapper around the adapter’s
current TUI/popup workflows.

The recommended build is:

- **new built-in plugin package:** `plugins/sero-mcp-plugin/`
- **shape:** `extension + ui`
- **scope:** `global`
- **app id:** `mcp`
- **package name:** `@sero-ai/plugin-mcp`
- **icon:** `plug`
- **devPort:** `5196`
- **agent/CLI surface:** exactly **one bridged tool** named `mcp`
- **UI control surface:** separate **UI-only management tool** (not bridged)
- **background runtime:** **no `runtime/` in v1**

## Scope Guards / Non-Goals

These are explicit implementation guardrails for workers:

- **No direct per-server or per-tool exposure** in v1.
- **No import/migration from `~/.pi/agent`** config, cache, or tokens.
- **No port of the TUI `/mcp` panel** as a product surface.
- **No command-first primary workflow** — CLI remains secondary/basic.
- **No rich UI session-history explorer** in v1.
- **No separate plugin runtime** unless the chosen singleton extension model proves insufficient.
- **No new plugin-specific preload bridge** if app-state + `useAppTools()` + existing host seams are enough.

## Investigation Summary

### What already fits well in Sero

- Built-in plugins already follow the right package structure:
  - `plugins/sero-admin-plugin/`
  - `plugins/sero-git-plugin/`
  - `plugins/sero-web-plugin/`
- `@sero-ai/app-runtime` gives the MCP UI the two key seams it needs:
  - `useAppState()` for file-backed reactive app state
  - `useAppTools()` for UI -> extension tool actions
- Plugin CLI bridging is already manifest-driven (AD-020), so the MCP plugin can expose only one CLI-facing tool via `bridgeTools: ['mcp']`.
- Global apps already exist (`admin`, `cron`), and global state resolves through `SERO_HOME/apps/<id>/state.json`.
- There is a strong precedent for **module-level singleton extension logic** in `plugins/sero-cron-plugin/extension/index.ts` + `runtime.ts`, which is exactly what this MCP port needs.

### Important constraints discovered during investigation

1. **App sessions do not give tools a real TUI surface.**
   `createSeroUIContext()` provides `notify()`, but `custom()`, `select()`, and
   other TUI affordances are effectively no-ops. So the MCP plugin UI cannot
   depend on `ctx.ui.custom()` or the adapter’s TUI `/mcp` panel.

2. **Opening the plugin UI does not automatically start an app session.**
   `useAppState()` reads files directly; the plugin’s app session only exists
   after the UI calls `useAppTools()` / `useAI()`. So the MCP UI needs an
   explicit bootstrap action on mount.

3. **Production CSP currently blocks the adapter’s localhost UI-host model.**
   `apps/desktop/electron/platform/security/csp.ts` only allows general
   `http:` / `https:` frames in development. In production, `frame-src` and
   `connect-src` are too tight for a localhost-backed MCP viewer. Host changes
   are required.

4. **`webviewTag` is not enabled today.**
   If auth must remain fully in-plugin for OAuth providers that disallow iframe
   embedding, the host needs a dedicated embedded browser rail. The lowest-scope
   path is a whitelisted webview-based surface.

5. **The adapter’s biggest files must be split during conversion.**
   Hotspots:
   - `proxy-modes.ts` — 810 LOC
   - `mcp-panel.ts` — 740 LOC
   - `ui-server.ts` — 623 LOC
   - `host-html-template.ts` — 427 LOC
   - `types.ts` — 426 LOC
   - `npx-resolver.ts` — 419 LOC
   - `mcp-auth-flow.ts` — 400 LOC
   - `direct-tools.ts` — 400 LOC

6. **The adapter’s per-session state model is not the right fit for Sero.**
   If ported naively, the plugin UI, chat sessions, and CLI calls would all see
   different connection state. The cron plugin’s module-level singleton pattern
   is the right adaptation.

### Key repo references

- Manifest + plugin structure:
  - `docs/plugins/guide.md`
  - `docs/plugins/technical.md`
  - `docs/plugins/host-compatibility.md`
- Architectural constraints:
  - `docs/architecture.md`
  - `docs/decisions.md` (especially AD-020)
- Plugin references:
  - `plugins/sero-admin-plugin/package.json`
  - `plugins/sero-admin-plugin/ui/AdminApp.tsx`
  - `plugins/sero-git-plugin/extension/index.ts`
  - `plugins/sero-git-plugin/shared/types.ts`
  - `plugins/sero-git-plugin/vite.config.ts`
  - `plugins/sero-web-plugin/extension/index.ts`
  - `plugins/sero-web-plugin/extension/state-sync.ts`
  - `plugins/sero-cron-plugin/extension/index.ts`
  - `plugins/sero-cron-plugin/extension/runtime.ts`
- Host/browser references:
  - `apps/desktop/electron/platform/security/csp.ts`
  - `apps/desktop/electron/main.ts`
  - `apps/desktop/src/components/apps/explorer/editor/DevServerPreview.tsx`
  - `packages/ui/src/components/ai-elements/web-preview.tsx`

## Approaches Considered

### 1. Thin plugin wrapper around the adapter’s current extension and commands

Copy the adapter, change paths, keep `/mcp`, `/mcp-auth`, popup UI-hosting, and
ship a light dashboard around it.

**Pros**
- Lowest apparent code churn.
- Fastest path to partial parity.
- Reuses most adapter code directly.

**Cons**
- Violates the spec’s “native first-party app” requirement.
- Keeps command/TUI/popup workflows central.
- Leaves per-session state drift unresolved.
- Still depends on Pi-style UI affordances Sero app sessions do not provide.
- Does not solve production CSP / embedded auth/resource viewing cleanly.

**Decision:** reject.

### 2. Sero-native plugin with a module-level singleton extension runtime and a redesigned UI (**recommended**)

Port the adapter’s backend primitives into a plugin-local singleton runtime,
then build a dedicated Sero UI for setup, management, auth, diagnostics, and
resource viewing.

**Pros**
- Matches the spec closely.
- Avoids a separate `runtime/` package while still sharing live state across
  UI, agent, and CLI entry points.
- Keeps the agent surface intentionally small.
- Lets the UI use Sero-native forms, dashboards, and recovery patterns.
- Reuses the adapter where it is strongest, but only where it fits.

**Cons**
- Requires host support for embedded browser/auth viewing.
- Requires deliberate state snapshot design instead of straight code copying.
- Needs more careful refactoring to stay under 500 LOC per file.

**Decision:** use this.

### 3. Elevate MCP into a desktop-host subsystem outside the plugin

Move lifecycle, auth, viewer hosting, and storage into `apps/desktop/electron/`
first, then let the plugin UI sit on top of host APIs.

**Pros**
- Strongest centralization.
- Could eventually support non-plugin MCP use cases.

**Cons**
- Too invasive for the current scope.
- Breaks the plugin ownership model.
- Encourages new host-specific IPC/preload seams the repo is trying to avoid.
- Harder to extract or evolve later.

**Decision:** defer. Keep MCP product logic plugin-owned unless a generic host
seam is truly required.

## Recommended Approach

## Key Decisions

- **Plugin ID / package:** `mcp` / `@sero-ai/plugin-mcp`
- **Manifest:** built-in plugin with `scope: 'global'`, `bridgeTools: ['mcp']`,
  and `requiredHostCapabilities: ['appAgent.invokeTool', 'tool.cli']`
- **No plugin `runtime/` in v1** — use a **module-level singleton extension runtime** instead.
- **Two extension tools only:**
  - `mcp` — bridged, user/agent-facing proxy tool
  - `mcp_manager` — UI-only management tool, intentionally not bridged
- **No direct-tool registration or direct-tool toggles** in v1.
- **No `/mcp-auth`-style primary auth flow.** Auth is launched from the plugin UI.
- **Canonical config lives under `SERO_HOME/apps/mcp/`**, not under legacy `~/.pi` paths.
- **OAuth tokens live under `PI_CODING_AGENT_DIR/mcp-oauth/`** so profile isolation stays aligned with Pi agent resources.
- **Sensitive auth URLs / viewer tokens stay ephemeral in UI local state**, not persisted in `state.json`.
- **Embedded MCP resources use a localhost viewer iframe; external OAuth uses an in-plugin embedded browser surface** rather than the system browser.
- **Agent proxy search is MCP-only.** Do not include plugin-internal Pi tools in search results.

## Architecture

### 1. Package + manifest shape

Create a new built-in plugin package:

```text
plugins/sero-mcp-plugin/
├── package.json
├── vite.config.ts
├── README.md
├── shared/
│   └── types.ts
├── extension/
│   ├── index.ts
│   ├── runtime/
│   │   └── mcp-runtime.ts
│   ├── config/
│   ├── auth/
│   ├── state/
│   ├── manager/
│   ├── viewer/
│   └── tools/
└── ui/
    ├── McpApp.tsx
    ├── index.html
    ├── styles.css
    ├── hooks/
    └── components/
```

Recommended manifest shape:

```json
{
  "name": "@sero-ai/plugin-mcp",
  "pi": { "extensions": ["./extension/index.ts"] },
  "sero": {
    "app": {
      "id": "mcp",
      "name": "MCP",
      "icon": "plug",
      "scope": "global",
      "stateFile": ".sero/apps/mcp/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "McpApp",
      "devPort": 5196
    },
    "plugin": {
      "category": "developer-tools",
      "tags": ["mcp", "servers", "oauth", "resources"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli"],
      "bridgeTools": ["mcp"],
      "preBuilt": false
    }
  }
}
```

### 2. Storage contract

Use three distinct storage layers.

#### A. Global app state snapshot

For the UI’s reactive read model:

```text
$SERO_HOME/apps/mcp/state.json
```

This is the file watched by `useAppState()` and should contain:

- first-run / wizard state
- normalized server list + friendly status
- derived auth status
- resource/UI capability summaries
- lightweight diagnostics summaries
- last refresh timestamps

It should **not** contain:

- OAuth access tokens / refresh tokens
- pending auth URLs
- temporary viewer session URLs or tokens
- large raw tool schemas if they are only needed on demand

#### B. Canonical editable config

For forms + raw JSON editing:

```text
$SERO_HOME/apps/mcp/config.json
```

Recommended root shape:

```ts
export interface McpConfigDocument {
  settings?: {
    idleTimeout?: number;
    toolPrefix?: 'server' | 'short' | 'none';
  };
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth?: 'oauth' | 'bearer' | false;
  bearerToken?: string;
  bearerTokenEnv?: string;
  oauth?: {
    grantType?: 'authorization_code' | 'client_credentials';
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  } | false;
  lifecycle?: 'lazy' | 'eager' | 'keep-alive';
  idleTimeout?: number;
  exposeResources?: boolean;
  excludeTools?: string[];
  debug?: boolean;
}
```

Notes:
- keep the adapter-friendly `mcpServers` shape so the backend port is simple,
  but add `enabled?: boolean` for first-class enable/disable.
- do **not** carry `imports`, `directTools`, or `disableProxyTool` into the
  UI product model for v1.
- raw config editing should preserve unknown fields instead of destructively
  rewriting them away.

#### C. Cache + auth storage

- metadata cache:
  ```text
  $SERO_HOME/apps/mcp/metadata-cache.json
  ```
- OAuth/token storage:
  ```text
  $PI_CODING_AGENT_DIR/mcp-oauth/<server>/tokens.json
  ```

Fallback rules for Pi CLI mode:
- use `process.env.SERO_HOME` / `process.env.PI_CODING_AGENT_DIR` when present,
- otherwise fall back to the adapter’s Pi-compatible defaults.

### 3. Module-level singleton extension runtime

Use the cron plugin’s pattern instead of the adapter’s per-session state.

Recommended shape:

```ts
const runtime = createOrGetMcpRuntime();

export default function mcpExtension(pi: ExtensionAPI) {
  runtime.attachPi(pi);

  pi.on('session_start', async (_event, ctx) => {
    await runtime.handleSessionStart({ cwd: ctx.cwd, ui: ctx.hasUI ? ctx.ui : undefined });
  });

  pi.on('session_shutdown', async () => {
    await runtime.handleSessionShutdown();
  });

  registerMcpProxyTool(pi, runtime);
  registerMcpManagerTool(pi, runtime);
}
```

`McpRuntime` should own:

- config document load/save/reconcile
- singleton `McpServerManager`
- singleton lifecycle / health checks / idle shutdown
- metadata cache read/write
- auth storage + OAuth orchestration
- derived state snapshot writing
- resource/UI launch controller
- refcounted session attach/detach so health checks only run once per process

This gives all of the following one shared truth source:

- the MCP plugin UI app session,
- normal chat sessions using `sero-cli mcp ...`,
- the agent-facing `mcp` proxy tool.

### 4. Shared state / snapshot contract

The plugin UI should consume a normalized, UI-friendly state shape from
`shared/types.ts`.

Recommended direction:

```ts
export type McpConnectionStatus =
  | 'disabled'
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'needs-auth'
  | 'error';

export type McpAuthStatus =
  | 'not-required'
  | 'not-authenticated'
  | 'authenticating'
  | 'authenticated'
  | 'expired'
  | 'error';

export interface McpServerSnapshot {
  serverName: string;
  enabled: boolean;
  transport: 'stdio' | 'http';
  lifecycle: 'lazy' | 'eager' | 'keep-alive';
  connectionStatus: McpConnectionStatus;
  authStatus: McpAuthStatus;
  toolCount: number;
  resourceCount: number;
  uiToolCount: number;
  lastError?: string;
  lastConnectedAt?: string;
  lastFailedAt?: string;
  resources: Array<{ uri: string; name: string; description?: string }>;
  uiTools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}

export interface McpAppState {
  initialized: boolean;
  firstRun: boolean;
  configPath: string;
  rawConfigUpdatedAt: string | null;
  servers: McpServerSnapshot[];
  settings: {
    idleTimeout: number;
    toolPrefix: 'server' | 'short' | 'none';
  };
  lastRefreshedAt: string | null;
  summary: {
    totalServers: number;
    enabledServers: number;
    connectedServers: number;
    needsAuthServers: number;
    errorServers: number;
  };
}
```

Important rule:
- **on-demand technical details** should come from `mcp_manager` actions such as
  `diagnostics`, not by bloating the main state file with everything.

### 5. Tool and CLI surface

#### A. `mcp` — the only bridged tool

Keep the one small proxy tool as the agent-facing surface.

Responsibilities:
- status
- list/search MCP tools/resources
- describe MCP tools
- call MCP tools through the proxy
- connect / reconnect when explicitly requested

Prune the adapter’s agent surface:
- no direct-tool registration
- no `/mcp-auth` dependency in normal messages
- no auto-auth path
- no search over all Pi tools (MCP-only search)

#### B. `mcp_manager` — UI-only management tool

Use `useAppTools()` from the plugin UI to call a second tool with an action enum.

Recommended actions:

```ts
'bootstrap'
| 'refresh'
| 'upsert_server'
| 'remove_server'
| 'enable_server'
| 'disable_server'
| 'connect_server'
| 'reconnect_server'
| 'start_auth'
| 'cancel_auth'
| 'clear_auth'
| 'save_raw_config'
| 'get_raw_config'
| 'get_diagnostics'
| 'open_resource'
| 'open_tool_ui'
| 'close_viewer'
```

This tool is **not bridged** and should not appear in MCP search results.

#### C. Custom CLI on `mcp`

Implement basic Sero CLI management through `tool.cli.execute` on the `mcp` tool.

Recommended CLI commands:

```text
sero mcp status
sero mcp list
sero mcp connect <server>
sero mcp reconnect [server]
sero mcp enable <server>
sero mcp disable <server>
```

Auth stays UI-first. CLI should report when a server requires UI-based auth:

> `Server "github" requires in-app authentication. Open the MCP app in Sero and authenticate there.`

### 6. Embedded viewer + auth rail

This is the main cross-package integration point.

#### MCP UI/resources

Use the adapter’s local viewer-host pattern, but make it **UI-driven** instead of
agent-pop-up-driven:

- derive `resources` from `listResources`
- derive `uiTools` from tool metadata `_meta.ui.resourceUri`
- when the user clicks **Open** or **Launch UI** in the plugin UI, call
  `mcp_manager.open_resource` / `mcp_manager.open_tool_ui`
- the management tool returns an **ephemeral** `{ viewerUrl, sessionId }`
- the plugin UI renders that URL in a sandboxed iframe / web preview pane

This keeps the core flow in-plugin and avoids persisting sensitive session URLs.

#### OAuth auth surface

Because many providers disallow iframe embedding, auth should use a **dedicated
embedded browser surface** inside the plugin, not a normal iframe.

**Concrete plan assumption:** enable Electron `webviewTag` and use a tightly
whitelisted plugin-local auth browser component.

Why this is the recommended path:
- lower scope than a new host-managed BrowserView subsystem,
- keeps auth inside the plugin UI,
- avoids the spec’s forbidden external browser requirement.

Required host changes:
- enable `webviewTag: true` in `apps/desktop/electron/main.ts`
- add a production CSP allowlist for **loopback viewer URLs** (`127.0.0.1` / `localhost`) without reopening arbitrary `http:` / `https:` frames globally
- if the auth surface itself needs top-level external navigation, enforce a
  plugin-owned URL allowlist and explicit event handling in the webview component

Important design rule:
- **viewer iframe for local loopback UI sessions**
- **embedded browser surface for external OAuth**
- **no `shell.openExternal()` as the primary happy path**

### 7. UI composition

The Sero UI should be a hybrid **overview + drill-down** workbench.

Recommended layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Header: MCP · summary badges · Add server · Raw config    │
├───────────────┬──────────────────────────┬─────────────────┤
│ Server rail   │ Main detail workbench    │ Viewer / auth   │
│ - all servers │ - overview cards         │ pane            │
│ - status      │ - selected server        │ - resource UI   │
│ - add/edit    │ - config/auth/actions    │ - auth browser  │
│               │ - resources / UIs        │ - fallback help │
│               │ - diagnostics            │                 │
└───────────────┴──────────────────────────┴─────────────────┘
```

Recommended sub-surfaces:

- **First-run wizard** when there are no servers:
  - explain MCP briefly
  - choose `stdio` or `HTTP/SSE`
  - provide examples/help text
  - jump to a blank server form
- **Overview dashboard** when servers exist:
  - totals, auth-needed, connected, errors
  - setup guidance for the next most useful action
- **Server detail** for one selected server:
  - Overview
  - Settings
  - Resources / UIs
  - Diagnostics
- **Raw config editor** as an advanced side sheet/dialog
- **Ask Sero to help** button on error surfaces using `useAgentPrompt()`

UI state rules:
- use `useAppState()` only for the shared app snapshot
- keep selected tabs, current draft modals, and current viewer/auth URL in
  local React state
- do not use `localStorage`

### 8. Data flow

#### Bootstrap

```text
Open MCP app
  -> UI mount calls mcp_manager({ action: 'bootstrap' })
  -> singleton runtime initializes config/cache/auth/lifecycle
  -> runtime writes state snapshot to state.json
  -> useAppState() re-renders UI
```

#### Add / edit / enable / disable server

```text
UI form -> mcp_manager upsert/enable/disable
  -> config.json write
  -> runtime reconcile target server
  -> metadata/cache/status refresh
  -> state snapshot write
  -> UI re-renders from useAppState()
```

#### Connect / reconnect / auth

```text
UI click Connect
  -> mcp_manager connect/reconnect
  -> singleton server manager connects
  -> if needs auth, state authStatus becomes needs-auth
  -> UI click Authenticate
  -> mcp_manager start_auth returns { authUrl, authSessionId }
  -> UI opens embedded auth browser
  -> callback server completes auth
  -> runtime updates auth storage + state snapshot
  -> UI closes auth pane and shows authenticated state
```

#### Open resource / launch tool UI

```text
UI click Open resource / Launch UI
  -> mcp_manager open_resource / open_tool_ui
  -> runtime reads resource or executes tool
  -> runtime starts localhost UI host
  -> tool returns ephemeral { viewerUrl, sessionId }
  -> UI renders viewerUrl in right pane
```

#### Agent / CLI usage

```text
Agent or CLI -> mcp proxy tool / custom CLI
  -> singleton runtime resolves metadata + lazy connection
  -> MCP call executes through shared manager
  -> result returns without creating popup UI side effects
```

## Parallelizable Workstreams

The user explicitly asked for maximum safe parallelism. This feature supports
parallel work, but only after a small contract/scaffolding slice lands first.

### Workstream map

| Workstream | Scope | Primary todos | Can run in parallel with | Hard blockers |
|---|---|---|---|---|
| **WS-A** | Contract + scaffolding | MCP-01, MCP-02 | none | foundation for all other slices |
| **WS-B** | Extension runtime core | MCP-03, MCP-04, MCP-05 | WS-C, WS-D (after MCP-01/02) | needs shared types + storage contract |
| **WS-C** | Desktop host viewer/auth rail | MCP-06 | WS-B, WS-D (after MCP-01) | needs manifest/app-id decision; integration waits on runtime URLs |
| **WS-D** | UI product surface | MCP-07, MCP-08, MCP-09 | WS-B, WS-C (after MCP-01/02) | MCP-08 depends on management-tool contract; MCP-09 depends on host rail |
| **WS-E** | Validation + docs | MCP-10, MCP-11, MCP-12 | partial parallel after feature slices land | final pass waits on WS-B/C/D |

### Hard sequencing edges

1. **MCP-01 and MCP-02 must land first.**
   Shared manifest/tool/state/path decisions are the contract for every other slice.

2. **MCP-04 is the main integration choke point.**
   UI work and host viewer work both depend on the snapshot + management-action contract.

3. **MCP-06 must land before MCP-09 can be considered done.**
   The viewer/auth UI cannot be finalized until production CSP and embedded browser support exist.

4. **MCP-10 / MCP-11 / MCP-12 finish last.**
   They can start as slices land, but the repo-wide acceptance pass belongs at the end.

### Validation checkpoints between workstreams

- **Checkpoint A:** plugin is discoverable and mounts a placeholder UI.
- **Checkpoint B:** opening the MCP app triggers bootstrap and writes a real state snapshot.
- **Checkpoint C:** add a stdio server, connect it, and see resource metadata in UI.
- **Checkpoint D:** `sero mcp status` and `sero mcp reconnect <server>` work.
- **Checkpoint E:** open an embedded MCP resource inside the plugin.
- **Checkpoint F:** complete an OAuth flow without leaving Sero.
- **Checkpoint G:** `pnpm typecheck` passes and all touched files remain under 500 LOC.

## Sequencing

### Phase 1 — Foundation contract

- create plugin package
- land manifest, dependencies, Vite config, shared types
- define storage paths and config/state split

### Phase 2 — Extension singleton runtime

- port config loading, metadata cache, auth storage, lifecycle, and server manager
- introduce the snapshot writer and UI-only management service
- prune direct-tool and TUI-first behavior

### Phase 3 — Bridged proxy + CLI

- land `mcp` proxy tool
- add custom CLI for status/control actions
- ensure only `mcp` is bridged

### Phase 4 — Host viewer/auth rail

- add production CSP loopback allowances
- enable embedded auth browser support
- add plugin-local viewer/auth components

### Phase 5 — UI product surface

- wizard + dashboard
- server CRUD/detail screens
- raw config and diagnostics
- viewer/auth pane integration

### Phase 6 — Tests, docs, final validation

- extension/host tests
- UI/integration tests
- plugin README
- root `pnpm typecheck`

## File-Size / Refactor Notes

The port must be organized to keep files below the monorepo’s 500 LOC rule.

### Adapter files that must be split during conversion

| Original file | Problem | Recommended split |
|---|---|---|
| `proxy-modes.ts` | too large + mixed responsibilities | `tools/proxy-status.ts`, `tools/proxy-search.ts`, `tools/proxy-call.ts`, `tools/proxy-format.ts` |
| `mcp-panel.ts` | TUI-only and oversized | do not port as-is; redesign into UI components |
| `ui-server.ts` | too large | `viewer/http-server.ts`, `viewer/sse.ts`, `viewer/session-events.ts`, `viewer/request-handlers.ts` |
| `host-html-template.ts` | too large | `viewer/host-template.ts`, `viewer/csp.ts`, `viewer/html-shell.ts` |
| `types.ts` | too broad | split into `shared/types.ts`, `extension/config/types.ts`, `extension/viewer/types.ts`, `extension/auth/types.ts` |
| `mcp-auth-flow.ts` | too broad | `auth/flow.ts`, `auth/browser.ts`, `auth/callback.ts` |
| `direct-tools.ts` | out of scope | do not port direct-tool registration logic in v1 |
| `npx-resolver.ts` | large utility | keep isolated under `extension/manager/npx-resolver.ts` |

### UI split guidance

Do not let `ui/McpApp.tsx` become the admin panel equivalent of a god file.
Split immediately into:

- shell/layout
- wizard
- server rail
- server detail
- diagnostics
- resource viewer/auth pane

## Risks & Premortem

### Riskiest assumptions

| Assumption | If wrong |
|---|---|
| A module-level singleton extension runtime is shared across app sessions and normal chat sessions reliably enough | Status/connection state would drift again, and we would need a deeper host-owned runtime or explicit cross-session bus |
| A whitelisted embedded browser surface is sufficient for OAuth providers that block iframe embedding | We would need a more invasive host-managed BrowserView/Browsing pane implementation |
| Production CSP can be widened narrowly enough for loopback viewer URLs without reopening general external framing | Embedded MCP UI/resources would fail in packaged builds |
| The adapter’s backend logic can be reused after pruning TUI/direct-tool behavior without hidden coupling | Porting effort grows because more modules need redesign than expected |
| MCP tool UI launch flows can be represented cleanly from server detail views | We might need a second-stage launch dialog or stricter v1 support limits for parameter-heavy UI tools |

### Realistic failure modes

- **Built the wrong thing** — workers port `/mcp` and `/mcp-auth` as primary UX instead of the Sero UI.
- **State drift across sessions** — app UI and agent CLI do not agree on connection/auth status.
- **Packaged-build breakage** — localhost viewer works in dev but fails in production because CSP/webview allowances were incomplete.
- **Auth regression** — some OAuth providers still force the system browser, violating the in-plugin requirement.
- **File-size regression** — adapter code is copied into a few oversized files and immediately breaks repo standards.
- **Leaked sensitive data** — auth URLs, viewer tokens, or token JSON accidentally get written into `state.json`.

### Accepted mitigations

- Use the cron-style singleton extension pattern from the start.
- Treat viewer/auth host work as a first-class slice, not an afterthought.
- Keep ephemeral auth/viewer URLs in local UI state or tool-returned details only.
- Make the `mcp_manager` action contract explicit before UI work fans out.
- Prune direct-tools, imports, and TUI panel code early so workers do not port dead scope.

## Dependencies

### Plugin dependencies to add

Based on `pi-mcp-adapter/package.json`, the plugin will likely need:

- `@modelcontextprotocol/sdk`
- `@modelcontextprotocol/ext-apps`
- `@sinclair/typebox`
- `open` (fallback only; not primary UX)
- `zod` peer compatibility if required by the SDK/AppBridge path

### Existing platform dependencies / references

- `@sero-ai/app-runtime`
- `@sero-ai/common`
- `@sero-ai/ui`
- Electron main-process host seams already in the repo

## Testing Strategy

### Automated

#### Extension / runtime

- config path + storage tests
- singleton runtime + refcount behavior
- metadata cache read/write tests
- enable/disable/connect/reconnect lifecycle tests
- auth storage + auth-state transition tests
- proxy search/describe/call tests (MCP-only search)
- CLI bridge tests for `sero mcp ...`

#### Host / security

- production CSP allowlist test for loopback viewer URLs
- main-window preference test for embedded auth browser support
- if a reusable auth-browser component is extracted, add navigation/allowlist tests

#### UI

- bootstrap-on-mount test
- first-run wizard flow
- forms-first add/edit flow
- raw config save/validation error flow
- friendly error card + technical details + Ask Sero action
- resource viewer launch flow
- auth pane lifecycle flow

### Manual smoke checks

1. Open MCP app on a clean profile -> wizard appears.
2. Add a stdio server -> connect -> status/resource counts populate.
3. Add an HTTP/SSE server requiring OAuth -> authenticate entirely in-plugin.
4. Open an MCP resource/UI inside the plugin.
5. Force a broken server URL -> friendly recovery copy + details + Ask Sero button.
6. Run `sero mcp status` and `sero mcp reconnect <server>`.
7. Ask the agent to use the `mcp` tool after setup.
8. Run root `pnpm typecheck`.

## Implementation Todos

> The structured todo tool / write-todos skill is not available in this planner session, so the worker backlog is embedded here as executable markdown todos.
>
> **Global rule for every todo:** keep the agent-facing surface to exactly one bridged tool (`mcp`), keep auth/viewer URLs out of persisted state, and keep every touched source file under 500 LOC.

### MCP-01 — Scaffold the built-in plugin package and shared manifest contract
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-A
- **Depends on:** none
- **Files:**
  - new `plugins/sero-mcp-plugin/package.json`
  - new `plugins/sero-mcp-plugin/vite.config.ts`
  - new `plugins/sero-mcp-plugin/ui/index.html`
  - new `plugins/sero-mcp-plugin/ui/styles.css`
  - new `plugins/sero-mcp-plugin/ui/tsconfig.json`
  - new `plugins/sero-mcp-plugin/extension/tsconfig.json`
  - new `plugins/sero-mcp-plugin/shared/types.ts`
- **Reference code:**
  - manifest/package pattern: `plugins/sero-git-plugin/package.json`
  - global-scope manifest example: `plugins/sero-admin-plugin/package.json`
  - Vite MF config: `plugins/sero-git-plugin/vite.config.ts`
  - conversion constraints: `packages/templates/skills/sero-plugin/references/conversion-guide.md`
- **Expected shape:**
  ```json
  {
    "name": "@sero-ai/plugin-mcp",
    "pi": { "extensions": ["./extension/index.ts"] },
    "sero": {
      "app": {
        "id": "mcp",
        "name": "MCP",
        "icon": "plug",
        "scope": "global",
        "stateFile": ".sero/apps/mcp/state.json",
        "ui": "./dist/ui/remoteEntry.js",
        "component": "McpApp",
        "devPort": 5196
      },
      "plugin": {
        "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli"],
        "bridgeTools": ["mcp"]
      }
    }
  }
  ```
- **Constraints:**
  - use `@sero-ai/plugin-mcp`, `mcp`, `plug`, and `5196`
  - plugin is `scope: 'global'`
  - expose exactly one bridged tool via `bridgeTools: ['mcp']`
  - do **not** add `runtime/` or `requiredHostCapabilities: ['appRuntime.background']`
- **Do NOT:**
  - **Anti-pattern: Thin Wrapper Manifest** — do not keep adapter naming such as `pi-mcp-adapter` in the Sero package surface.
  - **Anti-pattern: Bridge Everything** — do not omit `bridgeTools` and accidentally expose internal management tools.
- **Acceptance:** establishes ISC-1, ISC-13, ISC-14, ISC-28 and the foundation for all later slices.

### MCP-02 — Build path, config, cache, and auth-storage helpers with Sero-aware locations
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-A
- **Depends on:** MCP-01
- **Files:**
  - new `plugins/sero-mcp-plugin/extension/state/paths.ts`
  - new `plugins/sero-mcp-plugin/extension/state/state-io.ts`
  - new `plugins/sero-mcp-plugin/extension/config/io.ts`
  - new `plugins/sero-mcp-plugin/extension/config/types.ts`
  - new `plugins/sero-mcp-plugin/extension/auth/storage.ts`
  - new `plugins/sero-mcp-plugin/extension/cache/metadata-cache.ts`
- **Reference code:**
  - global state path pattern: `plugins/sero-cron-plugin/extension/state-io.ts`
  - agent-dir resolution: `plugins/sero-memory-plugin/extension/agent-dir.ts`
  - app-specific config paths: `plugins/sero-web-plugin/extension/paths.ts`
  - adapter storage references: `/Users/danielcarter/Documents/Dev/ai/pi-mcp-adapter/config.ts`, `mcp-auth.ts`, `metadata-cache.ts`
- **Expected shape:**
  ```ts
  export function getMcpStatePath(cwd?: string): string;
  export function getMcpConfigPath(): string;
  export function getMcpMetadataCachePath(): string;
  export function getMcpOAuthDir(): string;
  ```
- **Constraints:**
  - canonical config/state/cache live under `$SERO_HOME/apps/mcp/`
  - OAuth tokens live under `$PI_CODING_AGENT_DIR/mcp-oauth/`
  - keep Pi CLI fallback behavior only when env vars are absent
  - use atomic writes for config, cache, and state
  - preserve unknown raw-config keys when round-tripping advanced edits
- **Do NOT:**
  - **Anti-pattern: Legacy Path Lock-In** — do not hardcode `~/.pi/agent/...` as the primary path.
  - **Anti-pattern: One Big State File** — do not merge config, auth secrets, and derived UI state into a single persisted blob.
- **Acceptance:** covers ISC-13, ISC-17, ISC-22, ISC-28, ISC-A-2.

### MCP-03 — Port the adapter core into a module-level singleton MCP runtime
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-B
- **Depends on:** MCP-01, MCP-02
- **Files:**
  - new `plugins/sero-mcp-plugin/extension/runtime/mcp-runtime.ts`
  - new `plugins/sero-mcp-plugin/extension/runtime/session-hooks.ts`
  - new `plugins/sero-mcp-plugin/extension/manager/server-manager.ts`
  - new `plugins/sero-mcp-plugin/extension/manager/lifecycle.ts`
  - new `plugins/sero-mcp-plugin/extension/manager/tool-metadata.ts`
  - new `plugins/sero-mcp-plugin/extension/manager/npx-resolver.ts`
  - `plugins/sero-mcp-plugin/extension/index.ts`
- **Reference code:**
  - singleton extension pattern: `plugins/sero-cron-plugin/extension/index.ts`
  - runtime/refcount structure: `plugins/sero-cron-plugin/extension/runtime.ts`
  - adapter lifecycle core: `/Users/danielcarter/Documents/Dev/ai/pi-mcp-adapter/init.ts`, `lifecycle.ts`, `server-manager.ts`
- **Expected shape:**
  ```ts
  const runtime = createOrGetMcpRuntime();

  export default function mcpExtension(pi: ExtensionAPI) {
    runtime.attachPi(pi);
    pi.on('session_start', async (_event, ctx) => runtime.handleSessionStart(ctx));
    pi.on('session_shutdown', async () => runtime.handleSessionShutdown());
  }
  ```
- **Constraints:**
  - one process-wide MCP runtime shared across app sessions and chat sessions
  - no `runtime/` plugin package — this stays inside the extension layer
  - port stdio + HTTP/SSE lifecycle behavior, but prune direct-tools and TUI-only concerns
  - split the ported logic immediately; do not recreate `proxy-modes.ts` / `ui-server.ts`-style mega files
- **Do NOT:**
  - **Anti-pattern: Per-Session MCP State** — do not instantiate a fresh server manager per session the way the raw adapter does today.
  - **Anti-pattern: Dead-Scope Porting** — do not copy `mcp-panel.ts` or direct-tool registration logic into v1.
- **Acceptance:** establishes ISC-11, ISC-12, ISC-18, ISC-19, ISC-27 while preserving the no-runtime decision.

### MCP-04 — Add snapshot writing and the shared management service contract
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-B
- **Depends on:** MCP-02, MCP-03
- **Files:**
  - new `plugins/sero-mcp-plugin/extension/state/snapshot.ts`
  - new `plugins/sero-mcp-plugin/extension/service/management.ts`
  - update `plugins/sero-mcp-plugin/shared/types.ts`
  - update `plugins/sero-mcp-plugin/extension/state/state-io.ts`
- **Reference code:**
  - UI-facing snapshot sync: `plugins/sero-web-plugin/extension/state-sync.ts`
  - file-backed shared state contract: `plugins/sero-git-plugin/shared/types.ts`
- **Expected shape:**
  ```ts
  export interface McpAppState {
    initialized: boolean;
    firstRun: boolean;
    servers: McpServerSnapshot[];
    summary: { totalServers: number; connectedServers: number; needsAuthServers: number; errorServers: number };
    lastRefreshedAt: string | null;
  }

  export interface McpManagerActionResult {
    snapshotWritten: boolean;
    viewerUrl?: string;
    authUrl?: string;
  }
  ```
- **Constraints:**
  - persisted state must stay UI-friendly and secret-free
  - auth URLs, viewer URLs, and session tokens are **ephemeral return values**, not persisted state
  - add a `bootstrap` management action so the UI can initialize the app session on mount
  - expose diagnostics on demand via the management service instead of stuffing everything into `state.json`
- **Do NOT:**
  - **Anti-pattern: Persisted Secret Drift** — do not write OAuth URLs, tokens, or local viewer session tokens into `state.json`.
  - **Anti-pattern: UI Reads Config Directly** — do not make the UI parse `config.json` itself instead of consuming the normalized snapshot.
- **Acceptance:** establishes ISC-2, ISC-3, ISC-18, ISC-19, ISC-21, ISC-22, ISC-23, ISC-27.

### MCP-05 — Implement the `mcp` proxy tool, the `mcp_manager` UI tool, and custom CLI bridging
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-B
- **Depends on:** MCP-03, MCP-04
- **Files:**
  - new `plugins/sero-mcp-plugin/extension/tools/proxy-tool.ts`
  - new `plugins/sero-mcp-plugin/extension/tools/manager-tool.ts`
  - new `plugins/sero-mcp-plugin/extension/tools/cli.ts`
  - update `plugins/sero-mcp-plugin/extension/index.ts`
  - update `plugins/sero-mcp-plugin/package.json`
- **Reference code:**
  - tool registration pattern: `plugins/sero-git-plugin/extension/index.ts`
  - action-enum tool pattern: `plugins/sero-cron-plugin/extension/tools.ts`
  - custom CLI bridge behavior: `apps/desktop/electron/cli/core/schema-bridge.ts`
  - live CLI refresh tests: `apps/desktop/electron/__tests__/cli/custom-tool-cli-bridge.test.ts`
  - adapter proxy behavior reference: `/Users/danielcarter/Documents/Dev/ai/pi-mcp-adapter/index.ts`, `proxy-modes.ts`
- **Expected shape:**
  ```ts
  pi.registerTool({
    name: 'mcp',
    parameters: McpProxyParams,
    cli: {
      summary: 'Manage MCP servers and use the MCP proxy',
      help: 'sero mcp status | list | connect <server> | reconnect [server] | enable <server> | disable <server>',
      async execute(args, ctx) {
        return runMcpCli(runtime, args, ctx);
      },
    },
  });

  pi.registerTool({
    name: 'mcp_manager',
    parameters: McpManagerParams,
    async execute(_id, params) {
      return runtime.executeManagerAction(params);
    },
  });
  ```
- **Constraints:**
  - `mcp` is the only bridged tool
  - `mcp_manager` is for UI actions only and must not be bridged
  - basic CLI actions = `status`, `list`, `connect`, `reconnect`, `enable`, `disable`
  - auth remains UI-first; CLI should return guidance, not launch external auth flows
  - proxy search results should only include MCP tools/resources, not `mcp_manager` or unrelated Pi tools
- **Do NOT:**
  - **Anti-pattern: Agent Surface Creep** — do not surface `mcp_manager`, direct MCP tools, or internal admin actions to the agent.
  - **Anti-pattern: Search All Pi Tools** — do not keep the adapter’s mixed Pi-tool search behavior; it leaks internal tools and violates the single-surface intent.
- **Acceptance:** covers ISC-14, ISC-15, ISC-16, ISC-A-1, ISC-A-4.

### MCP-06 — Add the desktop host support required for in-plugin viewer and auth surfaces
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-C
- **Depends on:** MCP-01
- **Files:**
  - `apps/desktop/electron/main.ts`
  - `apps/desktop/electron/platform/security/csp.ts`
  - new `plugins/sero-mcp-plugin/ui/components/viewer/McpAuthBrowser.tsx`
  - new `plugins/sero-mcp-plugin/ui/webview.d.ts` (or equivalent JSX intrinsic typing)
- **Reference code:**
  - production CSP policy: `apps/desktop/electron/platform/security/csp.ts`
  - loopback iframe preview pattern: `apps/desktop/src/components/apps/explorer/editor/DevServerPreview.tsx`
  - shared iframe UI patterns: `packages/ui/src/components/ai-elements/web-preview.tsx`
- **Expected shape:**
  ```ts
  // main.ts
  webPreferences: {
    preload: ...,
    contextIsolation: true,
    nodeIntegration: false,
    plugins: true,
    webviewTag: true,
  }
  ```

  ```tsx
  export function McpAuthBrowser({ src }: { src: string }) {
    return <webview src={src} className="size-full" partition="persist:sero-mcp-auth" />;
  }
  ```
- **Constraints:**
  - production CSP must allow **loopback** frame/connect sources needed by the viewer without reopening arbitrary `http:` / `https:` production frames
  - embedded auth must stay in-plugin; do not require a popup or the system browser on the happy path
  - if `webviewTag` is enabled, the auth component must enforce a strict URL allowlist and must not enable Node integration
- **Do NOT:**
  - **Anti-pattern: Broad Production CSP** — do not add blanket `http:` / `https:` frame allowances in production.
  - **Anti-pattern: External Browser Primary Path** — do not make `shell.openExternal()` or `open()` the normal auth flow.
- **Acceptance:** unlocks ISC-17, ISC-20, ISC-24, ISC-26, ISC-A-3.

### MCP-07 — Build the MCP app shell, bootstrap hook, and first-run overview/wizard
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-D
- **Depends on:** MCP-01, MCP-04
- **Files:**
  - new `plugins/sero-mcp-plugin/ui/McpApp.tsx`
  - new `plugins/sero-mcp-plugin/ui/hooks/useMcpBootstrap.ts`
  - new `plugins/sero-mcp-plugin/ui/components/layout/McpShell.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/overview/McpOverview.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/wizard/McpSetupWizard.tsx`
- **Reference code:**
  - rich multi-panel app shell: `plugins/sero-admin-plugin/ui/AdminApp.tsx`
  - lightweight state-driven UI: `plugins/sero-web-plugin/ui/WebApp.tsx`
  - `useAppTools()` behavior: `packages/app-runtime/src/use-app-tools.ts`
- **Expected shape:**
  ```tsx
  export function McpApp() {
    useMcpBootstrap();
    const [state] = useAppState<McpAppState>(DEFAULT_MCP_STATE);
    return <McpShell state={state} />;
  }
  ```
- **Constraints:**
  - on mount, bootstrap the app session via `useAppTools().run('mcp_manager', { action: 'bootstrap' })`
  - show a first-run wizard when there are no configured servers
  - healthy-state overview should be friendly and non-technical by default
  - keep selection/tab state local to React; no localStorage
- **Do NOT:**
  - **Anti-pattern: Passive UI Bootstrap** — do not assume opening the plugin automatically initializes the app session.
  - **Anti-pattern: TUI UI Port** — do not rebuild the adapter’s overlay panel inside React.
- **Acceptance:** covers ISC-2, ISC-3, ISC-4, ISC-13, ISC-21.

### MCP-08 — Implement server list/detail UX, forms-first CRUD, raw config editing, and Ask-Sero recovery
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-D
- **Depends on:** MCP-04, MCP-07
- **Files:**
  - new `plugins/sero-mcp-plugin/ui/components/servers/McpServerRail.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/servers/McpServerDetail.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/servers/McpServerForm.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/servers/McpServerStatusCard.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/config/McpRawConfigEditor.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/diagnostics/McpDiagnosticsPanel.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/shared/AskSeroButton.tsx`
- **Reference code:**
  - dense admin/config panels: `plugins/sero-admin-plugin/ui/components/ConfigPanel.tsx`
  - status-heavy card sections: `plugins/sero-admin-plugin/ui/components/plugins/PluginDevSessionCard.tsx`
  - agent prompt hook: `packages/app-runtime/src/use-agent-prompt.ts`
- **Expected shape:**
  ```tsx
  const promptAgent = useAgentPrompt();

  <AskSeroButton
    onClick={() => promptAgent(buildMcpHelpPrompt(serverSnapshot, diagnostics))}
  />
  ```
- **Constraints:**
  - support add, edit, enable, disable, connect, reconnect, remove
  - forms-first UX for normal setup; raw JSON editor for advanced users
  - failure states must show friendly copy first, with copyable diagnostics on demand
  - include explicit **Ask Sero to help** actions on auth/server/render failures
- **Do NOT:**
  - **Anti-pattern: Raw-JSON-Only Management** — do not make raw config the primary setup path.
  - **Anti-pattern: Technical-First Healthy UI** — do not front-load diagnostics when everything is working.
- **Acceptance:** covers ISC-5, ISC-6, ISC-7, ISC-8, ISC-9, ISC-10, ISC-18, ISC-22, ISC-23, ISC-24, ISC-25.

### MCP-09 — Integrate embedded resource/UI viewing and the in-plugin auth pane
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-D
- **Depends on:** MCP-04, MCP-06, MCP-07
- **Files:**
  - new `plugins/sero-mcp-plugin/ui/components/viewer/McpResourceViewer.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/viewer/McpViewerPane.tsx`
  - new `plugins/sero-mcp-plugin/ui/hooks/useMcpViewer.ts`
  - new `plugins/sero-mcp-plugin/extension/viewer/ui-server.ts`
  - new `plugins/sero-mcp-plugin/extension/viewer/ui-session.ts`
  - new `plugins/sero-mcp-plugin/extension/viewer/ui-resource-handler.ts`
  - new `plugins/sero-mcp-plugin/extension/auth/flow.ts`
  - new `plugins/sero-mcp-plugin/extension/auth/callback-server.ts`
- **Reference code:**
  - loopback viewer rendering: `apps/desktop/src/components/apps/explorer/editor/DevServerPreview.tsx`
  - shared iframe shell: `packages/ui/src/components/ai-elements/web-preview.tsx`
  - adapter viewer/auth backend: `/Users/danielcarter/Documents/Dev/ai/pi-mcp-adapter/ui-session.ts`, `ui-server.ts`, `ui-resource-handler.ts`, `mcp-auth-flow.ts`, `mcp-callback-server.ts`
- **Expected shape:**
  ```ts
  const result = await run('mcp_manager', {
    action: 'open_resource',
    serverName,
    resourceUri,
  });

  setViewer({ url: result.details?.viewerUrl as string, mode: 'resource' });
  ```
- **Constraints:**
  - MCP resources and UI-capable tools must open inside the plugin UI
  - use iframe/web preview for localhost viewer URLs only
  - use the embedded auth browser for external OAuth URLs
  - if a resource cannot render, keep the user in-plugin with recovery guidance and Ask-Sero action
  - do not persist viewer/auth URLs into app state
- **Do NOT:**
  - **Anti-pattern: Popup Viewer Regression** — do not keep the adapter’s browser/Glimpse popup model as the primary flow.
  - **Anti-pattern: Persisted Viewer Secrets** — do not write session URLs/tokens to `state.json`.
- **Acceptance:** covers ISC-17, ISC-19, ISC-20, ISC-24, ISC-26, ISC-A-3.

### MCP-10 — Add extension/runtime/host automated tests for lifecycle, paths, CLI, and CSP
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-E
- **Depends on:** MCP-03, MCP-04, MCP-05, MCP-06
- **Files:**
  - new `plugins/sero-mcp-plugin/extension/__tests__/*.test.ts`
  - update `apps/desktop/electron/__tests__/platform/csp.test.ts`
  - optionally update `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts` if manifest parsing changes are needed
- **Reference code:**
  - adapter test inventory: `/Users/danielcarter/Documents/Dev/ai/pi-mcp-adapter/__tests__/*`
  - CSP tests: `apps/desktop/electron/__tests__/platform/csp.test.ts`
  - plugin manifest/compatibility tests: `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts`
  - CLI custom bridge tests: `apps/desktop/electron/__tests__/cli/custom-tool-cli-bridge.test.ts`
- **Expected coverage:**
  - singleton runtime dedupes session attach
  - config/cache/auth paths resolve to Sero-aware locations
  - enable/disable/connect/reconnect update runtime + snapshot correctly
  - `mcp_manager` is not exposed via bridgeTools
  - `mcp` CLI subcommands execute and refresh from live tool definitions
  - production CSP allows loopback viewer URLs without broad `http:`/`https:` reopening
- **Do NOT:**
  - **Anti-pattern: Happy-Path-Only Backend Tests** — do not stop at “connect works”.
  - **Anti-pattern: Untested CSP Change** — do not ship production frame/connect policy changes without targeted tests.
- **Acceptance:** covers ISC-11 through ISC-20, ISC-24, ISC-26, ISC-A-1, ISC-A-3.

### MCP-11 — Add UI tests for wizard, server detail, diagnostics, Ask-Sero, and viewer/auth flows
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-E
- **Depends on:** MCP-07, MCP-08, MCP-09
- **Files:**
  - new `plugins/sero-mcp-plugin/ui/*.test.tsx`
  - new `plugins/sero-mcp-plugin/ui/components/**/*.test.tsx`
  - optionally new local UI hook tests under `plugins/sero-mcp-plugin/ui/hooks/*.test.ts`
- **Reference code:**
  - app-runtime bridge test: `apps/desktop/src/lib/app-runtime.test.tsx`
  - federated UI test patterns: `plugins/sero-git-plugin/ui/GitApp.test.tsx`
  - questionnaire UI tests: `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.test.tsx`
- **Expected coverage:**
  - bootstrap action runs on mount
  - first-run wizard appears only when expected
  - forms-first add/edit/remove flows call `mcp_manager` correctly
  - diagnostics remain hidden until requested
  - Ask-Sero buttons compose useful prompts
  - viewer/auth panes render and recover from failure states in-plugin
- **Do NOT:**
  - **Anti-pattern: Snapshot-Only UI Coverage** — assert visible recovery copy, button presence, and action calls rather than only snapshots.
  - **Anti-pattern: LocalStorage UI State** — do not add tests for forbidden persistence paths because the feature should not use them.
- **Acceptance:** covers ISC-2 through ISC-10, ISC-17 through ISC-26.

### MCP-12 — Write the plugin README and run the final monorepo validation pass
- **Plan artifact:** `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md`
- **Workstream:** WS-E
- **Depends on:** MCP-05, MCP-08, MCP-09, MCP-10, MCP-11
- **Files:**
  - new `plugins/sero-mcp-plugin/README.md`
  - optional small doc touchpoints only if needed for cross-linking
- **Reference code:**
  - README structure and user guide style: `plugins/sero-cron-plugin/README.md`
  - plugin packaging docs: `docs/plugins/guide.md`
- **Expected shape:**
  ```md
  # @sero-ai/plugin-mcp
  - setup wizard
  - stdio and HTTP/SSE server setup
  - in-plugin auth flow
  - embedded resources/UIs
  - `sero mcp status|list|connect|reconnect|enable|disable`
  - troubleshooting and storage paths
  ```
- **Constraints:**
  - cover setup, auth, CLI control, troubleshooting, and storage behavior
  - explicitly document that v1 has one proxy tool and no direct-tool exposure
  - end with repo-root `pnpm typecheck`
- **Do NOT:**
  - **Anti-pattern: Adapter README Copy-Paste** — do not document `/mcp-auth`, imports, direct tool toggles, or popup-first UI as if they shipped in v1.
  - **Anti-pattern: Partial Validation** — do not skip the final root `pnpm typecheck` and touched-file line-count checks.
- **Acceptance:** covers ISC-28 and closes the release checklist.

## Final Notes for Workers

- Use the adapter as a **backend parts bin**, not as the final product shape.
- Keep the singleton runtime decision intact unless it is conclusively proven insufficient.
- Do not invent a new host IPC surface if `useAppTools()` + shared state + minimal host viewer/auth support are enough.
- Protect the single-tool agent surface aggressively:
  - no direct-tool registration
  - no proxy search over plugin-internal tools
  - no accidental `bridgeTools` omissions
- Treat production viewer/auth support as a first-class requirement, not a late polish task.
- Run `pnpm typecheck` from the monorepo root before calling the feature done.
