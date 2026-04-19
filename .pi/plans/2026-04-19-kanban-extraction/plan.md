# Kanban Plugin Self-Containment Migration Plan

**Date:** 2026-04-19
**Status:** Draft
**Spec:** `.pi/plans/2026-04-19-kanban-extraction/spec.md`
**Scout:** `.pi/plans/2026-04-19-kanban-extraction/scout-context.md`
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Overview

This migration makes `plugins/sero-kanban-plugin` the truthful owner of Kanban runtime behavior, not just the board UI and tool surface. The current split is:

- **plugin-owned already**: board UI, widget, `kanban` tool/command, shared state/settings contract, prompts;
- **host-owned still**: the workflow engine in `apps/desktop/electron/features/kanban/**`, including file watching, phase orchestration, startup recovery, review side effects, worktree/PR lifecycle, preview handling, cleanup, and auto-merge polling.

The recommended path is **not** a file shuffle. It is a platform extraction:

1. add one generic host capability for **background plugin runtime ownership**;
2. extract truly generic execution primitives out of the Kanban host folder;
3. move Kanban orchestration/policy into a **plugin runtime entry**;
4. rebase UI workflow actions onto plugin-owned tool calls;
5. delete the Kanban-specific shell glue last.

The plan intentionally preserves the current `.sero/apps/kanban/*` contract unless implementation discovers a hard blocker. The spec allows a fresh-start contract, but changing the state shape is unnecessary risk unless the runtime cutover proves it is load-bearing.

## Approaches Considered

### 1. Keep the host engine, move only policy/prompt modules into the plugin
- **Pros:** smallest code movement, lowest short-term disruption.
- **Cons:** fails the spec. `apps/desktop` would still own the Kanban orchestration engine and review-action runtime. External plugin readiness would still be weak.
- **Decision:** reject as end state.

### 2. Add a generic background app-runtime seam in the host, then move Kanban runtime into the plugin (**recommended**)
- **Pros:** satisfies the ownership boundary cleanly; keeps `apps/desktop` generic; gives external plugins a reusable runtime pattern; lets Kanban retain current automation semantics.
- **Cons:** requires a real host capability addition (`sero.app.runtime` + runtime bootstrap/compatibility/build support) before the domain move.
- **Decision:** use this.

### 3. Run Kanban entirely inside a hidden app session / extension singleton
- **Pros:** reuses the existing extension loader.
- **Cons:** Kanban runtime needs direct generic host primitives (subagent orchestration, worktree/PR operations, dev-server lifecycle). Forcing all of that through session/extension APIs would either explode the extension surface or recreate Kanban-specific host glue elsewhere. It also muddies Pi CLI portability for the existing `extension/` code.
- **Decision:** reject in favor of a separate Sero-only `runtime/` entry.

## Recommended Approach

Introduce a new **generic plugin runtime contract**:

- a plugin may declare a Sero-only runtime entry, e.g. `sero.app.runtime`;
- the host may advertise a generic capability such as `appRuntime.background`;
- a new host-side `AppRuntimeManager` loads runtime-enabled apps/plugins, starts one runtime instance per applicable scope (workspace/global), watches the declared state file, and routes file changes to the runtime instance;
- the runtime instance receives a **typed generic capability bag** (app-state read/write/watch, workspace/container execution, subagent execution, git/worktree/PR ops, dev-server lifecycle, runtime refresh);
- Kanban runtime code moves into `plugins/sero-kanban-plugin/runtime/**` and uses only:
  - plugin-local code,
  - `@sero-ai/common`,
  - the injected generic runtime capability bag.

That leaves `extension/` free to stay Pi-CLI-safe and file-based, while `runtime/` becomes the Sero-only background owner.

## Key Decisions

- **Use `runtime/` as a separate plugin surface.**
  Do not mix Sero-only background orchestration into `extension/`, because the extension must remain usable in Pi CLI without host runtime capabilities.

- **Add one generic runtime manifest/capability instead of Kanban-specific wiring.**
  Recommended names:
  - manifest: `sero.app.runtime`
  - capability: `appRuntime.background`

- **Preserve the existing Kanban state/error/review-cache paths by default.**
  Keep:
  - `.sero/apps/kanban/state.json`
  - `.sero/apps/kanban/errors.json`
  - `.sero/apps/kanban/reviews/*`

- **Rebase UI workflow actions onto `useAppTools()` / `appAgent.invokeTool(...)`.**
  Workflow-triggering UI actions should stop mutating state directly.

- **Do not let plugin runtime import `@electron/features/kanban/**`.**
  Any host capability the plugin needs must be injected through a generic capability bag, backed by host-owned generic modules.

