# E2E Test Coverage — Phase 1: Contract Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `write-todos` conventions when extracting tasks from this plan. Each task below is self-contained and includes files, constraints, examples/references, commands, expected outcomes, acceptance criteria, and a suggested atomic conventional commit.

**Date:** 2026-05-17  
**Status:** Draft  
**Spec:** `docs/superpowers/specs/2026-05-17-e2e-test-coverage-design.md`  
**Phase 0 base plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-0-foundation.md`  
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`  
**Target base branch:** `feat/enhanced-host-mode` while PR #185 is open. Branch Phase 1 from/extend that branch unless the user says otherwise.

## Goal

Expand Sero's **contract** e2e layer for spec sections **1, 3, 4, 6, 7, 8, 12, and 14**. Contract tests should exercise real Electron preload/IPC/main-process behavior while avoiding rendered UI coupling.

Phase 1 must ship:

- Contract specs for:
  - Section 1: Profile registry IPC; onboarding state machine transitions.
  - Section 3: Workspace IPC list/create/remove/setContainer/setRuntimeBackend; legacy `mac-host` → `host` normalization.
  - Section 4: Sessions IPC create/list/delete/get-equivalent behavior; workspaceId binding; deterministic multi-session stream/listener isolation.
  - Section 6: Runtime diagnostics capabilities + install state for each backend.
  - Section 7: Container IPC status/inspect/ensure; terminal IPC create/write/resize/dispose/replay.
  - Section 8: Editor IPC readFile/writeFile/listFiles across available runtime backends; VCS IPC surface presence and cheap behavior checks.
  - Section 12: CLI registry: registered core commands, schema/help behavior, command execution against a seeded workspace, plus an explicit skipped/pending plugin-bridged custom-tool test.
  - Section 14: Doctor result shape stable per platform.
- `apps/desktop/e2e/helpers/cli.ts`: `runCli(registry, args)` returning `{ stdout, exit }`, with TDD unit coverage.
- Dedicated `.github/workflows/e2e-contract.yml` for GitHub-hosted `ubuntu-latest`, `macos-latest`, and `windows-latest` contract runs.

## Architecture

Contract specs are grouped by subsystem and launched through the Phase 0 helpers. For IPC surfaces, tests must call the app through `page.evaluate(() => window.sero...)`; do **not** use locators, visibility assertions, DOM clicks, screenshots, or app-shell text. These are not workflow tests.

CLI coverage has a small helper-unit-test slice plus a realistic contract slice:

1. `helpers/cli.ts` wraps production `executeCliArgv` and normalizes output to `{ stdout, exit }`.
2. `cli.contract.spec.ts` uses the production CLI registry/context with seeded workspace state to execute core commands.
3. Plugin-bridged CLI exposure is deliberately represented by an explicit skipped test until Phase 3 provides the synthetic test plugin fixture.

CI uses a dedicated workflow instead of growing `.github/workflows/test.yml`. To avoid duplicate contract e2e runs, the worker should remove or disable the old desktop e2e job in `test.yml` when the new workflow is added, and adjust the existing PR gate accordingly.

## Key Decisions

- **Contract means public bridge behavior:** use `window.sero` from `page.evaluate` for IPC domains.
- **No UI in Phase 1:** no locators, no DOM clicks, no rendered shell assertions.
- **Real behavior over presence-only checks:** where cheap and deterministic, assert state changes and disk effects, not just method existence.
- **CLI helper is TDD-only; CLI contract is realistic:** helper unit tests cover normalization/argv preservation; contract spec invokes real registry commands.
- **No Phase 3 scope:** plugin-bridged CLI custom tools are a skipped pending test only.
- **Dedicated contract CI:** `.github/workflows/e2e-contract.yml` owns the cross-OS contract signal.
- **No PR without confirmation:** workers may commit locally but must not push/open a PR until the user confirms.

## Scope

### In scope

- New `*.contract.spec.ts` files under `apps/desktop/e2e/`.
- Minimal helper additions needed by those specs.
- `apps/desktop/e2e/helpers/cli.ts` and `apps/desktop/e2e/helpers/__tests__/cli.test.ts`.
- Re-exporting the CLI helper from `apps/desktop/e2e/helpers/index.ts`.
- Dedicated contract GitHub Actions workflow.
- Atomic local commits per task.

### Out of scope

- Workflow/UI tests beyond the current migrated Phase 0 files.
- Agent-realism/LLM tests.
- Synthetic plugin, MCP, plugin install/update, or plugin UI tests.
- Full container lifecycle/image-pull assertions in GH-hosted contract CI.
- Visual regression/performance/a11y.
- Opening or updating a PR without explicit user confirmation.

## Existing References Workers Must Read First

