# Issue 473: Reusable, lease-based worktree pool

Tracking issue: <https://github.com/sero-labs/sero/issues/473>

## Delivery model

Keep #473 as the umbrella issue. Deliver it through three independently safe
PRs:

1. Safety foundations and the lease-aware host contract, with no slot reuse.
2. Reusable slots, process protection, reset, and capacity policy.
3. Fenced cleanup planning and an optional Admin/Git UI.

Each PR must be safe to merge and ship on its own. The pool must not reuse a
physical checkout until PR 2 proves every reuse precondition.

## Goal

Replace the one-directory-per-work-item lifecycle with a host-owned worktree
lease service. Workflow runs and Room members own immutable lease identities;
the host owns physical checkout allocation and recovery.

Keep these Sero semantics:

- Conventional fresh-task branch names from `buildBranchName()`.
- Existing PR branch checkout through `options.existingBranch`.
- Persistent Workflow and Room ownership while work is active or awaiting
  review.
- Greenfield repository bootstrap.
- Branch-backed work. Detached HEAD is not the normal consumer mode.
- Fail-closed recovery. Ambiguous work is preserved, never guessed disposable.

## Non-goals

- Bundling the Treehouse binary. Treehouse is design inspiration only.
- Jujutsu support, interactive subshells, or user shell hooks.
- Global cross-repository pruning.
- Automatic termination of arbitrary foreign processes.
- Making an Admin UI a prerequisite for the safe pool core.

## Current integration points

| File | Role |
| --- | --- |
| `apps/desktop/electron/features/git/worktree/manager.ts` | Current create, remove, list, and directory-only existence check |
| `apps/desktop/electron/features/git/worktree/exec.ts` | Git subprocess boundary |
| `apps/desktop/electron/features/git/worktree/workspace-sync.ts` | Base-ref selection |
| `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts` | Desktop Git capability wiring |
| `packages/common/src/app-runtime-git.ts` | Shared host Git contract |
| `plugins/sero-orchestrator-plugin/runtime/host.ts` | Orchestrator host seam |
| `plugins/sero-orchestrator-plugin/runtime/host-adapter.ts` | Runtime host adapter |
| `plugins/sero-orchestrator-plugin/runtime/workspace.ts` | Workflow acquisition and persisted workspace reuse |
| `plugins/sero-orchestrator-plugin/runtime/rooms/room-workspace.ts` | Room member acquisition and persisted path reuse |
| `plugins/sero-orchestrator-plugin/runtime/worktree-cleanup.ts` | Workflow release |
| `packages/extension-runtime/src/file-lock.ts` | Existing cross-process lock protocol to reuse |

## Core invariants

1. Every acquisition creates a new random `leaseId`, including reacquisition by
   the same holder in the same slot.
2. A destructive or recycling action requires the current `slotId` and exact
   `expectedLeaseId`.
3. A logical holder name is not a release fence. No compatibility wrapper may
   look up the holder's current lease and release it on behalf of an older call.
4. Pool state, Git registration, and the physical directory are independent
   evidence. Reuse requires all applicable evidence to agree.
5. Caller disposition is an intent. The host performs the final safety
   classification and may preserve instead.
6. Dirty, active, unmerged, damaged, orphaned, or unverifiable work is preserved
   by default.
7. Process detection failure means unverifiable, not idle.
8. A cleanup confirmation is fenced to the exact state that was shown to the
   user and is revalidated immediately before execution.

## Host-owned data model

### Lease

```ts
interface WorktreeLease {
  slotId: string;
  leaseId: string;
  leaseHolder: string;
  worktreePath: string;
  branchName: string;
  branchKind: 'fresh-task' | 'external-pr';
  baseRef: string;
  baseCommit: string;
  acquiredHead: string;
  prNumber?: number;
  acquiredAt: string;
}
```

`baseCommit` and `acquiredHead` are immutable evidence. A moving branch name is
not sufficient to prove disposability later.

### Slot state

Use explicit stable and transitional states:

- `available`
- `leased`
- `provisioning`
- `recycling`
- `removing`
- `dirty`
- `unmerged`
- `in-use`
- `damaged`
- `orphaned`
- `recovery-required`