- **Delete `apps/desktop/electron/features/kanban/**` completely at the end.**
  Generic helpers now trapped under that folder must be promoted out before cutover.

## Boundary Map

### Final host-owned surfaces

These remain in `apps/desktop` because they are reusable platform/runtime primitives:

| Area | Final owner | Likely destination |
|---|---|---|
| background plugin runtime bootstrap | host | `apps/desktop/electron/features/apps/runtime/*` |
| app-state transport + file watching | host | existing `features/apps/state/*` + generic routing in `ipc/apps/app-state.ts` |
| app/plugin compatibility + discovery + manifest parsing | host | existing discovery/plugin modules |
| workspace/container command execution | host | promote from `features/kanban/workspace/*` into `features/workspace/runtime/*` |
| generic verification/dev/install command detection | host | promote from `features/kanban/quality/verification.ts` into `features/workspace/runtime/detect-commands.ts` |
| worktree/git/PR primitives | host | promote from `features/kanban/worktree/*` into `features/vcs/worktree/*` or `features/apps/runtime/capabilities/git/*` |
| managed dev-server lifecycle | host | existing container/dev-server registry + thin capability wrapper |
| subagent execution bridge | host | existing `features/subagent/*` + thin capability wrapper |
| runtime refresh after sync | host | promote from `features/kanban/workspace/workspace-runtime-refresh.ts` |

### Final plugin-owned surfaces

These move into `plugins/sero-kanban-plugin` because they exist only for Kanban:

| Area | Final owner | Likely destination |
|---|---|---|
| state-driven orchestrator | plugin | `plugins/sero-kanban-plugin/runtime/core/*` |
| startup recovery + persisted-state reconcile | plugin | `plugins/sero-kanban-plugin/runtime/core/*` |
| planning/implementation/review phase policy | plugin | `plugins/sero-kanban-plugin/runtime/planning/*`, `runtime/implementation/*`, `runtime/review/*` |
| review completion, YOLO auto-complete, auto-merge polling | plugin | `plugins/sero-kanban-plugin/runtime/review/*`, `runtime/quality/*` |
| review preview policy / cleanup policy | plugin | `plugins/sero-kanban-plugin/runtime/review/*` |
| review action semantics (`request-revisions`, `cancel-pr`) | plugin | canonical in `extension/review-actions.ts`; host watcher side-effects deleted |
| Kanban prompts | plugin | `plugins/sero-kanban-plugin/runtime/prompts/*` |
| auto-start / newly-unblocked / YOLO sweep policy | plugin | `plugins/sero-kanban-plugin/runtime/core/contracts.ts` or `runtime/core/automation.ts` |
| Kanban README and runtime docs | plugin | `plugins/sero-kanban-plugin/README.md` |

### Important split decisions

- `extension/` stays **Pi-CLI-friendly** and continues to operate on the same file contract.
- `runtime/` is **Sero-only** and owns background automation.
- `ui/` remains file-reactive via `useAppState()`, but workflow actions move onto plugin tools.
- `@sero-ai/common` remains the owner of renderer-safe shared Kanban state/validation.

## Architecture

### 1. Generic app runtime contract

Recommended shape:

```ts
export interface AppRuntimeModule {
  createAppRuntime(ctx: AppRuntimeContext): AppRuntime;
}

export interface AppRuntime {
  start(): Promise<void>;
  handleStateChange(state: unknown): Promise<void>;
  dispose(): Promise<void>;
}

export interface AppRuntimeContext {
  appId: string;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  host: AppRuntimeHost;
}
```

Recommended host capability shape:

```ts
export interface AppRuntimeHost {
  appState: {
    read<T>(filePath: string): Promise<T | null>;
    update<T>(filePath: string, updater: (current: T | null) => T): Promise<void>;
    watch(filePath: string): void;
    unwatch(filePath: string): void;
  };
  subagents: {
    runStructured(params: {
      agent: string;
      task: string;
      workspaceId: string;
      cwd?: string;
      parentSessionId: string;
      isolated?: boolean;
      customTools?: unknown[];
      onUpdate?: (text: string) => void;
    }): Promise<{ response: string; error?: string }>;
    onLiveOutput(workspaceId: string, parentSessionId: string, cb: (agent: string, text: string) => void): () => void;
  };
  workspace: {
    runCommand(workspaceId: string, cwd: string, command: string, timeoutMs?: number, opts?: { isolated?: boolean }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
    refreshAfterSync(workspaceId: string, workspacePath: string): Promise<unknown>;
    resolveRuntime(workspaceId: string): Promise<unknown>;
  };
  git: {
    createWorktree(...args: unknown[]): Promise<unknown>;
    removeWorktree(...args: unknown[]): Promise<void>;
    syncWithDefault(...args: unknown[]): Promise<unknown>;
    createCheckpoint(...args: unknown[]): Promise<string | null>;
    getDiff(...args: unknown[]): Promise<string>;
    getDiffSummary(...args: unknown[]): Promise<string>;
    pushBranch(...args: unknown[]): Promise<boolean>;
    createPr(...args: unknown[]): Promise<unknown>;
    closePr(...args: unknown[]): Promise<void>;
    mergePr(...args: unknown[]): Promise<unknown>;
    getPrMergeState(...args: unknown[]): Promise<unknown>;
    getPrMergeError(...args: unknown[]): Promise<string | null>;
  };
  devServers: {
    startManaged(...args: unknown[]): Promise<unknown>;
    list(workspaceId: string): unknown[];
    stop(serverId: string): Promise<boolean>;
    unregister(serverId: string): boolean;
  };
}
```