- `apps/desktop/e2e/agent-ipc.contract.spec.ts` — current contract style and existing `page.evaluate` IPC checks.
- `apps/desktop/e2e/app-launch.contract.spec.ts` — current API-surface contract checks.
- `apps/desktop/e2e/helpers/electron-app.ts` — `launchSeroApp({ seroHome, runtime, seed, mockRelaunch })`.
- `apps/desktop/e2e/helpers/seroHome.ts` — temp home/profile/workspace seeding caveat around `SERO_HOME_OVERRIDE`.
- `apps/desktop/e2e/helpers/runtime.ts` — runtime availability/skipping helpers.
- `apps/desktop/src/types/electron.d.ts` — canonical `window.sero` bridge surface.
- `apps/desktop/src/types/electron-workspace.d.ts` — workspace/editor/VCS bridge methods.
- `apps/desktop/src/types/ipc-channels.ts` — canonical IPC channel list.
- `apps/desktop/electron/cli/index.ts` — core CLI registration and plugin bridging.
- `apps/desktop/electron/cli/core/batch-executor.ts` — `executeCliArgv` behavior.
- `apps/desktop/electron/cli/core/registry.ts` — `CliRegistry` behavior.
- `apps/desktop/electron/__tests__/cli/host-bridge.test.ts` — argv preservation and context examples.
- `.github/workflows/test.yml` — existing desktop e2e job to avoid duplicating.

## File Structure

**Create:**

- `apps/desktop/e2e/helpers/cli.ts`
- `apps/desktop/e2e/helpers/__tests__/cli.test.ts`
- `apps/desktop/e2e/profiles-onboarding.contract.spec.ts`
- `apps/desktop/e2e/workspace.contract.spec.ts`
- `apps/desktop/e2e/sessions.contract.spec.ts`
- `apps/desktop/e2e/runtime-diagnostics.contract.spec.ts`
- `apps/desktop/e2e/container-terminal.contract.spec.ts`
- `apps/desktop/e2e/editor-vcs.contract.spec.ts`
- `apps/desktop/e2e/cli.contract.spec.ts`
- `apps/desktop/e2e/doctor.contract.spec.ts`
- `.github/workflows/e2e-contract.yml`

**Modify:**

- `apps/desktop/e2e/helpers/index.ts` — re-export `runCli` and types.
- `apps/desktop/vitest.config.ts` only if Phase 0 did not already include `e2e/helpers/__tests__/**/*.test.ts`.
- `.github/workflows/test.yml` — remove/disable duplicate desktop e2e job and adjust PR gate after dedicated workflow exists.
- Existing contract specs only for cleanup if needed (`waitForTimeout` replacement is allowed but not required unless touched).

---

## Task 0: Branch and baseline sanity

**What:** Start from the correct branch state and verify Phase 0 foundation exists before adding Phase 1. This prevents workers from planning against `main` while PR #185 is still open.

**Constraints:**
- Do not modify source files in this task.
- Do not push or open a PR.
- If `feat/enhanced-host-mode` is unavailable locally, ask the orchestrator/user before choosing a different base.

**Files:** none.

**Commands:**

```bash
git status --short
git branch --show-current
git log --oneline -5
ls apps/desktop/e2e/helpers
ls apps/desktop/e2e/*.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- --list
```

**Expected outcome:** Phase 0 helpers/config/spec suffixes are present. Current branch is `feat/enhanced-host-mode` or a Phase 1 branch derived from it.

**Acceptance criteria:**
- [ ] Working tree state is understood before edits.
- [ ] Phase 0 files exist: `helpers/seroHome.ts`, `helpers/runtime.ts`, `helpers/llm.ts`, `playwright.config.ts` with `contract/workflow/agent` projects.
- [ ] No files changed.

**Commit:** none.

---

## Task 1: Add `helpers/cli.ts` using TDD

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Build a tiny e2e helper that lets contract specs execute the production CLI registry through argv arrays and receive stable `{ stdout, exit }` results.

**Constraints:**
- Use production `executeCliArgv` from `@electron/cli/core`.
- Preserve argv tokens exactly; do **not** accept a shell string and re-tokenize quoted/JSON values.
- Return only `{ stdout, exit }` from the public helper.
- Unit-test the helper with `CliRegistry` and fake commands; do not require Electron launch in the unit test.
- Use top-level imports. Do **not** use `any` casts unless unavoidable with an explanatory comment.
- Follow reference: `apps/desktop/electron/__tests__/cli/host-bridge.test.ts`, especially `makeContext()` and the argv-preservation test.

**Files:**
- Create: `apps/desktop/e2e/helpers/cli.ts`
- Create: `apps/desktop/e2e/helpers/__tests__/cli.test.ts`
- Modify: `apps/desktop/e2e/helpers/index.ts`
- Modify: `apps/desktop/vitest.config.ts` only if helper tests are not already included.

**TDD steps:**

1. Write failing tests first:

```ts
import { describe, expect, it } from 'vitest';
import { CliRegistry, type CliCommandContext } from '@electron/cli/core';
import { runCli } from '../cli';

function makeContext(): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp/workspace',
    invocation: { workspaceId: 'ws-1', sessionId: null, turnId: null, source: 'bash' },
    workspaceManager: {} as CliCommandContext['workspaceManager'],
    containerManager: {} as CliCommandContext['containerManager'],
  };
}

describe('runCli', () => {
  it('returns stdout and exit from executeCliArgv', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'echo',
      summary: 'Echo args',
      execute: async (args) => ({ output: JSON.stringify(args), exitCode: 0 }),
    });

    await expect(runCli(registry, ['echo', '--content', 'hello world'], makeContext()))
      .resolves.toEqual({ stdout: '["--content","hello world"]', exit: 0 });
  });
});
```

2. Run expected failing command:

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/cli.test.ts
```

Expected failure: module `../cli` not found.

3. Implement the helper shape:

```ts
import { executeCliArgv, type CliCommandContext, type CliRegistry } from '@electron/cli/core';

export interface RunCliResult {
  stdout: string;
  exit: number;
}

export async function runCli(
  registry: CliRegistry,
  args: string[],
  context: CliCommandContext,
): Promise<RunCliResult> {
  const result = await executeCliArgv(registry, args, context);
  return { stdout: result.output, exit: result.exitCode };
}
```

4. Add tests for non-zero exit and JSON/space argv preservation.
5. Re-export from `helpers/index.ts`:

```ts
export { runCli, type RunCliResult } from './cli';
```

**Acceptance criteria:**
- [ ] Initial test fails before implementation with missing module.
- [ ] `pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/cli.test.ts` passes after implementation.
- [ ] `pnpm --filter @sero/desktop typecheck` passes.
- [ ] Helper returns `{ stdout, exit }` and does not expose `content/details`.

**Commit:**

```bash
git add apps/desktop/e2e/helpers/cli.ts apps/desktop/e2e/helpers/__tests__/cli.test.ts apps/desktop/e2e/helpers/index.ts apps/desktop/vitest.config.ts
git commit -m "feat(e2e): add cli helper for contract tests"
```

---

## Task 2: Add profile and onboarding contract spec

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 1: profile registry IPC and onboarding state transitions via public `window.sero.profiles` and `window.sero.onboarding` APIs.

**Constraints:**
- Use only `page.evaluate(...)` for IPC calls.
- Do **not** use locators, DOM clicks, or visibility assertions.
- Prefer public IPC after launch over boot-time registry hacks if `SERO_HOME_OVERRIDE` ignores `profiles/registry.json`.
- Use `mockRelaunch: true` for switch behavior if asserting switch triggers relaunch/exit.
- Keep the spec under 500 LOC; split if needed.
- Reference existing bridge types: `apps/desktop/src/types/electron.d.ts` (`SeroProfilesAPI`, `SeroOnboardingAPI`).

**Files:**
- Create: `apps/desktop/e2e/profiles-onboarding.contract.spec.ts`

**Expected outcome:** A serial contract spec creates/list/renames/deletes profiles and verifies onboarding state changes (`needsOnboarding`, `markOnboardingDone`, `onboarding.getState`) without UI.

**Example shape:**

```ts
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { createTempSeroHome, launchSeroApp, type TempSeroHome } from './helpers';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({ seroHome: home.path, runtime: 'host', mockRelaunch: true }));
});

test.afterAll(async () => {
  await app.close();
  home.cleanup();
});

test('creates, lists, renames, and deletes an inactive profile', async () => {
  const created = await page.evaluate(() => window.sero.profiles.create('Contract Profile'));
  expect(created.name).toBe('Contract Profile');

  await page.evaluate((id) => window.sero.profiles.rename(id, 'Renamed Contract Profile'), created.id);
  const profiles = await page.evaluate(() => window.sero.profiles.list());
  expect(profiles.some((profile) => profile.name === 'Renamed Contract Profile')).toBe(true);
});
```

**Suggested assertions:**
- `profiles.list()` returns an array of objects with `id`, `name`, `path`, and active marker/flag if present.
- `profiles.create()` creates a profile visible in `profiles.list()`.
- `profiles.rename()` changes only the target profile.
- `profiles.delete()` unregisters an inactive profile without asserting filesystem deletion.
- `profiles.needsOnboarding()` transitions from `true` to `false` after `markOnboardingDone()`.
- `onboarding.getState()` returns a stable object shape with step/status fields currently exposed by `OnboardingState`.

**Acceptance criteria:**
- [ ] `pnpm --filter @sero/desktop e2e:contract -- profiles-onboarding.contract.spec.ts` passes locally.
- [ ] The spec contains no `locator`, `click`, `toBeVisible`, or `waitForTimeout`.
- [ ] All IPC calls occur inside `page.evaluate`.

**Commit:**

```bash
git add apps/desktop/e2e/profiles-onboarding.contract.spec.ts
git commit -m "test(e2e): cover profile and onboarding IPC contracts"
```

---

## Task 3: Add workspace contract spec

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 3: workspace IPC list/create/remove/setContainer/setRuntimeBackend plus legacy `mac-host` normalization to `host`.

**Constraints:**
- Use only `page.evaluate(...)` for IPC calls.
- Do not use native folder pickers.
- Create workspace parents under a temp directory; include at least one path with a space for cross-platform path coverage.
- Assert `mac-host` normalizes to `host` on read; do **not** preserve/assert legacy `mac-host` beyond input compatibility.
- Follow `SeroWorkspaceAPI` in `apps/desktop/src/types/electron-workspace.d.ts`.

**Files:**
- Create: `apps/desktop/e2e/workspace.contract.spec.ts`

**Expected outcome:** Tests create and remove workspaces, toggle runtime via both old and new APIs, and prove list/config/runtime reads are stable.

**Example shape:**

```ts
const workspace = await page.evaluate(
  ({ name, parent }) => window.sero.workspace.create(name, parent),
  { name: 'Contract Workspace', parent: parentDir },
);

