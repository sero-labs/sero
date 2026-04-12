# Apps Desktop Deslopify Tasklist

_Last updated: 2026-04-12_

Core-first checklist for reviewing and cleaning up `apps/desktop` without losing track of sequencing.

## Working Rules

- Analyze core layers before shell/periphery.
- Finish a full **deslopify wave** before starting the matching **fix-slop wave**.
- Default `fix-slop` scope: **High only** unless explicitly expanded.
- Re-analyze downstream UI areas after core High items are fixed.
- Ignore files in `@sero-ai/ui` -  these are Shadcn components

## Phase 0 — Baseline Map

- [x] Capture current hotspot inventory for `apps/desktop/src` and `apps/desktop/electron`
- [x] Note files over the 500 LOC cap
- [x] Note likely contract/boundary hotspots (`types`, `preload`, `ipc`, stores)
- [x] Confirm the first wave order before starting

## Wave A — Deslopify Core Contracts and Ownership

### 1. Contracts and boundaries
- [x] `deslopify apps/desktop/src/types`
- [x] `deslopify apps/desktop/electron/preload`
- [x] `deslopify apps/desktop/electron/ipc`

### 2. Core platform/domain owners
- [x] `deslopify apps/desktop/electron/features/workspace`
- [x] `deslopify apps/desktop/electron/features/agent`
- [x] `deslopify apps/desktop/electron/features/container`
- [x] `deslopify apps/desktop/electron/features/apps`
- [x] `deslopify apps/desktop/electron/features/plugins`
- [x] `deslopify apps/desktop/electron/shared`
- [x] `deslopify apps/desktop/electron/platform`

### 3. Renderer orchestration
- [x] `deslopify apps/desktop/src/stores`
- [x] `deslopify apps/desktop/src/hooks`
- [x] `deslopify apps/desktop/src/lib`

## Wave B — Fix Core High-Priority Findings

- [x] Review all Wave A plans together for cross-cutting themes
- [x] Group fixes into coherent `fix-slop` batches
  - See `docs/deslopify/apps/desktop/plan.md` (`Wave B synthesis — 2026-04-12`) for the grouped High-only batch order:
    1. IPC contract hardening
    2. Settings & discovery safety
    3. Runtime lifecycle correctness
    4. Security boundary hardening
- [x] `fix-slop` High items for `apps/desktop/src/types`
- [x] `fix-slop` High items for `apps/desktop/electron/preload`
- [x] `fix-slop` High items for `apps/desktop/electron/ipc`
- [x] `fix-slop` High items for `apps/desktop/electron/features/workspace` _(no High findings in Wave A; deferred to Medium wave)_
- [x] `fix-slop` High items for `apps/desktop/electron/features/agent` _(no High findings in Wave A; deferred to Medium wave)_
- [x] `fix-slop` High items for `apps/desktop/electron/features/container`
- [x] `fix-slop` High items for `apps/desktop/electron/features/apps`
- [x] `fix-slop` High items for `apps/desktop/electron/features/plugins`
- [x] `fix-slop` High items for `apps/desktop/electron/shared`
- [x] `fix-slop` High items for `apps/desktop/electron/platform`
- [x] `fix-slop` High items for `apps/desktop/src/stores`
- [x] `fix-slop` High items for `apps/desktop/src/hooks` _(no High findings in Wave A; deferred to Medium wave)_
- [x] `fix-slop` High items for `apps/desktop/src/lib`
- [x] Run `pnpm typecheck` after each batch and keep notes linked from the relevant plan

## Wave C — Deslopify Primary Consumers

### 4. Main app surfaces
- [x] `deslopify apps/desktop/src/components/apps/explorer`
- [x] `deslopify apps/desktop/electron/features/editor`
- [x] `deslopify apps/desktop/src/lsp`

### 5. Shell and app chrome
- [x] `deslopify apps/desktop/src/components/layout`

### 6. Secondary feature islands
- [x] `deslopify apps/desktop/src/components/profiles`
- [x] `deslopify apps/desktop/electron/features/onboarding`
- [x] `deslopify apps/desktop/electron/features/profile`
- [x] `deslopify apps/desktop/electron/features/auth`
- [x] `deslopify apps/desktop/electron/features/vcs`
- [x] `deslopify apps/desktop/electron/features/subagent`
- [x] `deslopify apps/desktop/electron/features/gateway`
- [x] `deslopify apps/desktop/electron/features/collaboration`