**Key rule:** the runtime gets **capabilities**, not raw `SharedInfra`, not `workspaceManager`, not `containerManager`, and not Kanban-specific helper objects.

### 2. Runtime bootstrap flow

1. App discovery parses `sero.app.runtime` and exposes `runtimeEntry` on `SeroAppManifest`.
2. `AppRuntimeManager` starts after infra/bootstrap and plugin activation are ready.
3. For each compatible runtime-enabled app and open workspace:
   - resolve `workspacePath` and `stateFilePath` from existing `stateFile` + `scope` rules;
   - create one runtime instance;
   - call `appState.watch(stateFilePath)`;
   - call `runtime.start()`.
4. The manager listens once to `appStateManager.onFileChange(...)` and routes matching state-file changes to the owning runtime instance.
5. On plugin uninstall/reload, workspace close, or profile teardown, the manager disposes the runtime instance and releases watches.

This replaces the current Kanban-only glue in:

- `apps/desktop/electron/ipc/apps/app-state.ts`
- `apps/desktop/electron/shared/infra/shared-infra.ts`
- `apps/desktop/electron/shared/infra/singletons.ts`

### 3. Kanban action/data flow after migration

#### Workflow actions

1. UI invokes a workflow action with `useAppTools()`.
2. `plugins/sero-kanban-plugin/extension/index.ts` handles the tool call.
3. The extension tool mutates state and/or performs direct review-side effects.
4. The generic app-state watcher notifies `AppRuntimeManager`.
5. `plugins/sero-kanban-plugin/runtime/**` interprets the state transition and runs planning/implementation/review automation through the generic host capabilities.
6. Updated board/error state flows back to UI through `useAppState()` / `useErrorLogSummary()`.

#### Pure CRUD actions

Card add/update/delete/manual backlog move may remain direct `useAppState()` writes if we want the smallest migration. They do not encode host side effects.

**Constraint:** anything that means “start automation” or “perform review action semantics” must go through the plugin tool layer, not a UI-local reducer.

### 4. Why `runtime/` stays separate from `extension/`

The current extension is intentionally usable in Pi CLI without Sero. That only works because it is file-based and does not depend on host-only runtime primitives.

If the Sero runtime move is pushed into `extension/`, we either:

- break Pi CLI portability, or
- start threading Sero-only host capabilities through the extension API.

Both are worse than a separate `runtime/` surface.

## Phased Migration Plan

### Phase 1 — Add generic plugin runtime support in the host

**Goal:** make background plugin-owned runtime a first-class platform feature before touching Kanban ownership.

#### Work
- Add `sero.app.runtime` manifest parsing and `runtimeEntry` manifest field.
- Add a new host capability constant, recommended: `appRuntime.background`.
- Add a generic `AppRuntimeManager` to own:
  - runtime discovery/load;
  - per-workspace instance lifecycle;
  - state-file watch registration;
  - file-change routing;
  - plugin install/uninstall and workspace open/close reconciliation.
- Update build/export/install flows so plugin runtime entries are bundled/copied and validated.
- Update compatibility/docs so external plugins can declare the new capability.

#### Notes
- This phase must stay **fully generic**. No `kanban` branching in the manager.
- The manager should use existing manifest `scope` and `stateFile` semantics so it works for future global-scope runtimes too.

#### Rollback
- Safe: runtime support can land without activating Kanban yet.

#### Exit criteria
- A runtime-enabled plugin can declare a background runtime entry without adding any Kanban-specific host code.
- Plugin build/export/install pipelines preserve the runtime entry.
- Host compatibility can fail closed when `appRuntime.background` is missing.

### Phase 2 — Extract genuinely generic host primitives out of `features/kanban`

**Goal:** prevent the plugin runtime from depending on host modules that are still physically branded as Kanban.