Every transitional state records an operation ID, lease ID where applicable,
PID, start time, and intended next state. A crash leaves evidence that
reconciliation can classify rather than an anonymous reservation.

### Lease API

Add lease-aware operations to `AppRuntimeGitApi` and `OrchestratorHost`:

```ts
acquireWorktree(request): Promise<WorktreeLease>;
reattachWorktree(identity): Promise<WorktreeLease>;
releaseWorktree({
  slotId,
  expectedLeaseId,
  disposition,
}): Promise<ReleaseWorktreeResult>;
```

Dispositions are `recycle`, `preserve`, and `remove`. Results distinguish at
least `released`, `preserved`, `already-released`, `stale-lease`, and
`recovery-required`.

Idempotency semantics are exact:

- First release of lease L1 succeeds.
- A retry of L1 before reassignment returns `already-released` without mutation.
- After the slot is assigned lease L2, a delayed release of L1 returns
  `stale-lease` and cannot affect L2.

Retain the last released lease identity and outcome long enough to distinguish
the first two cases. Older unknown identities fail closed as stale.

The old key-based methods may remain temporarily for unmigrated legacy
checkouts, but they must not recycle pooled slots. Remove or deprecate them once
Workflow and Room consumers use the lease API.

## Repository identity and storage

- Derive repository identity from the canonical result of
  `git rev-parse --git-common-dir`, resolved to an absolute real path after
  greenfield bootstrap.
- Two Sero workspace registrations that share a Git common directory must share
  one pool authority and lock domain, or the second must be rejected with a
  clear conflict. `workspacePath` alone is not a repository identity.
- Store versioned pool state atomically. A profile-scoped repository index may
  map the canonical repository identity to its selected physical pool root.
- Physical slots remain under the selected workspace's `.sero/worktrees/`.
- Write to a unique temporary file, flush it, replace `pool.json` using the
  repository's existing platform-safe atomic replacement pattern, and clean up
  abandoned temporary files conservatively.
- Unknown schema versions, unreadable state, or failed Git enumeration make the
  repository unavailable for automatic reuse. Never substitute an empty,
  reusable pool.
- Preserve corrupt state as `pool.json.corrupt-<timestamp>` for diagnosis.

## Concurrency model

Use two related lock domains rather than holding one lock across every command:

1. A short pool-state lock, using `acquireLock`, guards every read-modify-write
   of `pool.json`.
2. A per-repository Git-mutation gate serialises registration-changing commands:
   `git worktree add`, `remove`, `repair`, and `prune`.

Acquisition and release follow a small transaction:

1. Under the state lock, validate state, choose the slot, write a transitional
   operation record, then unlock.
2. Perform network work such as fetch outside both locks.
3. Hold the Git-mutation gate only for the registration-changing command.
   Independent fetches and preparation may overlap.
4. Retake the state lock, confirm the operation ID and lease identity still
   match, and commit the resulting stable state.
5. If any command or final commit fails, preserve the checkout and leave enough
   evidence for reconciliation.

Reset commands that only touch one already registered checkout may run under
that slot's transitional reservation. `prune` and `repair` must never overlap
another registration mutation.

Do not reclaim a live lock holder. A timeout is a named error. Resolve timeout
values after the final critical sections are known.

## Git evidence and recovery

- Parse `git worktree list --porcelain -z`, not the newline-only format.
- Model `locked`, `prunable`, `detached`, and `bare` records explicitly.
- Canonicalise and containment-check every managed path.
- Reconcile all three sources independently:
  1. versioned pool state;
  2. Git worktree registration;
  3. physical `slot-*` and legacy `card-*` directories.
- A Git-listing failure blocks automatic pool use for that repository.
- Registration with no directory is `orphaned` unless a controlled repair can
  prove the intended path.
- Directory with no registration is `damaged` or `recovery-required`.
- Any disagreement in repository, slot, path, lease, branch, or expected HEAD
  is `recovery-required`.
- Run `git worktree repair <exact-path>` only from a classified, explicit repair
  action. Use `git worktree prune --dry-run` when planning stale-registration
  cleanup; never run broad prune merely because provisioning failed.