## Wave D — Fix UI/Feature Findings

### 7. High-priority fixes first
- [x] `fix-slop` High items for `apps/desktop/src/components/apps/explorer` _(no High findings in Wave C; deferred to Medium wave)_
- [x] `fix-slop` High items for `apps/desktop/electron/features/editor`
- [x] `fix-slop` High items for `apps/desktop/src/lsp`
- [x] `fix-slop` High items for `apps/desktop/src/components/layout` _(no High findings in Wave C; deferred to Medium wave)_
- [x] `fix-slop` High items for `apps/desktop/src/components/profiles` _(no High findings in Wave C; deferred to Medium wave)_
- [x] `fix-slop` High items for `apps/desktop/electron/features/onboarding` _(no High findings in Wave C; deferred to Medium wave)_
- [x] `fix-slop` High items for `apps/desktop/electron/features/profile`
- [x] `fix-slop` High items for `apps/desktop/electron/features/auth`
- [x] `fix-slop` High items for `apps/desktop/electron/features/vcs`
- [x] `fix-slop` High items for `apps/desktop/electron/features/subagent`
- [x] `fix-slop` High items for `apps/desktop/electron/features/gateway`
- [x] `fix-slop` High items for `apps/desktop/electron/features/collaboration` _(no High findings in Wave C; deferred to Medium wave)_

## Wave E — Medium-priority cleanup
- Identify all the Medium priority items from Wave A, B, C and D and create tasks
- Schedule Medium batches by dependency order, not folder name
- Start with core Medium items still affecting multiple consumers
- Then do feature-level Medium items
- Leave Low items for opportunistic cleanup or dedicated polish passes

### 8. Medium priority fixes
- [x] **Wave E1 — Preload contract cap relief**
  - Split `apps/desktop/electron/preload/api.ts` into focused composition modules
  - Move preload `IpcChannels` imports to `@/types/ipc-channels`
  - Leave weakly typed preload bridge payload tightening for the next core contract pass
- [x] **Wave E2 — Renderer agent/session orchestration hygiene**
  - Split `apps/desktop/src/hooks/useSessionAgent.ts` into focused orchestration hooks
  - Debounce session-list refresh after agent idle transitions
  - Add bounded workspace-file cache eviction in `apps/desktop/src/hooks/useWorkspaceFiles.ts`
  - Deduplicate optimistic user-message enqueue + add explicit session-buffer teardown in `apps/desktop/src/stores/agent{,-utils}.ts`
- [ ] **Wave E3 — Canonical cross-process type cleanup**
  - `fix-slop` Medium items for `apps/desktop/src/types`
  - `fix-slop` Medium items for `apps/desktop/electron/features/profile`
- [ ] **Wave E4 — Core IPC/runtime cap-pressure relief**
  - `fix-slop` Medium items for `apps/desktop/electron/ipc`
  - `fix-slop` Medium items for `apps/desktop/electron/shared`
  - `fix-slop` Medium items for `apps/desktop/electron/features/workspace`
- [ ] **Wave E5 — Platform/plugin lifecycle cleanup**
  - `fix-slop` Medium items for `apps/desktop/electron/platform`
  - `fix-slop` Medium items for `apps/desktop/electron/features/plugins`
  - `fix-slop` Medium items for `apps/desktop/electron/features/apps`
- [ ] **Wave E6 — Feature-level medium cleanup**
  - `fix-slop` Medium items for `apps/desktop/electron/features/editor`
  - `fix-slop` Medium items for `apps/desktop/src/lsp`
  - `fix-slop` Medium items for `apps/desktop/src/components/apps/explorer`
  - `fix-slop` Medium items for `apps/desktop/src/components/layout`
  - `fix-slop` Medium items for `apps/desktop/src/components/profiles`
  - `fix-slop` Medium items for remaining Wave C/D feature folders with Medium findings

## Wave F — True Periphery Last

