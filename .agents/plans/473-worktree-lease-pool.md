# Issue 473 — Reusable, lease-based worktree pool

Tracking issue: <https://github.com/sero-labs/sero/issues/473>

## Goal

Replace the one-directory-per-work-item worktree lifecycle with a pooled lease
service. Logical consumers (Workflow runs, Room members) lease a physical slot.
They do not own a fixed directory.

Keep these Sero semantics unchanged:

- Conventional branch names from `buildBranchName()`.
- Existing PR branch checkout (`options.existingBranch`).
- Persistent workflow and Room ownership of a checkout.
- Greenfield repository bootstrap.
- Branch-backed work. Detached HEAD is not the normal mode.

## Non-goals

- Bundling the Treehouse binary. Treehouse is design inspiration only.
- Jujutsu support, interactive subshells, user shell hooks.
- Global cross-repository pruning.
- Automatic termination of foreign processes.

## Current state

| File | Role |
| --- | --- |
| `apps/desktop/electron/features/git/worktree/manager.ts` | `WorktreeManager.create/remove/list/exists` (360 LOC) |
| `apps/desktop/electron/features/git/worktree/exec.ts` | `execWorktreeGit` |
| `apps/desktop/electron/features/git/worktree/workspace-sync.ts` | `resolvePreferredBaseRef` |
| `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts` | Wires `git.createWorktree` / `git.removeWorktree` |
| `packages/common/src/app-runtime-git.ts` | `AppRuntimeGit` contract |
| `plugins/sero-orchestrator-plugin/runtime/host.ts` | `OrchestratorHost` worktree contract |
| `plugins/sero-orchestrator-plugin/runtime/workspace.ts` | Fresh and PR checkout acquisition |
| `plugins/sero-orchestrator-plugin/runtime/rooms/room-workspace.ts` | Room member checkouts |
| `plugins/sero-orchestrator-plugin/runtime/worktree-cleanup.ts` | Release after an iteration |
| `packages/extension-runtime/src/file-lock.ts` | Existing cross-process lock protocol to reuse |

Known defects to correct: directory-only `exists()`, recursive delete after a
failed `git worktree remove`, no lifecycle lock, no lease identity, and no
persisted pool state.

---

## Phase 1 — Safety foundations

Make the current lifecycle safe. Do not change the pool shape yet.

### 1.1 Lease identity and state model

- [ ] Add `apps/desktop/electron/features/git/worktree/pool/types.ts` with
      `WorktreeLease`, `SlotState`, and `SlotRecord`.
- [ ] Define slot states: `available`, `leased`, `dirty`, `unmerged`,
      `in-use`, `damaged`, `orphaned`, `recovery-required`.
- [ ] Give each acquisition a new random `leaseId` from `randomUUID()`, also
      when the same holder reuses the same slot.
- [ ] Record `slotId`, `leaseId`, `leaseHolder`, `worktreePath`, `branchName`,
      `baseRef`, and `acquiredAt` in the lease.

### 1.2 Atomic pool state

- [ ] Add `pool/state-store.ts`. Store per-repository state at
      `.sero/worktrees/pool.json`.
- [ ] Write with temporary-file plus `rename()` replacement.
- [ ] Version the state file. Reject an unknown version instead of guessing.
- [ ] On truncated or unparsable state, keep the file as
      `pool.json.corrupt-<timestamp>` and start an empty state.
- [ ] Mark every slot rebuilt from Git alone as `recovery-required`. Do not
      reuse or delete it.

### 1.3 Cross-process lifecycle lock

- [ ] Extract the lock protocol of `packages/extension-runtime/src/file-lock.ts`
      into a shared helper, or import it directly. Do not write a second
      lock implementation.
- [ ] Hold the lock across acquire, release, prune, and every destructive
      transition.
- [ ] Give the lock a timeout. Report a wedged holder as an error. Do not
      break the lock.

### 1.4 Real worktree validation

- [ ] Add `pool/git-registration.ts`. Parse `git worktree list --porcelain`.
- [ ] Replace `WorktreeManager.exists()` with a check of the Git registration
      and the directory together.