## Legacy migration

- Discover existing `card-*` directories, but never import one as `available`
  based on its name alone.
- Reattach a legacy checkout only when persisted Workflow or Room state matches
  its logical key, canonical path, Git registration, and branch.
- Give a successfully matched legacy owner a new migration lease and persist
  that identity back to the consumer before lease-aware cleanup is enabled.
- Mark unmatched, conflicting, or partially migrated checkouts
  `recovery-required` and surface them. No upgrade may delete or reassign them.

---

## PR 1: Safety foundations and lease contract

PR 1 makes the current one-checkout-per-holder lifecycle safe. It does not reuse
a physical slot for a different lease holder.

### 1.1 Immediate removal safety

- [ ] Remove the unconditional recursive `fs.rm()` fallback after failed
      `git worktree remove`.
- [ ] On failure, preserve the directory and return a classified result.
- [ ] Never delete a branch after worktree removal failed.

### 1.2 Types, state, and locks

- [ ] Add `pool/types.ts`, `pool/state-store.ts`, repository identity, state
      locking, the Git-mutation gate, and the transitional operation model.
- [ ] Version and validate every persisted field. Reject unknown versions.
- [ ] Implement platform-safe atomic replacement and conservative corrupt-state
      handling.

### 1.3 Registration and filesystem reconciliation

- [ ] Add the `--porcelain -z` parser and physical-directory enumeration.
- [ ] Replace directory-only `exists()` with a classified validation result.
- [ ] Reconcile on first use per repository and after interrupted transitions.
- [ ] Fail the repository closed if Git evidence cannot be read.

### 1.4 Lease-aware host contract

- [ ] Add acquire, reattach, and conditional release to
      `packages/common/src/app-runtime-git.ts`.
- [ ] Wire the service in `create-host.ts` and preserve all lease fields through
      `runtime/host-adapter.ts`.
- [ ] Add `slotId` and `leaseId` to `ResolvedWorkspaceContext` with a persisted
      migration.
- [ ] Add the same lease identity to `RoomMember` with a Room schema migration.
- [ ] Pass the exact lease identity from Workflow and Room cleanup paths.
- [ ] Do not implement a holder-key wrapper that resolves and releases the
      holder's current pooled lease.

### 1.5 Validated restart reattachment

- [ ] Make Workflow call `reattachWorktree()` before returning a persisted
      managed workspace context.
- [ ] Make Room call it before trusting a member's persisted worktree path.
- [ ] Prove repository identity, slot, lease, holder, path, registration,
      branch, and expected HEAD.
- [ ] Block execution and surface recovery when proof fails.

### 1.6 PR 1 tests and acceptance

- [ ] Two acquisitions by the same holder produce different lease IDs.
- [ ] L1 release, L1 retry, L2 acquisition, and delayed L1 release produce the
      exact idempotency and ABA outcomes defined above.
- [ ] Concurrent acquisitions never issue one slot twice.
- [ ] Killing the process during every transitional state yields either valid
      reattachment or `recovery-required`, never automatic reuse.
- [ ] Truncating state at every byte offset never makes ambiguous work reusable
      or removable.
- [ ] Git-listing failure blocks the repository rather than creating empty
      state.
- [ ] Registered-only, directory-only, locked, prunable, detached, and unusual
      path records are classified correctly.
- [ ] Failed Git removal leaves the directory, its contents, registration
      evidence, and branch intact.
- [ ] A Workflow and a Room member both reattach only through host validation.
- [ ] Legacy `card-*` work is either matched to its persisted owner or marked
      recovery-required.
- [ ] Existing fresh-branch, PR-branch, greenfield, Workflow, and Room behaviour
      passes with the lease contract.

PR 1 is complete and shippable with slot reuse disabled.

---

## PR 2: Reusable slots and process protection

### 2.1 Allocation and capacity

- [ ] Add reusable `slot-<n>` allocation beneath the lease service.
- [ ] Prefer a proven-safe available slot; otherwise create a slot.
- [ ] Configure retained idle capacity separately from active lease capacity.
- [ ] Do not introduce a hard default of four active leases. That would regress
      current concurrency and can block Rooms with larger editing rosters.