#### Work
Promote these modules out of `apps/desktop/electron/features/kanban/**`:

- `workspace/workspace-command-runner.ts`
- `workspace/workspace-runtime-refresh.ts`
- generic parts of `quality/verification.ts`
- generic parts of `worktree-manager.ts`
- generic parts of `worktree-git.ts`
- `worktree-pr.ts`
- `worktree-sync.ts`
- generic parts of `worktree-maintenance.ts`
- `quality/pr-merge-status.ts`
- `workspace/container-path.ts`

Recommended destinations:

- `apps/desktop/electron/features/workspace/runtime/*`
- `apps/desktop/electron/features/vcs/worktree/*`
- `apps/desktop/electron/features/apps/runtime/capabilities/*`

#### Notes
- Split mixed files instead of moving Kanban policy along with the primitive. Example: `worktree-maintenance.ts` contains both generic branch sync logic and Kanban-specific “done-card cleanup” logic; only the generic part should stay host-owned.
- Reuse existing `features/vcs/*` structure where it fits.

#### Rollback
- Safe: extraction should be semantics-preserving and test-driven before the owner flip.

#### Exit criteria
- The host capability bag can be implemented without importing Kanban domain logic.
- No reusable worktree/PR/verification helper remains trapped under a Kanban path.

### Phase 3 — Port the Kanban runtime into the plugin

**Goal:** create a plugin-owned runtime implementation without changing live ownership yet.

#### Work
Create `plugins/sero-kanban-plugin/runtime/**` and port the current host engine almost 1:1:

- `runtime/core/*` ← `core/orchestrator.ts`, `orchestrator-phase-runners.ts`, `persisted-state-reconcile.ts`, `contracts.ts`, `state-helpers.ts`
- `runtime/planning/*` ← `planning/*`
- `runtime/implementation/*` ← `implementation/*`
- `runtime/review/*` ← `review/*`
- `runtime/prompts/*` ← `prompts/*`
- `runtime/quality/*` ← `quality/auto-merge-monitor.ts` and any Kanban-only review completion logic

Key rewrites:
- replace direct imports from `@electron/.../kanban/*` with plugin-local modules or injected host capabilities;
- keep shared card/state validation in `@sero-ai/common`;
- keep runtime-specific state writes on the host capability bag (`ctx.host.appState.update(...)`), not raw `fs`, because this is the Sero-only runtime path.

#### Notes
- Keep the current file decomposition shape where possible; it lowers migration risk and lets existing tests port mechanically.
- Add a dedicated `runtime/tsconfig.json` or equivalent so runtime code can be typechecked independently.

#### Rollback
- Safe while the plugin runtime is not registered in `sero.app.runtime`.

#### Exit criteria
- The plugin runtime compiles and passes its own tests with mocked host capabilities.
- The runtime code does not import `@electron/features/kanban/**`.

### Phase 4 — Rebase UI and tool surfaces onto plugin-owned semantics

**Goal:** make plugin tools the single source of truth for workflow-triggering actions before deleting host review-effect glue.

#### Work
- Replace UI-local workflow mutations in:
  - `plugins/sero-kanban-plugin/ui/KanbanApp.tsx`
  - `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx`
  - `plugins/sero-kanban-plugin/ui/lib/card-workflow.ts`

  with `useAppTools().run('kanban', { action: ... })` for:
  - `start`
  - `approve`
  - `complete`
  - `retry`
  - `request-revisions`
  - `cancel-pr`
  - `settings`
  - optional: `cleanup`

- Keep direct `useAppState()` writes only for pure CRUD unless implementation finds more drift.
- Treat `extension/review-actions.ts` and `extension/workflow-actions.ts` as the canonical action semantics.

#### Notes
- Once UI review actions call plugin tools directly, `apps/desktop/electron/features/kanban/review/actions/review-action-effects.ts` becomes redundant.
- This phase is the last point where host and plugin behavior overlap. Delete the duplication immediately after parity is proven.

#### Rollback
- If parity fails, revert the UI action routing to the old reducer path temporarily; do **not** enable plugin runtime ownership yet.

#### Exit criteria
- UI-triggered workflow actions execute through plugin-owned tool handlers.
- Host-side review-action watchers are no longer required to make UI behavior truthful.

### Phase 5 — Flip the runtime owner and remove shell glue

**Goal:** make the plugin runtime the only active owner.