expect(workspace.id).toEqual(expect.any(String));
expect(workspace.runtime.backend).toBe('host');

const updated = await page.evaluate(
  (id) => window.sero.workspace.setRuntimeBackend(id, 'mac-host'),
  workspace.id,
);
expect(updated.runtime.backend).toBe('host');
```

**Acceptance criteria:**
- [ ] Covers `workspace.list`, `create`, `remove`, `setContainer`, `setRuntimeBackend`, `getRuntimeConfig`.
- [ ] Includes legacy `mac-host` → `host` assertion.
- [ ] Uses a temp parent path containing a space.
- [ ] `pnpm --filter @sero/desktop e2e:contract -- workspace.contract.spec.ts` passes.
- [ ] No UI APIs or fixed sleeps.

**Commit:**

```bash
git add apps/desktop/e2e/workspace.contract.spec.ts
git commit -m "test(e2e): cover workspace IPC contracts"
```

---

## Task 4: Add sessions and multi-session isolation contract spec

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 4: sessions create/list/delete/get-equivalent behavior, workspaceId binding, and deterministic multi-session listener isolation.

**Constraints:**
- Use only `page.evaluate(...)` for IPC calls.
- Do not call a real LLM or depend on provider keys.
- If there is no public `sessions.get`, use the closest public contract: `sessions.list(workspaceId)` plus returned `SeroSessionInfo` from `sessions.create` and `agent.open` message loading.
- Avoid `waitForTimeout`; use event promises or immediate listener lifecycle checks.
- Reference `SeroSessionsAPI` and `SeroAgentAPI` in `apps/desktop/src/types/electron.d.ts`.

**Files:**
- Create: `apps/desktop/e2e/sessions.contract.spec.ts`

**Expected outcome:** A seeded workspace can create two sessions, list them by workspace, open/close each, and verify `agent.onEvent` listener plumbing does not cross explicit session IDs for synthetic/local events that the public API can observe.

**Example shape:**

```ts
const { workspace, sessions } = await page.evaluate(async () => {
  const workspace = await window.sero.workspace.create('Session Contract');
  const first = await window.sero.sessions.create(workspace.id);
  const second = await window.sero.sessions.create(workspace.id);
  const sessions = await window.sero.sessions.list(workspace.id);
  return { workspace, sessions, first, second };
});