- [ ] Review whether `apps/desktop/src/components/ui` needs deslopify at all
- [ ] Review styles/theme-only surfaces if still needed
- [ ] Review tests for drift after major refactors
- [ ] Do final sweep for stale docs/plans/index entries

## Current Rationale

Follow this dependency direction:

1. Types/contracts
2. Platform owners
3. State/orchestration
4. Feature implementations
5. Shell/layout
6. Secondary feature islands
7. UI primitives/tests/periphery

That keeps us from fixing visible symptoms in the UI before fixing the code that creates them.

## Progress Notes

- 2026-04-12: Initial tasklist created from the agreed core-first deslopify/fix-slop strategy.
- 2026-04-12: Phase 0 baseline map completed via deslopify. Hotspot inventory + wave-order confirmation documented at `docs/deslopify/apps/desktop/{facts.md,plan.md}`; `docs/deslopify/index.md` initialized.
- 2026-04-12: Wave A step 1 complete for `apps/desktop/src/types`. Findings + plan documented at `docs/deslopify/apps/desktop/src/types/{facts.md,plan.md}` (highs: `ipc.ts` 544 LOC cap violation and `electron.d.ts` missing `SubagentAgentFile` import).
- 2026-04-12: Wave A step 2 complete for `apps/desktop/electron/preload`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/preload/{facts.md,plan.md}` (high: missing compile-time conformance guard between exposed `seroPreloadApi` and declared Sero API contract).
- 2026-04-12: Wave A step 3 complete for `apps/desktop/electron/ipc`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/ipc/{facts.md,plan.md}` (high: `any`/`as any` type escape hatches in core IPC handlers).
- 2026-04-12: Wave A step 4.1 complete for `apps/desktop/electron/features/workspace`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/features/workspace/{facts.md,plan.md}` (top findings: near-cap manager + silent cleanup error swallowing).
- 2026-04-12: Wave A step 4.2 complete for `apps/desktop/electron/features/agent`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/features/agent/{facts.md,plan.md}` (module is mostly healthy; main cleanup is `image-agent.ts` typing/dead global bridge).
- 2026-04-12: Wave A step 4.3 complete for `apps/desktop/electron/features/container`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/features/container/{facts.md,plan.md}` (highs: unauthenticated 0.0.0.0 proxy exposure + scanner/bridge lifecycle leaks).
- 2026-04-12: Wave A step 4.4 complete for `apps/desktop/electron/features/apps`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/features/apps/{facts.md,plan.md}` (highs: app-state watcher bootstrap/refcount race + `any` escape hatches in extension helpers).
- 2026-04-12: Wave A step 4.5 complete for `apps/desktop/electron/features/plugins`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/features/plugins/{facts.md,plan.md}` (highs: plugin discovery topic drift against current docs + settings.json parse/write safety risk in plugin manager).
- 2026-04-12: Wave A step 4.6 complete for `apps/desktop/electron/shared`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/shared/{facts.md,plan.md}` (high: `settings-helpers` parse-fallback + write paths can clobber malformed `settings.json`; medium: stale cached default model in shared infra after auth refresh).
- 2026-04-12: Wave A step 4.7 complete for `apps/desktop/electron/platform`. Findings + plan documented at `docs/deslopify/apps/desktop/electron/platform/{facts.md,plan.md}` (high: production CSP currently allows broad inline script/frame sources; medium: extension protocol registry missing uninstall symmetry + duplicated builtin-package detection logic).
- 2026-04-12: Wave A step 3.1 complete for `apps/desktop/src/stores`. Findings + plan documented at `docs/deslopify/apps/desktop/src/stores/{facts.md,plan.md}` (high: optimistic destructive actions can desync renderer/main state when close IPC fails; medium: near-cap `agent.ts`/`app.ts` orchestration hubs).
- 2026-04-12: Wave A step 3.2 complete for `apps/desktop/src/hooks`. Findings + plan documented at `docs/deslopify/apps/desktop/src/hooks/{facts.md,plan.md}` (top findings: overloaded `useSessionAgent` orchestration + unbounded workspace file cache map).
- 2026-04-12: Wave A step 3.3 complete for `apps/desktop/src/lib`. Findings + plan documented at `docs/deslopify/apps/desktop/src/lib/{facts.md,plan.md}` (high: federated component load failure can stick as cached null render without retry).
- 2026-04-12: Wave B synthesis complete. Cross-cutting themes and grouped High-only `fix-slop` batches documented in `docs/deslopify/apps/desktop/plan.md` (B1 IPC contract hardening; B2 settings/discovery safety; B3 runtime lifecycle correctness; B4 security boundary hardening). `apps/desktop/electron/features/workspace`, `apps/desktop/electron/features/agent`, and `apps/desktop/src/hooks` currently have no High items and are deferred to the first Medium wave unless execution uncovers new Highs.
- 2026-04-12: Wave B High fixes implemented across core contracts/runtime/security. Highlights: `src/types/ipc.ts` reduced below 500 LOC via `src/types/user-feedback.ts`; preload compile-time API conformance guard added; IPC/app-extension `any` escape hatches removed; plugin discovery tag updated to `sero-agent-plugin`; settings parsing made non-destructive/fail-fast in shared + plugin flows; container proxy/scanner lifecycle hardened; production CSP narrowed; destructive store actions now IPC-success gated; federation remote load failure now retryable. Monorepo `pnpm typecheck` passes.
- 2026-04-12: Wave C step 4 complete for `apps/desktop/src/components/apps/explorer`, `apps/desktop/electron/features/editor`, and `apps/desktop/src/lsp`. Facts + plans added under `docs/deslopify/apps/desktop/**`; index refreshed. Headline findings: explorer runtime ownership is pooling in `ExplorerWorkspace.tsx`/`EditorPanel.tsx`, `LspManager.startServer()` is not concurrency-safe during in-flight startup, and `src/lsp/use-lsp.ts` still uses an inline `import('monaco-editor')` type expression plus duplicated routing metadata.
- 2026-04-12: Wave C step 5 complete for `apps/desktop/src/components/layout`. Facts + plan added at `docs/deslopify/apps/desktop/src/components/layout/{facts.md,plan.md}`; index refreshed. Headline findings: `components/layout` has become a shell catch-all with 88 files / 15.9k LOC, remote-origin publishing is duplicated between workspace and titlebar flows, and several theme/collaboration helpers still perform render-phase side effects.
- 2026-04-12: Wave C step 6 complete for `apps/desktop/src/components/profiles`, `apps/desktop/electron/features/onboarding`, `apps/desktop/electron/features/profile`, and `apps/desktop/electron/features/auth`. Facts + plans added under `docs/deslopify/apps/desktop/**`; index refreshed. Headline findings: `OnboardingWizard.tsx` has become a near-cap renderer orchestration hub, onboarding preflight still mutates settings on a state-read path and imports IPC internals, malformed `profiles.json` currently degrades to an empty registry, and GitHub auth still falls back to base64-only token persistence when secure storage is unavailable.
- 2026-04-12: Wave C step 6 continued for `apps/desktop/electron/features/vcs`, `apps/desktop/electron/features/subagent`, `apps/desktop/electron/features/gateway`, and `apps/desktop/electron/features/collaboration`. Facts + plans added under `docs/deslopify/apps/desktop/electron/features/**`; index refreshed. Headline findings: VCS still relies on `git-runner.ts` type escapes and renderer-owned shared contracts, subagent bulk aborts do not currently update tracker state, gateway auth remains flat-scoped across all workspaces and Discord `/sero abort` is a no-op, and collaboration synthesis prompts are still effectively unbounded while specialist failures are masked as placeholder text.
- 2026-04-12: Wave D section 7 completed. High-priority fixes landed for `electron/features/editor`, `src/lsp`, `electron/features/profile`, `electron/features/auth`, `electron/features/vcs`, `electron/features/subagent`, and `electron/features/gateway`; the remaining section-7 folders had no High findings and were explicitly deferred to the Medium wave. Monorepo `pnpm typecheck` passes.
- 2026-04-12: Wave E batches defined in dependency order. Completed E1 preload contract-cap relief (`preload/api.ts` split + preload-wide `IpcChannels` import decoupling) and E2 renderer orchestration cleanup (`useSessionAgent` decomposition, debounced idle refresh, bounded workspace-file cache, agent optimistic-message/buffer cleanup). Monorepo `pnpm typecheck` passes.