#### Work
- Register `plugins/sero-kanban-plugin/runtime/index.ts` in the manifest (`sero.app.runtime`).
- Add `requiredHostCapabilities` for the new runtime support plus existing bridges (`appAgent.invokeTool`, `tool.cli` if retained, and the new runtime capability).
- Start the Kanban runtime through `AppRuntimeManager`.
- Remove Kanban-specific bootstrap/watcher glue from:
  - `apps/desktop/electron/ipc/apps/app-state.ts`
  - `apps/desktop/electron/shared/infra/shared-infra.ts`
  - `apps/desktop/electron/shared/infra/singletons.ts`
- Delete `apps/desktop/electron/features/kanban/**` after generic modules have been promoted out.

#### Important cutover rule
**Never run host and plugin orchestrators against the same state file at the same time.**
The owner switch must happen at one dispatch point.

Recommended switch:
- keep the old host orchestrator alive until plugin runtime tests are green;
- then flip registration/bootstrap in one change;
- then delete the old host path immediately.

#### Rollback
- Short-term rollback is the owner switch only: disable `sero.app.runtime` / runtime bootstrap for Kanban and re-enable the old host dispatch path.
- Because the repo is unreleased, no long-lived migration shim is required.

#### Exit criteria
- No Kanban-specific orchestration or review-effect code remains in `apps/desktop`.
- The plugin runtime owns startup recovery, auto-start, review completion, cleanup, preview, and auto-merge semantics.

### Phase 6 — Documentation, compatibility, and final verification

**Goal:** finish the external-plugin-ready contract and prove invariant preservation.

#### Work
- Create/update `plugins/sero-kanban-plugin/README.md` for the new runtime ownership model.
- Update host/plugin docs for the new runtime manifest/capability:
  - `docs/plugins/guide.md`
  - `docs/plugins/technical.md`
  - `docs/plugins/host-compatibility.md`
- Re-home/refresh tests:
  - generic host runtime manager tests in `apps/desktop/electron/__tests__/features/apps/runtime/**`
  - generic extracted utility tests in `features/vcs/**` and `features/workspace/**`
  - Kanban runtime tests in `plugins/sero-kanban-plugin/runtime/__tests__/**`

#### Exit criteria
- External/installable plugin packaging works with the new runtime entry.
- README and host-compatibility docs reflect the final contract.
- The preserved behavior checklist passes.

## Risks & Premortem

### Riskiest assumptions

| Assumption | If wrong |
|---|---|
| A generic runtime entry (`sero.app.runtime`) can be packaged/loaded cleanly for both source and pre-built plugins | We need an extra packaging/loader phase before Kanban can move |
| The capability bag can stay generic and small | Workers may try to leak raw host singletons into plugin runtime, recreating host coupling |
| The current `.sero/apps/kanban/*` contract is sufficient for plugin ownership | We may need a deliberate state-contract change or fresh-start reset |
| `AppRuntimeManager` can bootstrap early enough for startup recovery | Interrupted cards may not recover on app launch, violating ISC-8 |
| UI workflow actions can move to tool calls without UX regressions | We may need optimistic UI or local disable/loading polish, but ownership still stays tool-first |

### Realistic failure modes

- **Double execution during cutover** — both host and plugin runtimes react to the same state file.
- **Behavior lost during “generic extraction”** — preview/dev-server or merge-state logic gets simplified accidentally when moved out of Kanban.
- **Packaging hole** — the runtime entry works in the monorepo but is missing from pre-built/plugin-source artifacts.
- **Workspace/profile leakage** — runtime instances are keyed too loosely and cross workspace or profile boundaries.
- **Review action drift** — UI still mutates state directly for some workflow action, bypassing canonical tool semantics.

### Accepted mitigations

- Preserve the on-disk contract unless a blocker proves otherwise.
- Use one explicit owner switch; never run dual orchestrators.
- Port tests before flipping ownership, not after.
- Keep host runtime capabilities generic and typed; no Kanban-branded IPC or preload surfaces.

## Verification Matrix

| Preserved contract | Automated verification target | Manual smoke |
|---|---|---|
| Ready cards auto-start (ISC-7) | plugin runtime test for newly-unblocked and YOLO backlog sweep | complete a dependency chain and watch next card start |
| Startup recovery (ISC-8) | runtime manager bootstrap test + plugin runtime recovery test | restart Sero with cards in `agent-working` planning/in-progress/review |
| Review cleanup runs automatically (ISC-9) | review action + done cleanup tests | request revisions and confirm cache/preview cleanup |
| PR cancellation outcome preserved (ISC-10) | plugin extension `cancel-pr` tests + runtime integration | cancel a review PR from UI and confirm backlog reset + GH close |
| Auto-merge preserved (ISC-11) | plugin runtime auto-merge monitor + completion tests | YOLO + auto-merge repo smoke |
| Preview/dev-server handling preserved (ISC-12) | preview policy tests + runtime refresh tests | open a previewable card and verify preview start/cleanup |
| Cleanup/retry semantics preserved (ISC-13) | retry action tests + cleanup warning visibility tests | force cleanup failure and confirm warning is visible |
| Cleanup failures stay visible (ISC-23) | error-log assertions in plugin runtime/tool tests | verify warning text is shown in board/error log |
| Workspace/profile isolation preserved | runtime manager keying tests | run two workspaces/profiles with independent Kanban boards |
| No Kanban engine remains in host (ISC-17/18/19/20, ISC-A-1/A-2) | repo grep / discovery / compatibility tests | inspect live host after cutover |

