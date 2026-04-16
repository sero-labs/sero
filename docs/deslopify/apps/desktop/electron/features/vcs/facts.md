# Facts — apps/desktop/electron/features/vcs

_Last reviewed: 2026-04-16_

## What this code does
This feature is the Electron-side Git/VCS service layer for Sero. It initializes repositories for workspaces, runs git/gh commands on the host or in the workspace container, creates and restores checkpoints, manages branches/remotes/push flows, and builds pull-request previews/context used by higher-level auth, publish, and kanban flows.

## Shape & metrics
- Total files: 9
- Largest file: `apps/desktop/electron/features/vcs/core/vcs-ops.ts` (442 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC):
  - `apps/desktop/electron/features/vcs/core/vcs-ops.ts` (442)
  - `apps/desktop/electron/features/vcs/core/pr-ops.ts` (438)
- External dependencies of note: Node `child_process`, workspace/container managers, GitHub auth manager, `git`, `gh`
- Upstream callers: `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/features/auth/github/repo-ops.ts`, `apps/desktop/electron/features/kanban/worktree/worktree-manager.ts`, VCS/auth tests
- Downstream dependencies: workspace checkpointing, publish/origin flows, PR draft context generation, branch naming for kanban worktrees

## Architectural notes
- This module sits on an AD-018 runtime boundary: every git/gh operation can execute on the host or through the workspace container, so success-path behavior matters more than stylistic cleanup.
- Shared VCS contracts currently flow from the renderer alias path (`@/types/vcs`) back into Electron via `support/types.ts`, which is the wrong ownership direction for a cross-process contract.
- `GitRunner` is the only place that decides whether GitHub auth should use SSH-native transport or injected HTTPS auth env vars on the host, so stale heuristics here leak into every push/PR flow.

## Runtime-sensitive surfaces
- Host/container transport selection and GitHub auth env injection must preserve current push/pull/gh behavior across both runtimes.
- Checkpoint restore semantics (`checkout`, `clean`, `add`, `commit`) are behavior-sensitive; cleanup should not silently change what files get restored or committed.
- PR preview/draft flows depend on branch naming, merge-base selection, and `gh` availability heuristics that are consumed by renderer publish UI.

## Surprising discoveries
- The feature advertises an `fs` checkpoint source but immediately rewrites it to `manual` when creating a checkpoint.
- The main-process VCS layer still imports its canonical shared types from a renderer path alias instead of a neutral shared package.
- The host SSH-availability probe is cached for the entire process lifetime, so adding/fixing SSH after app launch will not change git transport behavior until restart.

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 9 (unchanged)
- Largest file: `apps/desktop/electron/features/vcs/core/vcs-ops.ts` (442 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder

### What changed
- `git-runner.ts` now normalizes exec failures through one typed helper instead of relying on `any` reads in the SSH probe and host command path.

### Still outstanding
- Shared VCS contracts still point back into renderer-owned types.
- Checkpoint-source semantics and SSH transport cache invalidation still need a follow-up behavior pass.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 9 (unchanged)
- Largest file: `apps/desktop/electron/features/vcs/core/vcs-ops.ts` (442 LOC, unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder

### What changed
- `vcs-manager.ts` no longer rewrites `CreateCheckpointOptions.source === 'fs'` to `manual`, so filesystem checkpoints preserve truthful source metadata end-to-end.
- Added focused regression coverage in `apps/desktop/electron/__tests__/features/vcs/vcs-manager.test.ts` for filesystem checkpoint creation and log parsing behavior.

### Still outstanding
- Shared VCS contracts still point back into renderer-owned types.
- SSH transport cache invalidation remains process-lifetime and still needs the dedicated Medium follow-up.
- `vcs-ops.ts` and `pr-ops.ts` remain near-cap and still need the planned modularization pass.
- Checkpoint default descriptions still use locale-dependent timestamps (`toLocaleString()`).

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 9 (unchanged in `electron/features/vcs`)
- Largest file: `apps/desktop/electron/features/vcs/core/vcs-ops.ts` (442 LOC, unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder

### What changed
- Canonical shared VCS contracts now live in `packages/common/src/vcs.ts` and are exported from `@sero/common`.
- `apps/desktop/src/types/vcs.ts` is now a compatibility barrel that re-exports the canonical shared contracts instead of defining a parallel copy.
- Electron VCS runtime, preload/IPC boundaries, and renderer VCS consumers now import VCS contract types from `@sero/common` rather than `@/types/vcs`.

### Still outstanding
- SSH transport cache invalidation remains process-lifetime and still needs the dedicated Medium follow-up.
- `vcs-ops.ts` and `pr-ops.ts` remain near-cap and still need the planned modularization pass.
- Checkpoint default descriptions still use locale-dependent timestamps (`toLocaleString()`).

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 9 (unchanged in `electron/features/vcs`)
- Largest file: `apps/desktop/electron/features/vcs/core/vcs-ops.ts` (442 LOC, unchanged)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder

### What changed
- `git-runner.ts` now uses a TTL-based host SSH availability cache keyed by SSH key metadata signatures instead of a process-lifetime `_sshAvailable` memo.
- Added focused regression coverage in `apps/desktop/electron/__tests__/features/vcs/git-runner.test.ts` for TTL expiry re-probing and key-metadata-change invalidation behavior.
- Host transport selection semantics are preserved: successful SSH probing still keeps native SSH remotes while retaining GH auth headers for HTTPS remotes.

### Still outstanding
- `vcs-ops.ts` and `pr-ops.ts` remain near-cap and still need the planned modularization pass.
- Checkpoint default descriptions still use locale-dependent timestamps (`toLocaleString()`).

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 15 (was 9)
- Largest file: `apps/desktop/electron/features/vcs/core/vcs-ops.ts` (325 LOC, was 442)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 in this folder

### What changed
- `core/vcs-ops.ts` is now a thin façade that delegates bookmark/remote/push behavior to focused modules in `core/vcs-ops/{bookmark-ops,remote-ops,push-helpers}.ts`.
- `core/pr-ops.ts` is now a thin façade that delegates branch-state resolution, preview/diff shaping, and `gh pr create` execution/error formatting to `core/pr-ops/{state,preview,create}.ts`.
- Both former near-cap orchestration files are now well below cap pressure (`vcs-ops.ts` `442 → 325`, `pr-ops.ts` `438 → 109`) without changing public `VcsOps` / `VcsPullRequestOps` entrypoints.

### Still outstanding
- Checkpoint default descriptions still use locale-dependent timestamps (`toLocaleString()`).