- [ ] Classify a registered worktree with a missing directory as `orphaned`.
- [ ] Classify a directory with no registration as `damaged`.

### 1.5 Conditional and safe release

- [ ] Add `releaseWorktree({ slotId, expectedLeaseId, disposition })` with
      dispositions `recycle`, `preserve`, and `remove`.
- [ ] Ignore a release whose `expectedLeaseId` does not match the current
      lease. Return an explicit `stale-lease` outcome.
- [ ] Make release idempotent. A repeated release of the same lease succeeds.
- [ ] Remove the `fs.rm(worktreePath, { recursive: true })` fallback in
      `manager.remove()`. After a failed `git worktree remove`, mark the slot
      `damaged` and preserve the directory.

### 1.6 Restart reconciliation

- [ ] Add `pool/reconcile.ts`. Compare persisted state with
      `git worktree list --porcelain` at first pool use per repository.
- [ ] Reattach a persisted lease when the slot, path, and branch all agree.
- [ ] Mark every disagreement as `recovery-required`.
- [ ] Run controlled `git worktree prune` only for registrations the state
      proves are ours and have no lease.

### 1.7 Phase 1 tests

- [ ] Unit: lease identity is new for each acquisition.
- [ ] Unit: a stale `leaseId` cannot release a newer lease (ABA race).
- [ ] Unit: a truncated state file gives `recovery-required`, not reuse or
      deletion.
- [ ] Unit: a failed `git worktree remove` never deletes the directory.
- [ ] Integration: two concurrent acquisitions never get the same slot.
- [ ] Integration: restart reattaches to the correct checkout.

---

## Phase 2 — Reusable pool

### 2.1 Slot allocation

- [ ] Add `pool/lease-service.ts` with `acquireWorktree(request)` and
      `releaseWorktree(...)`.
- [ ] Name slots `slot-<n>`. Store them under `.sero/worktrees/`.
- [ ] Keep the existing `card-<id>` directories readable for one release, so
      an upgrade does not lose an in-flight checkout. Adopt each one as a slot.
- [ ] Reserve a slot inside the lock before any Git work. A reserved slot is
      not reusable.
- [ ] Add a configurable per-repository pool limit. Default it to a small
      number, for example 4. Create a new slot only below the limit.
- [ ] Fail with a clear error when the pool is full and no slot is reusable.

### 2.2 Reuse safety proof

- [ ] Add `pool/reuse-safety.ts`. Prove every condition before reuse:
      unleased, not reserved, no active process, clean including untracked
      files, valid Git registration, and safely disposable against the exact
      reset target.
- [ ] Return a reason for each refusal. Fail closed and preserve the checkout
      when a condition cannot be proved.
- [ ] Treat an unmerged branch as not disposable.

### 2.3 Slot reset that keeps caches

- [ ] Add `pool/reset.ts`. Reset with `git checkout`, `git reset --hard`, and
      `git clean -fd` limited to tracked and non-ignored paths.
- [ ] Do not use `git clean -x`. Ignored `node_modules`, build output, and
      caches must survive a reset.
- [ ] Verify the reset result before the slot returns to `available`.

### 2.4 Branch integration

- [ ] Route a fresh task through `resolvePreferredBaseRef()` plus
      `buildBranchName()`, as today.
- [ ] Route PR work through the existing fetch-and-checkout path of
      `createAtExistingBranch()`. Keep its branch name validation.
- [ ] Never delete a branch that came from an external PR.

### 2.5 Consumer migration

- [ ] Extend `AppRuntimeGit` in `packages/common/src/app-runtime-git.ts` with
      the lease API. Keep `createWorktree` and `removeWorktree` as thin
      wrappers over a lease, so plugins need no immediate change.
- [ ] Update `create-host.ts` to construct the lease service per workspace.
- [ ] Persist `slotId` and `leaseId` in the orchestrator workspace context in
      `plugins/sero-orchestrator-plugin/runtime/workspace.ts`.
- [ ] Persist the same identity for each Room member in
      `rooms/room-workspace.ts`.
