# Context for: integrate pi-mcp-adapter as a built-in Sero plugin

## Recommended plugin shape
- **Shape:** `extension + ui`, **no separate runtime** for v1.
- **Why:** the adapter already owns MCP server lifecycle, OAuth, metadata cache, tool bridging, and the interactive `/mcp` panel. Sero only needs a polished plugin UI to inspect/manage config, direct-tool bridging, server status, auth, and UI-session history.
- **Avoid adding `runtime/` initially:** there is no evidence the adapter needs a long-lived background process beyond the extension process itself. A runtime would add lifecycle complexity without solving a clear gap.
- **Likely app id / package name:**
  - `app.id`: `mcp`
  - display name: `MCP`
  - package name: `@sero-ai/plugin-mcp` or `@sero-ai/plugin-mcp-adapter`
- **Icon:** `plug` or `puzzle`/`workflow`-style icon; `plug` best matches a connector/bridge product.
- **State file:** `.sero/apps/mcp/state.json`
- **Likely devPort:** `5196` (next free slot after current built-ins: 5188 cron, 5193 admin, 5194 git, 5195 web; avoid reusing those)

## Relevant Sero references
- `docs/plugins/guide.md` — plugin packaging, manifest fields, install/build expectations, UI + extension structure.
- `docs/plugins/technical.md` — built-in vs installed plugin behavior, manifest-driven tool bridging, app discovery, and package format.
- `docs/plugins/host-compatibility.md` — declare `requiredHostCapabilities` when the UI calls tools directly or the plugin depends on bridged CLI behavior.
- `docs/architecture.md` — shell/app layout and state conventions.
- `docs/decisions.md` — especially tool-bridge decisions (AD-020) and app/plugin loading patterns.
- Reference built-ins:
  - `plugins/sero-admin-plugin/extension/index.ts` — UI-only plugin pattern.
  - `plugins/sero-git-plugin/extension/index.ts` + `shared/types.ts` — app state, workspace-bound extension/tool pattern, and shared state contract.
  - `plugins/sero-web-plugin/extension/index.ts` — richer tool orchestration, session hooks, background-ish fetch behavior, and state sync.
  - `plugins/sero-cron-plugin/extension/index.ts` — global singleton runtime pattern and persistent scheduler.

## Relevant pi-mcp-adapter references
- `README.md` — defines the product: single proxy tool + direct tools + interactive `/mcp` panel + UI integration for MCP resources.
- `package.json` — current extension surface and file inventory.
- `index.ts` — main extension entry; registers tools/commands, handles session lifecycle, bootstraps auth and state.
- `commands.ts` — `/mcp`, `/mcp-auth`, status, reconnect, and TUI panel entry points.
- `state.ts` — extension state shape: server manager, lifecycle manager, tool metadata cache, consent manager, UI server handle, completed UI sessions, message bridge.
- `ui-server.ts` — the heavy piece: HTTP/SSE host for MCP UI resources, message replay, stream summaries, consent gating.
- `mcp-auth.ts`, `mcp-auth-flow.ts`, `mcp-callback-server.ts`, `mcp-oauth-provider.ts` — OAuth/token handling and callback server logic.
- `config.ts`, `metadata-cache.ts`, `server-manager.ts`, `direct-tools.ts`, `proxy-modes.ts`, `tool-registrar.ts`, `resource-tools.ts`, `ui-resource-handler.ts` — MCP config parsing, lazy/eager connection management, metadata cache, proxy/direct tool registration, resource bridging.
- `mcp-panel.ts` — TUI overlay for config and direct-tool selection.
- `glimpse-ui.ts` and `host-html-template.ts` — browser/native UI rendering and host HTML shell.
- Data storage location: `~/.pi/agent/mcp-oauth/<server>/tokens.json` for OAuth creds; config defaults to `~/.pi/agent/mcp.json`; metadata cache and UI/session state are also stored under the Pi agent directory (adapter uses `~/.pi/agent/...`, which Sero should likely redirect to `~/.sero-ui/agent/...` if this becomes Sero-owned).

## Migration hotspots
- **File-size hotspots in adapter (must split during conversion):**
  - `proxy-modes.ts` — 810 LOC
  - `mcp-panel.ts` — 740 LOC
  - `ui-server.ts` — 623 LOC
  - `index.ts` — 305 LOC
  - `mcp-auth-flow.ts` — 400 LOC
  - `direct-tools.ts` — 400 LOC
  - `types.ts` — 426 LOC
  - `host-html-template.ts` — 427 LOC
  - `npx-resolver.ts` — 419 LOC
- **Sero-side UI patterns worth copying:**
  - `sero-admin-plugin` for a dense, multi-panel admin surface with lots of settings/detail panes.
  - `sero-git-plugin` for strongly typed shared state and deterministic UI state/file sync.
  - `sero-web-plugin` for richer command/tool orchestration and session-aware state syncing.
- **Likely copy vs redesign split:**
  - Copy/adapt: config parser, auth storage, lazy/eager server manager logic, tool metadata caching, UI-session tracking, CLI parsing/helpers.
  - Redesign for Sero: any UI that currently assumes Pi’s `/mcp` TUI overlay or `~/.pi/agent` storage, and any host-specific browser/native window handling.

## Open questions for spec
1. **Scope of the UI:** do we want the full MCP manager (server list, auth, direct-tool toggles, activity/history, UI-session inspector), or a narrower “server settings + status” dashboard?
2. **CLI bridging policy:** should plugin tools be bridged into `sero-cli` by default, or should this plugin opt out / selectively bridge? The adapter already exposes a single `mcp` proxy tool plus optional direct tools.
3. **Tool surface exposure:** do users want the large proxy tool only, direct per-server tools, or both? This affects `bridgeTools` and `requiredHostCapabilities: ["tool.cli"]`.
4. **OAuth UX:** should auth be handled entirely in the plugin UI, or should the extension keep a `/mcp-auth` command for agent-only workflows?
5. **Storage contract:** should Sero keep the adapter’s `mcp.json` path under `~/.sero-ui/agent/` or move to app state under `.sero/apps/mcp/state.json` with a separate config file?
6. **UI resource handling:** do we want to preserve MCP UI resources as native/browser popups, or embed them inside the Sero plugin UI shell?
7. **Protocol support scope:** stdio-only, HTTP-only, or both?
8. **Import workflow:** should Sero import an existing `~/.pi/agent/mcp.json`, or create a fresh Sero-specific config schema?

## Suggested implementation slices
1. **Manifest + scaffolding:** create built-in plugin package, manifest, and app shell; choose initial `app.id`, icon, port, and state file.
2. **Core extension port:** move config loading, state handling, tool registration, and lifecycle wiring into Sero conventions.
3. **UI manager panel:** build a polished admin-style web UI for server status, auth, direct-tool management, config editing/import, and session history.
4. **OAuth + server lifecycle:** port auth flow and lazy/eager/keep-alive connection logic, but swap storage paths to Sero’s agent directory conventions.
5. **UI-resource viewing:** decide whether to render MCP UIs in-app, in a popup, or in a dedicated embedded viewer panel.
6. **Tool bridging policy:** define `bridgeTools` defaults and any `requiredHostCapabilities` in the manifest.
7. **Data migration/import:** add import of existing Pi MCP config + token cache, plus migration from `~/.pi/agent` to `~/.sero-ui/agent` if desired.