expect(sessions.every((session) => session.workspaceId === workspace.id)).toBe(true);
expect(sessions).toHaveLength(2);
```

**Suggested isolation check:**
- Subscribe once with `agent.onEvent` inside `page.evaluate`.
- Open two sessions with `agent.open(sessionId, sessionPath, workspaceId)`.
- If opening emits session-scoped events, assert all collected events include the expected `sessionId` and no event is attributed to the wrong session.
- If no deterministic event is emitted without LLM, assert listener registration/unsubscribe is stable and document that concurrent streaming is deferred to Phase 4 agent realism.

**Acceptance criteria:**
- [ ] Covers create/list/delete and workspace filter/binding.
- [ ] Documents absence of public `get` if applicable and uses public equivalent behavior.
- [ ] Does not call `agent.prompt` unless LLM is fully disabled/mocked by production test mode.
- [ ] `pnpm --filter @sero/desktop e2e:contract -- sessions.contract.spec.ts` passes.

**Commit:**

```bash
git add apps/desktop/e2e/sessions.contract.spec.ts
git commit -m "test(e2e): cover session IPC contracts"
```

---

## Task 5: Add runtime diagnostics contract spec

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 6: runtime diagnostics capabilities and install state for each backend.

**Constraints:**
- Use only `page.evaluate(...)` for IPC calls.
- Do not install toolchains/browser packs or trigger expensive downloads.
- Assert shape and backend coverage, not exact installed status.
- Use runtime helpers only for skip decisions; diagnostics should run in `host` app launch by default.
- Reference `workspace.getRuntimeDiagnostics`, `getToolchainStatus`, and `getBrowserPackStatus` in `apps/desktop/src/types/electron-workspace.d.ts`.

**Files:**
- Create: `apps/desktop/e2e/runtime-diagnostics.contract.spec.ts`

**Expected outcome:** Diagnostics return stable object arrays/status records on each platform and include current backend/capability/install-state data without requiring container daemons.

**Example shape:**

```ts
const diagnostics = await page.evaluate(() => window.sero.workspace.getRuntimeDiagnostics());
expect(Array.isArray(diagnostics)).toBe(true);
for (const item of diagnostics) {
  expect(item).toEqual(expect.objectContaining({
    workspaceId: expect.any(String),
    backend: expect.any(String),
  }));
}
```

**Acceptance criteria:**
- [ ] Asserts diagnostics are stable per platform without exact install status coupling.
- [ ] Covers toolchain/browser pack status shape if public API is stable.
- [ ] Does not call `ensureCoreTools`, `ensureBrowserPack`, or any installer.
- [ ] `pnpm --filter @sero/desktop e2e:contract -- runtime-diagnostics.contract.spec.ts` passes.

**Commit:**

```bash
git add apps/desktop/e2e/runtime-diagnostics.contract.spec.ts
git commit -m "test(e2e): cover runtime diagnostics contracts"
```

---

## Task 6: Add container and terminal contract spec

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 7: container IPC status/inspect/ensure and terminal IPC create/write/resize/dispose/replay.

**Constraints:**
- Use only `page.evaluate(...)` for IPC calls.
- Do not require Docker or Apple Container in GH-hosted contract CI.
- In `host` contract runs, assert API surface and safe status shapes; skip backend-heavy `ensure` if runtime unavailable.
- Terminal output is shell-dependent; do not assert exact prompts. Prefer replay contains a unique marker only if `write` reliably echoes it on the platform.
- Always dispose terminals in `finally` inside `page.evaluate`.
- Reference `SeroContainerAPI` and `SeroTerminalAPI` in `apps/desktop/src/types/electron.d.ts`.

**Files:**
- Create: `apps/desktop/e2e/container-terminal.contract.spec.ts`

**Expected outcome:** Container APIs return stable `null`/object/error contracts for a workspace; terminal lifecycle can create, resize, write, replay, and dispose without UI.

**Example shape:**

```ts
const result = await page.evaluate(async () => {
  const ws = await window.sero.workspace.create('Terminal Contract');
  const terminalId = `contract-${Date.now()}`;
  const created = await window.sero.terminal.create(ws.id, terminalId, 80, 24);
  await window.sero.terminal.resize(terminalId, 100, 30);
  const replay = await window.sero.terminal.replay(terminalId);
  await window.sero.terminal.dispose(terminalId);
  return { created, replayType: typeof replay };
});

expect(result.created).toBeTruthy();
expect(result.replayType).toBe('string');
```

**Acceptance criteria:**
- [ ] Covers `container.status`, `container.inspect` or documented error shape, and skip-gated `container.ensure`.
- [ ] Covers `terminal.create`, `write`, `resize`, `replay`, `dispose`.
- [ ] No exact shell prompt assertions.
- [ ] `pnpm --filter @sero/desktop e2e:contract -- container-terminal.contract.spec.ts` passes on host runtime.

**Commit:**

```bash
git add apps/desktop/e2e/container-terminal.contract.spec.ts
git commit -m "test(e2e): cover container and terminal IPC contracts"
```

---

## Task 7: Add editor and VCS contract spec

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 8: editor IPC read/write/list across available backends and VCS IPC surface presence plus cheap behavior checks.

**Constraints:**
- Use only `page.evaluate(...)` for IPC calls.
- Always cover `host` read/write/list.
- Skip `apple-container`/`docker` editor behavior when unavailable; do not pull images in GH-hosted contract CI just to satisfy cross-backend coverage.
- VCS surface presence should include rich methods from `SeroVcsAPI`, not just old checkpoint methods.
- Use temp workspace files; do not mutate repo files.
- Reference `apps/desktop/src/types/electron-workspace.d.ts` (`SeroEditorAPI`, `SeroVcsAPI`).

**Files:**
- Create: `apps/desktop/e2e/editor-vcs.contract.spec.ts`

**Expected outcome:** A workspace can write/read/list a file through editor IPC in host mode. VCS methods exist and cheap calls like `status`/`getState` return stable shapes for the seeded workspace.

**Example shape:**

```ts
const result = await page.evaluate(async () => {
  const ws = await window.sero.workspace.create('Editor Contract');
  await window.sero.editor.writeFile(ws.id, 'notes/contract.txt', 'hello contract');
  const content = await window.sero.editor.readFile(ws.id, 'notes/contract.txt');
  const files = await window.sero.editor.listFiles(ws.id, 'notes');
  return { content, files };
});