- [ ] Pass `expectedLeaseId` from `worktree-cleanup.ts` and `coordinator.ts`.
- [ ] Map each lifecycle outcome of the issue table to a disposition:
      merged is `recycle`, unmerged is `preserve`, cancelled and clean is
      `recycle`, cancelled and dirty is `preserve`.

### 2.6 Phase 2 tests

- [ ] Unit: reuse refuses each unsafe condition and gives the reason.
- [ ] Unit: reset keeps an ignored `node_modules` directory.
- [ ] Integration: a fresh task branch and a PR branch both still work.
- [ ] Integration: a completed and merged slot is reset and leased again.

---

## Phase 3 — Process lifecycle and cleanup

### 3.1 Sero-owned shutdown

- [ ] Before `recycle` or `remove`, stop Sero-owned terminals, agent sessions,
      and managed dev servers rooted in the worktree. Use the runtime manager
      in `apps/desktop/electron/features/workspace/runtime/`.
- [ ] Wait for confirmation of shutdown. Do not assume success.

### 3.2 Remaining-process detection

- [ ] Add `pool/process-guard.ts`. Detect processes whose working directory is
      inside the worktree. Use `lsof` on POSIX and the equivalent on Windows.
- [ ] Classify the slot as `in-use` and refuse the recycle when a process
      remains, or when detection itself fails.
- [ ] Never kill a foreign process automatically.

### 3.3 Cleanup planning

- [ ] Add `pool/cleanup-plan.ts`. Produce a classified plan. Give a reason per
      slot for removable or skipped.
- [ ] Make the plan read-only. Require a separate confirmed call to run a
      destructive prune.
- [ ] Run stale-registration repair before provisioning, under the lock.

### 3.4 Admin surface

- [ ] Add IPC channels for pool status, cleanup plan, and confirmed prune in
      `apps/desktop/src/types/ipc-channels.ts` and `src/types/ipc.ts`.
- [ ] Update all four layers together: React component and Zustand store,
      preload IPC, main-process handler, and Pi SDK.
- [ ] Show slot state, holder, branch, and the recovery action in the Git or
      Admin view. Persist any view state through `persistLayout()`.

### 3.5 Phase 3 tests

- [ ] Unit: a detected process blocks the recycle.
- [ ] Unit: a detection failure blocks the recycle.
- [ ] Unit: the cleanup plan skips dirty, unmerged, leased, and damaged slots.
- [ ] Integration: a confirmed prune removes only planned slots.

---

## Documentation

- [ ] Add `apps/desktop/electron/features/git/worktree/README.md`. Describe
      the lease protocol, the slot states, and the recovery rules.
- [ ] Record the host-owned pool boundary in `ARCHITECTURE.md`.
- [ ] Add user-facing pool and recovery help to `apps/docs-site/docs/` if the
      Admin surface ships.

## Constraints

- [ ] Keep every new source file at or below 500 LOC. Split the lease service
      by responsibility: types, state store, lock, safety, reset, cleanup.
- [ ] Use no `any`, `@ts-ignore`, or `@ts-expect-error`.
- [ ] Run `pnpm typecheck` from the monorepo root before every commit.
- [ ] Use Conventional Commit messages. Open the pull request as a draft.

## Acceptance criteria from the issue

- [ ] Concurrent acquisitions cannot receive the same slot.
- [ ] A stale cleanup request cannot release a newer lease.
- [ ] A crash or truncated state file never reuses or deletes an ambiguous
      checkout.
- [ ] Dirty, unmerged, leased, active, damaged, and unverifiable worktrees are
      preserved by default.
- [ ] A completed slot resets and reuses without deleting ignored dependency
      and build-cache directories.
- [ ] Fresh Sero task branches and existing PR branches continue to work.
- [ ] Workflow and Room restarts reattach to the correct checkout safely.
- [ ] Cleanup never deletes a directory only because `git worktree remove`
      failed.
- [ ] Lifecycle and recovery have unit and integration coverage, including
      concurrent allocation and ABA release races.