## Dependencies

- Existing generic seams already in repo:
  - `appStateManager`
  - `appAgent.invokeTool` / `useAppTools()`
  - `SubagentManager`
  - workspace/container runtime resolution
  - dev-server registry
  - `features/vcs/*`
- Reference migrations/docs:
  - `docs/deslopify/plugins/sero-google-plugin/plan.md`
  - `docs/deslopify/plugins/sero-google-plugin/facts.md`
  - `docs/deslopify/plugins/sero-kanban-plugin/plan.md`
  - `docs/deslopify/apps/desktop/electron/features/kanban/plan.md`
  - `docs/decisions.md` (AD-018, AD-020, AD-021)

## Implementation Todos

> Since this planner session does not have the structured todo tool available, the worker backlog is embedded here as executable markdown todos.
>
> **Rule for every todo:** include the plan path, keep host seams generic, and do not introduce `window.sero.kanban`, `IpcChannels.kanban.*`, or plugin imports from `@electron/features/kanban/**`.

### KT-01 ✅ — Add generic runtime manifest/capability parsing
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - `packages/common/src/plugins.ts`
  - `apps/desktop/src/types/sero-apps.ts`
  - `apps/desktop/electron/features/apps/discovery/index.ts`
  - `apps/desktop/electron/features/apps/discovery/plugin-meta.ts`
  - `apps/desktop/electron/features/plugins/compatibility.ts`
- **Reference:** follow the existing `ui`/`component` parsing pattern in `apps/desktop/electron/features/apps/discovery/index.ts` and the capability pattern in `packages/common/src/plugins.ts` (`appAgent.invokeTool`, `tool.cli`).
- **Expected shape:**
  ```json
  {
    "sero": {
      "app": {
        "runtime": "./runtime/index.ts"
      },
      "plugin": {
        "requiredHostCapabilities": ["appRuntime.background", "appAgent.invokeTool", "tool.cli"]
      }
    }
  }
  ```
- **Constraints:** keep the new surface app-generic; extend `SeroAppManifest` with a nullable runtime entry path.
- **Do NOT:** add any `kanban` special case in manifest parsing or compatibility.
- **Acceptance:** runtime-enabled apps are discoverable and capability-gated; supports ISC-19, ISC-20, ISC-A-2.
- **Status:** complete (2026-04-19)

### KT-02 ✅ — Teach plugin build/export flows about `runtime/`
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - `scripts/build-plugin.mjs`
  - `scripts/export-plugin-source.mjs`
  - `apps/desktop/electron/__tests__/features/plugins/plugin-package-build.test.ts`
- **Reference:** follow extension bundling in `scripts/build-plugin.mjs` (`bundleExtensions(...)`) and source export handling in `scripts/export-plugin-source.mjs`.
- **Expected shape:** pre-built packages should ship a compiled runtime entry just like compiled extensions do.
  ```ts
  // analogous to compiled pi.extensions
  sero.app.runtime = './runtime/index.js'
  ```
- **Constraints:** source exports must keep the runtime source tree npm-installable; pre-built packages must include compiled runtime JS.
- **Do NOT:** rely on monorepo-only workspace resolution in published artifacts.
- **Acceptance:** runtime-enabled plugins install outside the monorepo; supports ISC-20, ISC-22.
- **Status:** complete (2026-04-19)

### KT-03 ✅ — Create the generic `AppRuntimeManager`
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - new `apps/desktop/electron/features/apps/runtime/manager.ts`
  - new `apps/desktop/electron/features/apps/runtime/types.ts`
  - new `apps/desktop/electron/features/apps/runtime/loader.ts`
  - `apps/desktop/electron/shared/infra/shared-infra.ts`
  - `apps/desktop/electron/ipc/integrations/plugins.ts`
  - `apps/desktop/electron/ipc/apps/app-state.ts`
