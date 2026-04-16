# Refactoring Plan — apps/desktop/electron/features/vcs

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/vcs` is functional and reasonably contained, but it carries a few sharp edges in a behavior-sensitive runtime layer: the host git runner still uses `any` escape hatches, shared VCS contracts point backwards into renderer-owned types, and checkpoint metadata has already drifted from its declared source model. The right outcome is not a rewrite; it is a targeted hardening pass that restores canonical contract ownership, removes the unsafe typing at the transport boundary, and trims the two near-cap orchestration hubs before more publish/PR logic lands.

## Issues Found (prioritized)
- **High** — `GitRunner` still uses `any` at the git transport/auth boundary — `apps/desktop/electron/features/vcs/core/git-runner.ts:37` and `apps/desktop/electron/features/vcs/core/git-runner.ts:131` use `err: any` in the SSH probe and host command execution path. This violates the monorepo's no-type-escape rule in the one module that decides how git/gh commands execute for every workspace. Effort: **S**.
- **Medium** — Canonical VCS contracts live in a renderer-owned path instead of a neutral shared module — `apps/desktop/electron/features/vcs/support/types.ts:1-17` re-exports core VCS shapes from `@/types/vcs`, which makes Electron main-process code depend on renderer-local type ownership. For a cross-process contract used by auth, kanban, and renderer UI, this is the wrong direction of dependency. Effort: **M**.
- **Medium** — Filesystem checkpoints are silently rewritten to manual checkpoints — `apps/desktop/electron/features/vcs/core/vcs-manager.ts:136-155` still defines filesystem checkpoint descriptions, but `createCheckpoint()` remaps `options.source === 'fs'` to `'manual'`. That is a behavioral mismatch, not just a naming nit: downstream UI/analytics cannot trust the stored source. Effort: **S**.
- **Medium** — ~~Host SSH transport selection is cached for the entire process lifetime — `apps/desktop/electron/features/vcs/core/git-runner.ts:19-43,102` memoizes `_sshAvailable` after the first probe. If the user adds keys, fixes their SSH agent, or changes network state after launch, VCS flows keep using the old transport decision until restart.~~ ✅ 2026-04-16 (`1bfdc4fd`) — host SSH detection now refreshes via TTL + SSH key metadata signature invalidation in `git-runner.ts`. Effort: **S**.
- **Medium** — Two orchestration files are already near the 500-LOC cap — `apps/desktop/electron/features/vcs/core/vcs-ops.ts:27-442` and `apps/desktop/electron/features/vcs/core/pr-ops.ts:28-438` both mix state resolution, command building, error formatting, and user-facing message shaping. This is still below the cap, but more publish/review features will push both files into expensive-to-review territory. Effort: **M**.
- **Low** — Default checkpoint messages are locale-dependent and non-deterministic — `apps/desktop/electron/features/vcs/core/vcs-manager.ts:136-142` uses `new Date().toLocaleString()` inside commit subjects. That makes generated checkpoint text vary by machine locale and weakens tests/automation that assume stable formatting. Effort: **S**.

## Proposed Refactoring
1. **Remove the `any` escape hatches from `GitRunner`.**
   - Replace the SSH probe fallback with a small typed error-normalization helper (`normalizeExecFileFailure`).
   - Use explicit structural reads for `stdout`, `stderr`, `code`, and `message` instead of `err: any`.
   - Keep current runtime behavior exactly the same while restoring compile-time guarantees.

2. **Move shared VCS contracts to a neutral package/module.**
   - Target structure: move renderer-safe VCS types out of `@/types/vcs` into `@sero/common` (preferred) or a dedicated shared contract module consumed by both renderer and Electron.
   - Leave `support/types.ts` as a thin Electron-specific add-on for `GitResult` and other truly main-only helpers.
   - This aligns with the repo guidance to import canonical shared contracts instead of mirroring or reaching into renderer-local types.

3. **Restore truthful checkpoint-source semantics.**
   - Decide whether `fs` checkpoints are still a real concept.
   - If they are, stop rewriting them to `manual` and preserve the declared source through create/list/restore flows.
   - If they are not, remove `fs` from `CreateCheckpointOptions` and any renderer/UI paths that still expose it.
   - Treat this as a behavioral change and verify any consumers that bucket checkpoints by source.

4. **Make SSH transport detection refreshable instead of process-global forever.**
   - Replace `_sshAvailable` with a TTL-based cache or an explicit invalidation hook tied to auth/settings changes.
   - Preserve the current “prefer native SSH when it works” behavior, but let the decision recover after the environment changes.
   - Add focused logging for transport selection so future regressions are diagnosable.

5. **Split the near-cap VCS hubs before more publish logic lands.**
   - `vcs-ops.ts`: extract remotes, bookmarks, and push helpers into focused modules.
   - `pr-ops.ts`: separate branch-state resolution, diff/preview helpers, and create-PR execution/error formatting.
   - Keep `VcsOps` and `VcsPullRequestOps` as thin composition façades so shared-infra consumers do not need broad rewiring.

6. **Stabilize generated checkpoint descriptions.**
   - Replace locale-dependent timestamps with an ISO or Sero-owned formatter suitable for commit subjects.
   - Preserve the current human-readable intent, but make output deterministic across machines.

## Benefits & Trade-offs
- Benefits: safer git transport typing, clearer contract ownership, more trustworthy checkpoint metadata, and lower risk of the VCS core turning into another near-cap orchestration bucket.
- Trade-offs: moving shared VCS types will touch both Electron and renderer imports, and checkpoint-source cleanup is a semantic change that needs UI/analytics verification.

## Dependencies & Risks
- Shared type extraction should happen in one coordinated pass with renderer VCS consumers so contracts do not temporarily fork.
- Changing checkpoint-source handling is runtime-sensitive: success-path behavior, stored metadata, and any source-based filtering must all be validated together.
- Transport-cache changes must preserve current host/container auth behavior for both `git` and `gh`, especially for SSH-vs-HTTPS remotes.

## Next Steps
1. ~~Remove the two `any` catch sites in `git-runner.ts`.~~ ✅ 2026-04-12 (`4350404d`)
2. ~~Decide whether `fs` checkpoint source still exists; either preserve it honestly or remove it from the contract.~~ ✅ 2026-04-16 (`65ebfe3a`)
3. ~~Move shared VCS contracts to a neutral shared module and update Electron/renderer imports together.~~ ✅ 2026-04-16 (`1a620e5a`)
4. ~~Make host SSH transport detection refreshable instead of process-global forever.~~ ✅ 2026-04-16 (`1bfdc4fd`)
5. Split `vcs-ops.ts` and `pr-ops.ts` before adding more publish/PR behavior.
6. Verification checklist:
   - Push from both SSH and HTTPS GitHub remotes on host and container-backed workspaces.
   - Create/list/restore checkpoints and verify source metadata shown to the renderer stays correct.
   - Build PR preview context, create a PR, and confirm `gh` error handling stays unchanged.

## Execution log
- 2026-04-16 — `1bfdc4fd` — `refactor(desktop): refresh vcs host ssh transport probe caching`
  - Replaced process-lifetime host SSH probing with a TTL + SSH key metadata signature cache and added focused regressions for TTL expiry + key-change invalidation behavior.
- 2026-04-12 — `4350404d` — `fix(desktop): harden wave d high-priority runtime paths`
  - Replaced the remaining `any`-typed git transport error paths in `git-runner.ts` with a shared typed exec-failure normalizer.
- 2026-04-16 — `65ebfe3a` — `fix(desktop): preserve filesystem vcs checkpoint source`
  - Stopped rewriting `fs` checkpoint sources to `manual` in `vcs-manager.ts` and added focused VCS manager regressions to lock filesystem source create/list behavior.
- 2026-04-16 — `1a620e5a` — `refactor(desktop): move shared vcs contracts to @sero/common`
  - Moved canonical VCS contracts into `packages/common/src/vcs.ts` and repointed Electron/preload/renderer VCS type imports (including `support/types.ts`) to `@sero/common` while keeping `apps/desktop/src/types/vcs.ts` as a compatibility barrel.