expect(result.content).toBe('hello contract');
expect(result.files).toEqual(expect.arrayContaining([
  expect.objectContaining({ name: 'contract.txt', type: 'file' }),
]));
```

**VCS surface example:**

```ts
const methods = await page.evaluate(() => {
  const vcs = window.sero.vcs;
  return ['listCheckpoints', 'getState', 'createCheckpoint', 'restore', 'diff', 'status', 'logEntries', 'remotes']
    .every((name) => typeof vcs[name as keyof typeof vcs] === 'function');
});
expect(methods).toBe(true);
```

**Acceptance criteria:**
- [ ] Host editor read/write/list behavior passes.
- [ ] Backend-specific cases skip with clear reasons when unavailable.
- [ ] VCS surface includes old and rich methods.
- [ ] `pnpm --filter @sero/desktop e2e:contract -- editor-vcs.contract.spec.ts` passes.

**Commit:**

```bash
git add apps/desktop/e2e/editor-vcs.contract.spec.ts
git commit -m "test(e2e): cover editor and vcs IPC contracts"
```

---

## Task 8: Add CLI contract spec using production registry/context

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 12: core CLI command registration, argument/help behavior, baseline command execution against a seeded workspace, and an explicit pending plugin-bridged custom tool test.

**Constraints:**
- This spec may import CLI modules directly because CLI is not a `window.sero` IPC surface. Do not use DOM/UI APIs.
- Use the `runCli` helper from Task 1.
- Use production `getCliRegistry()` where feasible; reset test singleton state between tests if needed using existing helpers.
- Build a real-ish `CliCommandContext` matching `apps/desktop/electron/__tests__/cli/host-bridge.test.ts`.
- Seed a real temp workspace folder and use production managers only if they are initialized in the test environment. If not, launch Electron and/or document the smallest realistic fallback.
- Include `test.skip` for plugin-bridged custom tools with message referencing Phase 3 synthetic plugin.
- Do **not** implement plugin fixtures or plugin bridge behavior in Phase 1.

**Files:**
- Create: `apps/desktop/e2e/cli.contract.spec.ts`

**Expected outcome:** CLI contract tests assert the registered core command set and execute representative commands: `help`, `workspace list/create` or `workspace info`, `session info`, `editor read/list`, and `vcs status` against a seeded workspace/context.

**Example shape:**

```ts
import { test, expect } from '@playwright/test';
import { getCliRegistry, resetCliRegistryForTests } from '../electron/cli';
import type { CliCommandContext } from '../electron/cli/core';
import { runCli } from './helpers';

test.afterEach(() => {
  resetCliRegistryForTests();
});

test('lists expected core commands', () => {
  const names = getCliRegistry().list().map((command) => command.name);
  expect(names).toEqual(expect.arrayContaining([
    'help', 'workspace', 'session', 'vcs', 'editor', 'terminal', 'browser', 'devserver', 'app', 'appstate', 'artifact',
  ]));
});

test('help lists registered commands', async () => {
  const result = await runCli(getCliRegistry(), ['help'], makeContext());
  expect(result.exit).toBe(0);
  expect(result.stdout).toContain('workspace');
});