- **Reference:** reuse lifecycle patterns from `apps/desktop/electron/ipc/agent/handlers/app-agent.ts` (per-app pooling) and plugin reload behavior from `ipc/integrations/plugins.ts`.
- **Expected shape:**
  ```ts
  const runtime = await appRuntimeManager.ensureRuntime({ manifest, workspaceId, workspacePath });
  await runtime.start();
  await runtime.handleStateChange(nextState);
  await runtime.dispose();
  ```
- **Constraints:** one runtime instance per app×workspace; generic routing by manifest state file; stop/start on plugin install/uninstall and workspace open/close.
- **Do NOT:** special-case Kanban in the manager.
- **Acceptance:** generic runtime bootstrap exists without changing Kanban ownership yet; supports ISC-16, ISC-19, ISC-A-2.
- **Status:** complete (2026-04-19)

### KT-04 ✅ — Extract generic workspace/runtime command helpers out of Kanban
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - move/split `apps/desktop/electron/features/kanban/workspace/workspace-command-runner.ts`
  - move/split `apps/desktop/electron/features/kanban/workspace/workspace-runtime-refresh.ts`
  - move/split `apps/desktop/electron/features/kanban/quality/verification.ts`
  - update call sites/tests accordingly
- **Reference:** current command execution path in `workspace-command-runner.ts` and the generic detection helpers already bundled in `quality/verification.ts`.
- **Expected shape:**
  ```ts
  import { runWorkspaceCommand } from '@electron/features/workspace/runtime/run-workspace-command';
  import { refreshWorkspaceRuntimeAfterSync } from '@electron/features/workspace/runtime/refresh-after-sync';
  ```
- **Constraints:** keep container/host fallback behavior unchanged; keep returned reason strings stable where tests already assert them.
- **Do NOT:** leave reusable workspace runtime helpers under a Kanban path.
- **Acceptance:** generic workspace execution primitives are host-owned; supports ISC-14, ISC-19.
- **Status:** complete (2026-04-19)

### KT-05 ✅ — Extract generic worktree/git/PR helpers out of Kanban
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - move/split `apps/desktop/electron/features/kanban/worktree/worktree-manager.ts`
  - move/split `worktree-git.ts`, `worktree-pr.ts`, `worktree-sync.ts`, `worktree-maintenance.ts`
  - move/split `quality/pr-merge-status.ts`
  - add/update tests under `apps/desktop/electron/__tests__/features/vcs/**` or `features/apps/runtime/**`
- **Reference:** current implementations in those files; reuse `features/vcs/*` naming/conventions where possible.
- **Expected shape:**
  ```ts
  import { createWorktree, removeWorktree } from '@electron/features/vcs/worktree/manager';
  import { mergePr, getPrMergeState } from '@electron/features/vcs/worktree/pr';
  ```
- **Constraints:** keep conflict-resolution callback support and auto-merge state handling intact.
- **Do NOT:** move Kanban-specific policy such as “done-card cleanup” into the generic layer.
- **Acceptance:** generic git/PR primitives are available to the runtime capability bag; supports ISC-14, ISC-19.
- **Status:** complete (2026-04-19)

### KT-06 ✅ — Scaffold `plugins/sero-kanban-plugin/runtime/` and host capability interfaces
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - `plugins/sero-kanban-plugin/package.json`
  - new `plugins/sero-kanban-plugin/runtime/index.ts`
  - new `plugins/sero-kanban-plugin/runtime/types.ts`
  - new `plugins/sero-kanban-plugin/runtime/tsconfig.json` (or equivalent)
  - `plugins/sero-kanban-plugin/vitest.config.ts`
- **Reference:** keep `extension/tsconfig.json` as the shape reference for runtime TS config; use the new runtime contract from KT-03.
- **Expected shape:**
  ```ts
  export default {
    createAppRuntime(ctx: AppRuntimeContext) {
      return new KanbanRuntime(ctx);
    },
  } satisfies AppRuntimeModule;
  ```
- **Constraints:** runtime code may depend on host capabilities; `extension/` must remain Pi-CLI-safe.
- **Do NOT:** import `@electron/features/kanban/**` into the plugin.
- **Acceptance:** plugin runtime surface exists and typechecks; supports ISC-1, ISC-20.
- **Status:** complete (2026-04-19)

### KT-07 ✅ — Port planning / implementation / review engines into plugin runtime
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - new `plugins/sero-kanban-plugin/runtime/planning/*`
  - new `plugins/sero-kanban-plugin/runtime/implementation/*`
  - new `plugins/sero-kanban-plugin/runtime/review/*`
  - new `plugins/sero-kanban-plugin/runtime/prompts/*`
- **Reference:** port the existing host folders nearly 1:1 from:
  - `apps/desktop/electron/features/kanban/planning/*`
  - `.../implementation/*`
  - `.../review/workflow/*`
  - `.../prompts/*`
