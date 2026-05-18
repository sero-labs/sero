# E2E Test Coverage — Phase 3: Plugin/MCP Layer Implementation Plan

**Date:** 2026-05-18  
**Spec:** `docs/superpowers/specs/2026-05-17-e2e-test-coverage-design.md`  
**Depends on:** Phase 0 foundation, Phase 1 contract layer, Phase 2 workflow layer  
**Scope:** Deterministic Plugin Manager, built-in plugin discovery/UI smoke, synthetic plugin contract, and MCP plugin management/proxy coverage.

## Goal

Add Phase 3 e2e coverage for deterministic plugin/MCP surfaces without agent-realism or real provider/network calls.

Phase 3 must cover:

- Built-in plugin discovery/registration for shipped `plugins/sero-*-plugin/` packages.
- Plugin Manager IPC for local install/uninstall/dev-session flows against isolated temp `SERO_HOME`.
- Synthetic local plugin contract: install, discover, invoke extension tool, persist plugin state, uninstall without deleting state.
- MCP app/tool contract: bootstrap config, save/read raw config, connect to a local fixture MCP server, list/call/read through the `mcp` proxy tool.
- Built-in module-federated plugin UI smoke only where DOM behavior is required.

## Global Constraints

- No agent-realism tests and no LLM/provider calls.
- No real network, real credentials, marketplace searches, or irreversible installs.
- Contract specs use public IPC/app-agent APIs or isolated runner contracts; no DOM locators/clicks.
- Workflow specs may use DOM locators/clicks, and only for federated UI smoke.
- Every spec creates an isolated home with `createTempSeroHome()` or `launchWorkflowApp({ home })`.
- Runtime-specific tests use `runtimeSkipReason(...)` if added; Phase 3 defaults to host-only deterministic surfaces.
- Keep touched source/spec files under 500 LOC.
- Do not push/update PR without explicit user approval.

## Files

**Create:**

- `apps/desktop/e2e/fixtures/test-plugin/package.json`
- `apps/desktop/e2e/fixtures/test-plugin/extension/index.js`
- `apps/desktop/e2e/fixtures/test-mcp-server/server.mjs`
- `apps/desktop/e2e/plugins.contract.spec.ts`
- `apps/desktop/e2e/mcp.contract.spec.ts`
- `apps/desktop/e2e/plugins.workflow.spec.ts`

**Modify only if needed:**

- `apps/desktop/e2e/cli.contract.spec.ts` — remove the Phase 1 skip only if a robust plugin bridge runner is added.
- `apps/desktop/e2e/helpers/index.ts` / `selectors.ts` — avoid unless a Phase 3 consumer truly needs a reusable selector.

## Task 1 — Add deterministic fixtures

Create a minimal extension-only synthetic plugin fixture under `apps/desktop/e2e/fixtures/test-plugin/`:

- `package.json` declares:
  - `keywords: ["pi-package"]`
  - `pi.extensions: ["./extension/index.js"]`
  - `sero.app.id: "e2e-test-plugin"`
  - `sero.app.name: "E2E Test Plugin"`
  - `sero.app.scope: "global"`
  - `sero.app.stateFile: ".sero/apps/e2e-test-plugin/state.json"`
  - `sero.plugin.bridgeTools: ["e2e_test_plugin"]`
- No UI, runtime, dependencies, or install scripts.
- Extension registers `e2e_test_plugin` with JSON-schema params and actions:
  - `read` — returns current JSON state.
  - `write` — atomically writes `{ value, writes }` under `SERO_HOME/apps/e2e-test-plugin/state.json`.
  - `echo` — returns deterministic echo text.

Create a local stdio MCP server fixture under `apps/desktop/e2e/fixtures/test-mcp-server/server.mjs`:

- Uses `@modelcontextprotocol/sdk` resolved from `plugins/sero-mcp-plugin/package.json` via `createRequire`.
- Exposes one tool `echo` and one resource `noise://test`.
- No network, no credentials, no logging to stdout.

## Task 2 — Plugin Manager/discovery contract spec

Create `apps/desktop/e2e/plugins.contract.spec.ts`.

Scenarios:

1. Built-in plugin package registration:
   - Launch with `createTempSeroHome()` and host runtime.
   - Read `<SERO_HOME>/agent/settings.json` and assert all shipped plugin package paths are registered (`admin`, `alibaba`, `cron`, `git`, `mcp`, `memory`, `user-feedback`, `web`).
2. App discovery manifest contract:
   - `window.sero.apps.discover()` returns UI app manifests for `admin`, `cron`, `git`, `mcp`, `userfeedback`, and `web`.
   - Assert stable manifest fields: `id`, `name`, `scope`, `stateFile`, `packagePath`, `isPlugin`, `plugin.category/tags`, `component` for UI apps.
   - Assert extension-only plugins (`memory`, `alibaba`) are registered in settings but not app manifests.