test.skip('plugin-bridged custom tools surface as CLI commands when policy allows — Phase 3 synthetic plugin fixture required', async () => {
  // Pending by design: Phase 3 creates apps/desktop/e2e/fixtures/test-plugin/.
});
```

**Acceptance criteria:**
- [ ] Core command names asserted include workspace, session, vcs, editor, terminal, browser, devserver, apps/app, artifact, app-state/appstate, help.
- [ ] Valid help/command argv returns exit `0`.
- [ ] Invalid argv/schema/usage returns non-zero exit or `ERROR:` output as production currently defines.
- [ ] Plugin-bridged custom tool test is explicitly skipped with Phase 3 TODO.
- [ ] `pnpm --filter @sero/desktop e2e:contract -- cli.contract.spec.ts` passes.

**Commit:**

```bash
git add apps/desktop/e2e/cli.contract.spec.ts
git commit -m "test(e2e): cover cli registry contracts"
```

---

## Task 9: Add doctor contract spec

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Cover Section 14: doctor result shape stable per platform.

**Constraints:**
- Use only `page.evaluate(...)` for IPC calls.
- Prefer `doctor.runQuick()` to keep contract suite fast.
- Assert shape/platform/category/status stability; do **not** assert exact tool installation statuses.
- Do not invoke repair actions except the documented reserved/stub method if it is cheap and stable.
- Reference `apps/desktop/src/types/electron-doctor.d.ts` and `apps/desktop/src/types/doctor.ts`.

**Files:**
- Create: `apps/desktop/e2e/doctor.contract.spec.ts`

**Expected outcome:** Doctor quick run returns a stable report object on macOS/Linux/Windows, including platform metadata and check/result arrays with stable fields.

**Example shape:**

```ts
const report = await page.evaluate(() => window.sero.doctor.runQuick());
expect(report).toEqual(expect.objectContaining({
  platform: expect.any(String),
  arch: expect.any(String),
}));
expect(Array.isArray(report.checks ?? report.results)).toBe(true);
```

**Acceptance criteria:**
- [ ] `runQuick` returns stable object shape.
- [ ] Assertions are platform-tolerant.
- [ ] No exact installed/missing status coupling.
- [ ] `pnpm --filter @sero/desktop e2e:contract -- doctor.contract.spec.ts` passes.

**Commit:**

```bash
git add apps/desktop/e2e/doctor.contract.spec.ts
git commit -m "test(e2e): cover doctor IPC contract"
```

---

## Task 10: Remove fixed sleeps from touched contract specs

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Clean up timing dependence in touched/new contract specs. Existing `agent-ipc.contract.spec.ts` currently has `page.waitForTimeout(2000)`; replace it if this file is touched during Phase 1.

**Constraints:**
- Do not broaden scope into workflow specs.
- Use `expect.poll`, app launch readiness, or IPC promise readiness.
- No new `waitForTimeout` in any Phase 1 spec.

**Files:**
- Modify only touched contract specs, especially `apps/desktop/e2e/agent-ipc.contract.spec.ts` if edited.

**Example replacement:**

```ts
await expect.poll(async () => page.evaluate(() => typeof window.sero?.workspace?.list === 'function'), {
  timeout: 10_000,
}).toBe(true);
```

**Acceptance criteria:**
- [ ] `rg -n "waitForTimeout" apps/desktop/e2e/*.contract.spec.ts` shows no new Phase 1 usage. If old usage remains in untouched files, document why.
- [ ] Contract suite still passes.

**Commit:**

```bash
git add apps/desktop/e2e/*.contract.spec.ts
git commit -m "test(e2e): reduce timing dependence in contract specs"
```

Skip this commit if no files were changed.

---

## Task 11: Add dedicated e2e contract GitHub Actions workflow

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Create the dedicated contract CI workflow for GH-hosted macOS/Linux/Windows and avoid duplicate contract e2e execution in `test.yml`.

**Constraints:**
- Use dedicated `.github/workflows/e2e-contract.yml`.
- Matrix must include `ubuntu-latest`, `macos-latest`, and `windows-latest`.
- Run only contract layer: `pnpm --filter @sero/desktop e2e:contract`.
- Upload Playwright artifacts on failure.
- Do not add workflow/agent/self-hosted jobs in Phase 1.
- Keep external fork safety consistent with current repo policy. GH-hosted contract is acceptable, but if repo policy skips fork PR compute, mirror the current guard.
- Update `.github/workflows/test.yml` to remove/disable its old `desktop-e2e` job and adjust `pr-gate` so contract CI ownership is not duplicated.

**Files:**
- Create: `.github/workflows/e2e-contract.yml`
- Modify: `.github/workflows/test.yml`

**Example workflow skeleton:**

```yaml
name: E2E Contract

on:
  pull_request:
    branches: [main]
    types: [opened, reopened, synchronize, ready_for_review]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}-${{ matrix.os }}
  cancel-in-progress: true

jobs:
  contract:
    name: Contract (${{ matrix.os }})
    if: github.event_name != 'pull_request' || !github.event.pull_request.draft
    runs-on: ${{ matrix.os }}
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Install Playwright Chromium
        run: pnpm --filter @sero/desktop exec playwright install chromium
      - name: Build desktop
        run: pnpm --filter @sero/desktop build
      - name: Run contract e2e
        run: pnpm --filter @sero/desktop e2e:contract
      - name: Upload Playwright artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-contract-${{ matrix.os }}
          path: |
            apps/desktop/test-results/
            apps/desktop/playwright-report/
          if-no-files-found: ignore
          retention-days: 7
```

**Linux note:** If Electron requires xvfb even for contract tests on `ubuntu-latest`, wrap the run command with `xvfb-run -a` and install xvfb in this workflow only.

**Acceptance criteria:**
- [ ] New workflow validates YAML syntax by inspection and/or `actionlint` if available.
- [ ] `test.yml` no longer duplicates the desktop contract e2e job, or a comment explains temporary duplication for branch-protection migration.
- [ ] Artifact names include OS to avoid matrix collisions.
- [ ] No self-hosted runner labels introduced.

**Commit:**

```bash
git add .github/workflows/e2e-contract.yml .github/workflows/test.yml
git commit -m "ci(e2e): add dedicated contract workflow"
```

---

## Task 12: Run focused local verification and fix fallout

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Run all new helper/unit/contract checks locally and fix only Phase 1 fallout.

**Constraints:**
- Do not add workflow/agent tests to fix contract failures.
- Do not mask failures with broad skips. Skips must be runtime/platform-specific or explicitly pending Phase 3 plugin coverage.
- Do not introduce `@ts-ignore`, `@ts-expect-error`, or broad `any` casts.

**Files:** fixes as discovered.

**Commands:**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/cli.test.ts
pnpm --filter @sero/desktop typecheck
pnpm --filter @sero/desktop e2e:contract -- profiles-onboarding.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- workspace.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- sessions.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- runtime-diagnostics.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- container-terminal.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- editor-vcs.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- cli.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract -- doctor.contract.spec.ts
pnpm --filter @sero/desktop e2e:contract
```

**Expected outcome:** All helper tests and the full contract suite pass locally on the maintainer’s platform. Backend-specific tests skip clearly when unavailable.

**Acceptance criteria:**
- [ ] All commands above pass, except documented platform-specific skips.
- [ ] `rg -n "locator\(|\.click\(|toBeVisible|waitForTimeout" apps/desktop/e2e/*.contract.spec.ts` shows no Phase 1 violations.
- [ ] `wc -l apps/desktop/e2e/*.contract.spec.ts apps/desktop/e2e/helpers/*.ts` confirms touched source files are under 500 LOC.

**Commit:**

```bash
git add -A
git commit -m "fix(e2e): stabilize phase 1 contract coverage"
```

Only create this commit if there are actual fallout fixes.

---

## Task 13: Final verification, commit review, and handoff

**Plan:** `docs/superpowers/plans/2026-05-17-e2e-phase-1-contract-layer.md`

**What:** Produce the final confidence signal and prepare PR notes without pushing/opening a PR unless the user confirms.

**Constraints:**
- Run monorepo-level typecheck before handoff per `AGENTS.md`.
- Do not open a PR automatically.
- Keep final summary honest about OSes actually run locally versus covered by workflow definition.

**Commands:**

```bash
pnpm typecheck
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/cli.test.ts
pnpm --filter @sero/desktop e2e:contract
git log --oneline feat/enhanced-host-mode..HEAD
git status --short
```

If branch is exactly `feat/enhanced-host-mode`, use the correct base comparison for the local Phase 1 branch.

**Expected PR title:**

```text
test(e2e): Phase 1 contract layer expansion
```

**Expected PR body:**

```markdown
## Summary
- Adds Phase 1 contract e2e coverage for profiles/onboarding, workspaces, sessions, runtime diagnostics, container/terminal, editor/VCS, CLI, and doctor.
- Adds `helpers/cli.ts` with TDD unit coverage around production `executeCliArgv`.
- Adds dedicated cross-OS `.github/workflows/e2e-contract.yml` for contract layer CI.
- Leaves plugin-bridged CLI custom-tool coverage as an explicit skipped Phase 3 pending test.

## Test plan
- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/cli.test.ts`
- [ ] `pnpm --filter @sero/desktop e2e:contract`
```

**Acceptance criteria:**
- [ ] Local verification commands pass.
- [ ] Commit log shows atomic conventional commits.
- [ ] Worker asks the user before pushing/opening PR.

**Commit:** none unless final documentation changes are needed.

---

## Final Verification Matrix

Run before handoff:

```bash
pnpm typecheck
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/cli.test.ts
pnpm --filter @sero/desktop e2e:contract
```

Optional workflow validation if installed:

```bash
actionlint .github/workflows/e2e-contract.yml .github/workflows/test.yml
```

## Expected Phase 1 Exit Criteria

- Contract suite is green locally on the maintainer’s platform.
- Dedicated contract workflow is ready to run on `ubuntu-latest`, `macos-latest`, and `windows-latest`.
- Contract specs use public IPC via `page.evaluate` for IPC domains and contain no UI locator/click/visibility assertions.
- `helpers/cli.ts` is covered by Vitest and used by CLI contract tests.
- Plugin-bridged CLI custom-tool exposure is an explicit skipped/pending test, not implemented.
- No touched source file exceeds 500 LOC.

## Risks Accepted

- Some backend-specific container/editor assertions may skip on GH-hosted runners to keep contract CI fast and avoid daemon/image dependencies.
- `sessions.get` may not exist publicly; Phase 1 should cover the observable equivalent via `create`, `list(workspaceId)`, and `agent.open` rather than adding new IPC.
- Doctor results vary by OS and installed tools; tests assert shape rather than exact statuses.
- CLI plugin bridging remains incomplete until Phase 3 synthetic plugin fixtures exist.