- **Constraints:** preserve current subagent agents/prompts, preview semantics, review cache behavior, and file-size splits.
- **Do NOT:** “clean rewrite” these modules while migrating; port first, simplify later.
- **Acceptance:** plugin owns planning/review/implementation behavior definitions; supports ISC-1 through ISC-4, ISC-12, ISC-13.
- **Status:** complete (2026-04-19)

### KT-08 ✅ — Port orchestration, recovery, auto-start, and auto-merge semantics into plugin runtime
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - new `plugins/sero-kanban-plugin/runtime/core/*`
  - new `plugins/sero-kanban-plugin/runtime/quality/*`
- **Reference:** port from:
  - `apps/desktop/electron/features/kanban/core/orchestrator.ts`
  - `.../core/orchestrator-phase-runners.ts`
  - `.../core/persisted-state-reconcile.ts`
  - `.../core/contracts.ts`
  - `.../quality/auto-merge-monitor.ts`
  - `.../review/workflow/review-completion.ts`
- **Expected shape:**
  ```ts
  class KanbanRuntime implements AppRuntime {
    async start() { /* watch + recover */ }
    async handleStateChange(state: KanbanState) { /* diff + transitions */ }
    async dispose() { /* clear timers/watch refs */ }
  }
  ```
- **Constraints:** startup recovery and auto-start must be boot-time behaviors, not UI-only behaviors.
- **Do NOT:** enable the plugin runtime in the manifest yet.
- **Acceptance:** plugin runtime owns recovery/auto-start/auto-merge semantics in tests; supports ISC-7 through ISC-13, ISC-23.
- **Status:** complete (2026-04-19)

### KT-09 ✅ — Rebase UI workflow actions onto `useAppTools()` and delete reducer drift
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - `plugins/sero-kanban-plugin/ui/KanbanApp.tsx`
  - `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx`
  - `plugins/sero-kanban-plugin/ui/lib/card-workflow.ts`
  - optional new `plugins/sero-kanban-plugin/ui/hooks/useKanbanActions.ts`
- **Reference:** use `packages/app-runtime/src/use-app-tools.ts` and the runtime-test example in `apps/desktop/src/lib/app-runtime.test.tsx`.
- **Expected shape:**
  ```ts
  const { run } = useAppTools();
  await run('kanban', { action: 'request-revisions', id, revisionFeedback });
  ```
- **Constraints:** workflow-triggering actions must use the tool bridge; pure CRUD can stay on `useAppState()` if there is no side effect.
- **Do NOT:** add a plugin-specific preload or IPC API; do not keep `request-revisions` / `cancel-pr` duplicated in UI reducers.
- **Acceptance:** canonical action semantics live in the plugin tool layer; supports ISC-5, ISC-6, ISC-19.
- **Status:** complete (2026-04-19)

### KT-10 ✅ — Flip the owner, remove host Kanban glue, and land docs/tests
- **Plan artifact:** `.pi/plans/2026-04-19-kanban-extraction/plan.md`
- **Files:**
  - `plugins/sero-kanban-plugin/package.json`
  - `apps/desktop/electron/ipc/apps/app-state.ts`
  - `apps/desktop/electron/shared/infra/shared-infra.ts`
  - `apps/desktop/electron/shared/infra/singletons.ts`
  - delete `apps/desktop/electron/features/kanban/**`
  - add/update `plugins/sero-kanban-plugin/README.md`
  - update plugin/runtime tests and host runtime manager tests
- **Reference:** current Kanban wiring in `ipc/apps/app-state.ts` and `shared/infra/shared-infra.ts`; Google migration pattern in `docs/deslopify/plugins/sero-google-plugin/plan.md` (“delete shell glue last”).
- **Constraints:** cut over through one owner switch; preserve plugin install/uninstall lifecycle and host compatibility gating.
- **Do NOT:** leave a dormant host orchestrator, a Kanban-only preload namespace, or generic code under `features/kanban/`.
- **Acceptance:** no Kanban-specific runtime remains in `apps/desktop`; README + tests cover preserved invariants; supports ISC-17 through ISC-23 and ISC-A-1/A-2.
- **Status:** complete (2026-04-19)

## Final Notes for Workers

- Prefer a **port-first** move for the runtime code. Do not redesign prompts/executors while changing ownership.
- If a state-contract change becomes unavoidable, keep it confined to `.sero/apps/kanban/*`, document it, and use the spec’s fresh-start allowance explicitly.
- Watch the file-size cap during the move; mirror the current split modules instead of creating new 600+ LOC runtime hubs.
- Run `pnpm typecheck` from the repo root after each phase, plus plugin-local typecheck/tests once `runtime/` exists.