- [ ] If a user configures a hard active limit, return named backpressure and
      never evict a leased or unproved slot.

### 2.2 Process shutdown and detection

This is a prerequisite for first reuse, not a later cleanup enhancement.

- [ ] Ask Sero-owned terminals, agent sessions, commands, and managed dev
      servers rooted in the slot to stop.
- [ ] Wait for confirmed shutdown.
- [ ] Add `pool/process-guard.ts` with a platform adapter for remaining-process
      detection.
- [ ] On an unsupported platform or detection error, classify the slot
      unverifiable or `in-use` and preserve it.
- [ ] Never kill an arbitrary foreign process without explicit authority.
- [ ] Decide and document the supported host platforms before claiming Windows
      support.

### 2.3 Branch and checkout disposability

- [ ] Store branch provenance, base commit, acquisition HEAD, and PR identity.
- [ ] Treat requested disposition as intent; recompute safety in the host.
- [ ] Refuse reuse when tracked modifications or non-ignored untracked files
      remain.
- [ ] For a fresh local branch, prove its tip disposable against the exact
      target using ancestry or authoritative PR merge state.
- [ ] For squash or rebase merges, accept authoritative merged PR state because
      the old branch tip may not be an ancestor of the base.
- [ ] Never delete an external PR branch automatically.
- [ ] Keep an open or otherwise unmerged PR checkout leased or preserved.
- [ ] Separate branch retention from physical checkout retention. A merged PR
      checkout may be recycled while its external branch remains untouched.

### 2.4 Cache-preserving reset

- [ ] Resolve and record the exact reset target before the transition.
- [ ] Switch away from the prior branch safely, reset tracked content, and use
      `git clean -fd`, never `git clean -x`.
- [ ] Preserve ignored `node_modules`, compiler output, and local caches.
- [ ] Verify registration, branch, HEAD, clean status including untracked files,
      and preserved ignored content before marking the slot available.
- [ ] If any reset verification fails, mark recovery-required and preserve the
      checkout.

### 2.5 Fresh and existing branch integration

- [ ] Fresh tasks still use `resolvePreferredBaseRef()` and
      `buildBranchName()`.
- [ ] Existing PR work still uses validated fetch and checkout of the external
      branch.
- [ ] A branch-name collision during fresh acquisition is reattachment or
      recovery evidence. Do not blindly attach it to a new lease.

### 2.6 PR 2 tests and acceptance

- [ ] Every individual failed reuse precondition preserves the slot and reports
      its reason.
- [ ] A detected process and a process-detection failure both block reuse.
- [ ] Sero-owned shutdown is confirmed before reset starts.
- [ ] No foreign process is terminated automatically.
- [ ] A reset preserves ignored dependencies and caches while producing a clean
      checkout at the exact target.
- [ ] Fresh branches retain their current conventional names.
- [ ] External PR branches are never deleted.
- [ ] Merge commits, squash merges, rebase merges, open PRs, and local unmerged
      branches receive the intended classification.
- [ ] Active leases can satisfy the configured Workflow and Room concurrency.
- [ ] Concurrent fetches may overlap, while conflicting Git registration
      mutations do not.
- [ ] A completed safe slot is reused with a new lease ID.

PR 2 is complete only when reusable allocation is safe without relying on PR 3
or a UI.

---

## PR 3: Fenced cleanup and optional UI

### 3.1 Classified cleanup plan

- [ ] Add a read-only cleanup plan with a reason for every removable or skipped
      slot.
- [ ] Include `planId`, pool revision, creation time, and a per-slot fingerprint
      containing expected state, lease identity, path, branch, and HEAD.
- [ ] Use dry-run Git inspection where available. Planning changes no pool or
      Git state.

### 3.2 Confirmed execution without TOCTOU

- [ ] Execute only a previously returned `planId`; do not accept arbitrary slot
      paths from the renderer.
- [ ] Retake the state lock and revalidate every fingerprint immediately before
      its destructive transition.