3. Built-ins are not installed plugins:
   - `window.sero.plugins.list()` starts empty.
   - `window.sero.plugins.isPlugin('mcp')` and `isPlugin('admin')` are false because built-ins do not appear in Plugin Manager installs.
4. Synthetic local plugin lifecycle:
   - Subscribe to `plugins.onChanged` inside `page.evaluate`.
   - `plugins.install(fixturePath)` returns manifest `e2e-test-plugin`.
   - `plugins.list()` includes it and `isPlugin('e2e-test-plugin')` is true.
   - `apps.discover()` includes it without restart.
   - Create a temp workspace, invoke `window.sero.appAgent.invokeTool('e2e-test-plugin', workspace.id, 'e2e_test_plugin', { action: 'write', value: 'phase-3' })`.
   - Assert state file exists under isolated `SERO_HOME/apps/e2e-test-plugin/state.json` and `read` returns it.
   - `plugins.uninstall('e2e-test-plugin')` removes it from installed list/discovery but leaves the state file.
5. Local plugin dev-session lifecycle:
   - `plugins.startDevSession(fixturePath)` returns an active/backend-only session for `e2e-test-plugin`.
   - `listDevSessions`, `refreshDevSession`, and `stopDevSession` update the session list deterministically.

Acceptance:

- `pnpm --filter @sero/desktop e2e:contract -- plugins.contract.spec.ts` passes.
- No DOM locators/clicks in the spec.

## Task 3 — MCP contract spec

Create `apps/desktop/e2e/mcp.contract.spec.ts`.

Scenarios:

1. MCP app manifest and app-agent tools:
   - Discover `mcp` manifest and assert `requiredHostCapabilities`/`bridgeTools` from plugin metadata where surfaced.
   - Create a workspace.
   - Invoke `mcp_manager` action `bootstrap` and assert state/config paths are under isolated `SERO_HOME`.
   - Invoke `mcp` action `status` and assert zero configured servers before config write.
2. Raw config contract:
   - Use `mcp_manager` `save_raw_config` with a config containing the local fixture stdio server.
   - Use `get_raw_config` and assert the server is persisted.
   - Use `mcp` `list`/`status` and assert one configured server.
3. Live local MCP proxy contract:
   - Invoke `mcp` action `connect` for the fixture server.
   - Assert `list_tools` includes `echo`.
   - Assert `describe_tool` returns the input schema.
   - Assert `call_tool` with `{ message: 'phase-3' }` returns `echo: phase-3`.
   - Assert `list_resources` includes `noise://test` and `read_resource` returns deterministic text.
4. Error paths:
   - Missing query/server/tool arguments return `isError`/`Error:` text without throwing or network calls.

Acceptance:

- `pnpm --filter @sero/desktop e2e:contract -- mcp.contract.spec.ts` passes.
- No DOM locators/clicks in the spec.

## Task 4 — Built-in plugin UI workflow smoke

Create `apps/desktop/e2e/plugins.workflow.spec.ts`.

Scenarios:

- Launch via `launchWorkflowApp({ home })` and `waitForShell(page)`.
- Add/register a host workspace and click it so workspace-scoped apps have context.
- For each UI built-in plugin app (`admin`, `cron`, `git`, `mcp`, `userfeedback`, `web`):
  - Open with `window.__appControl?.openApp(appId)`.
  - Assert `[data-app="<appId>"]` becomes visible.
  - Assert the active app panel does not show `No UI module registered`, `No workspace selected`, or `App crashed while rendering`.
- Do not perform network-backed primary actions.

Acceptance:

- `SERO_E2E_RUNTIME=host pnpm --filter @sero/desktop e2e:workflow -- plugins.workflow.spec.ts` passes.

## Task 5 — Verification and review

Run:

```bash
pnpm --filter @sero/desktop e2e:contract -- plugins.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- mcp.contract.spec.ts
SERO_E2E_RUNTIME=host pnpm --filter @sero/desktop e2e:workflow -- plugins.workflow.spec.ts
pnpm typecheck
pnpm --filter @sero/desktop e2e:contract
SERO_E2E_RUNTIME=host pnpm --filter @sero/desktop e2e:workflow
wc -l apps/desktop/e2e/*.contract.spec.ts apps/desktop/e2e/*.workflow.spec.ts apps/desktop/e2e/helpers/*.ts
rg -n "waitForTimeout|SERO_E2E_LLM|ANTHROPIC|OPENAI|plugins.search\(" apps/desktop/e2e/plugins.contract.spec.ts apps/desktop/e2e/mcp.contract.spec.ts apps/desktop/e2e/plugins.workflow.spec.ts
```

Then run a reviewer and address P0/P1 findings before final response.