- [ ] Skip and report any slot whose state changed after the plan was created.
- [ ] Run removal or exact-path repair through the Git-mutation gate.
- [ ] Never let an old plan remove a slot that has since been leased.
- [ ] Return a result for every planned slot: removed, skipped-stale,
      preserved, failed, or recovery-required.

### 3.3 Status and recovery API

- [ ] Expose pool status, classifications, cleanup planning, confirmed
      execution, and exact recovery actions through typed host and IPC APIs.
- [ ] Keep destructive authority in the main process. Renderer and plugin
      callers submit identities and confirmation tokens, not filesystem paths.

### 3.4 Optional Admin/Git surface

- [ ] Decide whether the status and recovery frequency justifies UI after the
      core API exists.
- [ ] If it ships, update React/Zustand, preload IPC, main-process handlers, and
      SDK types together.
- [ ] Show slot state, holder, branch, reason, and safe recovery action.
- [ ] Add user-facing docs only for surfaces that ship.

### 3.5 PR 3 tests and acceptance

- [ ] Cleanup planning mutates nothing and explains every slot.
- [ ] A lease acquired after planning makes the old fingerprint stale and the
      executor skips it.
- [ ] Branch, HEAD, path, or classification drift also blocks execution.
- [ ] Confirmed execution removes only slots that still pass the complete safety
      proof.
- [ ] Dirty, unmerged, leased, in-use, damaged, orphaned, and
      recovery-required slots are preserved.
- [ ] Renderer-supplied paths and fabricated plan IDs cannot trigger cleanup.

---

## Documentation

- [ ] Add `apps/desktop/electron/features/git/worktree/README.md` in PR 1,
      documenting repository identity, lease fencing, state transitions,
      reconciliation, and failure rules.
- [ ] Record the host-owned lease boundary in `ARCHITECTURE.md`.
- [ ] Document capacity and process policy when PR 2 ships.
- [ ] Add end-user recovery help only if PR 3 ships a user-facing surface.

## Cross-cutting constraints

- [ ] Keep new source files at or below 500 LOC and split by responsibility.
- [ ] Use no `any`, `@ts-ignore`, or `@ts-expect-error`.
- [ ] Use typed, discriminated outcomes rather than success booleans for
      lifecycle operations.
- [ ] Run root typecheck and the affected worktree, Orchestrator, Room, runtime,
      and integration suites before each PR is marked ready.
- [ ] Use Conventional Commits and open each implementation PR as a draft.
- [ ] Include schema migration and rollback behaviour in the PR that changes a
      persisted record.

## Issue acceptance mapping

| Issue criterion | Delivery |
| --- | --- |
| Concurrent acquisitions cannot receive the same slot | PR 1 transaction and concurrency tests |
| Stale cleanup cannot release a newer lease | PR 1 end-to-end lease contract and ABA tests |
| Crash or corrupt state never reuses ambiguous work | PR 1 reconciliation and transition fault tests |
| Unsafe worktrees are preserved by default | PR 1 validation, PR 2 process and reuse proof, PR 3 fenced cleanup |
| Reuse preserves ignored dependencies and caches | PR 2 verified reset |
| Fresh and existing PR branch workflows continue | PR 1 contract migration and PR 2 branch integration |
| Workflow and Room restarts reattach safely | PR 1 explicit host reattachment |
| Failed Git removal never causes recursive deletion | PR 1 immediate removal safety |
| Lifecycle and recovery are covered | Tests in every PR, including ABA, crash, process, merge, and TOCTOU cases |

## Decisions required before implementation

Resolve these in the PR where they first matter:

1. Supported host platforms and the process-detection adapter for each.
2. Canonical pool-state location when multiple workspace registrations share a
   Git common directory.
3. Default retained idle capacity and whether Sero exposes an optional hard
   active limit.
4. Whether operational evidence justifies an Admin/Git UI in PR 3.

## Definition of done

Issue #473 is complete when PRs 1 and 2 satisfy their acceptance lists and the
issue-level criteria. PR 3's fenced cleanup API is required for automated
destructive pruning; its visual Admin/Git surface remains optional.

No phase may rely on a later phase for its own safety guarantees.
