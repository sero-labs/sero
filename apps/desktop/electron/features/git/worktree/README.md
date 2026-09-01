# Worktree lease pool

The host owns physical checkouts. Workflow runs and Room members own *leases*
— immutable identities for one acquisition of one checkout — and address the
host through `acquireWorktree`, `reattachWorktree` and `releaseWorktree`.

This document is the contract for `pool/`. It records what is proved, what is
refused, and why each rule exists. Read it before changing any lifecycle code.

## Why a lease and not a key

The previous lifecycle addressed a checkout by a logical key (`card-<id>`).
A key is not a fence. A cleanup that was scheduled for run 3 and arrives after
run 4 has started names the same key, and resets run 4's checkout. Every
acquisition therefore mints a new random `leaseId`, including a reacquisition
by the same holder in the same slot, and every destructive or recycling action
requires the exact `slotId` **and** `leaseId`.

Three release answers are distinguished, because they have different
consequences for work on disk:

| Situation | Answer | Effect |
| --- | --- | --- |
| First release of lease L1 | `released` / `preserved` | Acts |
| Identical retry of L1 before reassignment | `already-released` | No change |
| Delayed L1 after the slot took L2 | `stale-lease` | No change; L2 untouched |

The last completed releases are retained in `pool.json` (`released`, capped at
64) so the first two can be told apart. An identity older than that history
fails closed as `stale-lease`.

`checkout: removed` means the released lease's branch checkout is gone. A
successful recycle may keep the same physical directory as a detached warm
slot; it does not keep the old lease's checkout. `retained` means the old lease
still owns recoverable contents, and `unknown` means the final physical result
could not be fenced or verified.

## One resolved spelling for every path

A workspace can be opened through a symlink (`/tmp/link -> /tmp/real`). If a
comparison resolves the child but not its parent, a perfectly healthy checkout
looks like it lives outside the pool and reattachment is refused for a
repository that is entirely fine.

So the checkout root is created and resolved ONCE per workspace, at
`openPool`, and the same resolved spelling is used for allocation,
persistence, enumeration, legacy adoption and containment. Slot paths are
built by joining that resolved root, never by resolving a directory that does
not exist yet — a path resolved before creation necessarily falls back to the
unresolved spelling, which is the inconsistency this avoids.

## Repository identity

`workspacePath` is not a repository identity: two Sero workspace registrations
can point at one clone, and a worktree of that clone is a third path over the
same object store. Identity is the canonical result of
`git rev-parse --git-common-dir`, resolved to a real path.

Pool state and **both** lock domains live in `<git-common-dir>/sero-worktree-pool/`.
Every workspace registration of one repository therefore shares one authority
and one lock domain with no index to keep in agreement. Physical slots stay
under each workspace's own `.sero/worktrees/`, and every slot records the
workspace that owns its directory.

## Concurrency

Two lock domains, never one lock held across a subprocess:

1. **Pool-state lock** (`pool.json.lock`) guards each read-modify-write of
   `pool.json`. Short critical section: validate, choose, record, unlock.
2. **Git-mutation gate** (`git-mutation.lock`) serialises the commands that
   change registration — `worktree add`, `remove`, `repair`, `prune`.

An acquisition is a small transaction:

1. Under the state lock, choose the slot and write a transitional operation
   record. Unlock.
2. Fetch and resolve refs outside both locks, so independent acquisitions
   overlap.
3. Hold the Git-mutation gate only for the registration-changing command.
4. Retake the state lock, confirm the operation id is still ours, and commit.
5. If anything fails, the checkout is preserved and enough evidence is left for
   reconciliation.

A live lock holder is never reclaimed. A timeout is a named failure
(`PoolLockTimeoutError`), not a licence to proceed.

## Evidence and states

Three independent sources: persisted pool state, Git registration, and the
directory on disk. Reuse requires all applicable evidence to agree.

Stable states: `available`, `leased`, `dirty`, `unmerged`, `in-use`,
`damaged`, `orphaned`, `recovery-required`.
Transitional states: `provisioning`, `recycling`, `removing` — each carries an
operation id, pid, start time and intended next state, so a crash leaves
evidence rather than an anonymous reservation.

Reconciliation runs when the pool is opened and only ever re-classifies. It
deletes nothing, prunes nothing, and never promotes an ambiguous slot to
`available`:

- registration and directory both gone → `orphaned`
- directory without registration → `damaged`
- registration without directory → `orphaned`
- Git reports the worktree prunable → `damaged`
- detached HEAD → `recovery-required`, except an `available` slot whose HEAD
  exactly matches its recorded prepared commit
- branch differs from the recorded branch → `recovery-required`
- Git reports the worktree locked → `in-use`
- an interrupted `provisioning` with full evidence → `leased`
- any other interrupted transition → `recovery-required`
- an unknown `slot-*` or `card-*` directory → adopted as `recovery-required`

If `git worktree list` cannot be read, the repository is **unavailable** for
pool use. It never falls back to an empty pool: "no slots" and "the slots
cannot be read" have opposite consequences for work already on disk.

`--porcelain -z` is the parsed format, because a path containing a newline
splits the newline-only format into two records and could attribute a
directory to the wrong branch. Git before 2.36 has no `-z` for this command,
so an unknown-option failure falls back to the newline format for recovery
classification. Reuse requires the path-exact NUL format and fails closed when
only the fallback is available; any other failure is unavailability.

## Allocation and retained capacity

Slots are stable numbered directories (`slot-1`, `slot-2`, ...). Acquisition
prefers the oldest `available` slot that passes every reuse proof, and creates
the next numbered slot when none does. Reservation is committed before Git or
process work starts. Every successful acquisition mints a new random lease id,
including reuse by the same logical holder.

Active leases and retained idle slots are different capacities. There is no
hard active-lease limit, so concurrent Workflow runs and Room members are not
capped at four or any other arbitrary number. The host retains at most **two**
safely prepared idle slots per repository. Once that target is full, another
proved-disposable release removes its checkout instead of evicting any leased,
retained, or unproved slot. This is a host policy constant, not a new user
setting, because the repository has no existing pool configuration surface.

## Process guard

Reuse and removal first ask the existing Sero owners of rooted terminals,
agent sessions, commands, and managed development servers to stop. An owner
resolves its stop request only after shutdown is confirmed. The host then runs
the narrow adapter in `pool/process-guard.ts` to look for any remaining process
whose working directory or open files are rooted in the slot. Remaining
processes block the operation. They are evidence only: Sero never terminates a
foreign process.

The detector supports macOS and Linux through machine-readable `lsof -F`
records. Missing `lsof`, permission errors, timeouts, failed detection, and all
other unverifiable results preserve the checkout. Windows has no native
detector in PR 2 and therefore fails closed as unverifiable; Windows checkouts
are not automatically recycled or removed. OS-specific parsing stays in the
adapter. Pool lifecycle code consumes typed `clear`, `in-use`, or
`unverifiable` results.

## Releasing

A release is refused unless the slot is `leased` **after** reconciliation.
`openPool` has already weighed the slot against Git and the filesystem, and a
matching lease id does not overrule that verdict: a detached checkout, a
changed branch, a locked or missing registration, or a directory Git has
forgotten is not disposable however sound the caller's identity is.

Classification then decides disposal, and every unknown fails closed:

| Evidence | `recycle` | `remove` | `preserve` |
| --- | --- | --- | --- |
| status unreadable | keep | keep | keep |
| uncommitted work | keep | keep | keep |
| branch comparison unreadable | keep | keep | keep |
| local tip outside target, no merged PR | keep | dispose | keep |
| open or closed-unmerged PR | keep | dispose checkout only | keep |
| exact target contains local tip | reset and retain | dispose | keep |
| authoritative merged PR | reset and retain | dispose checkout only | keep |

`recycle` is the routine end-of-run return. Caller disposition is intent, not
proof. The host recomputes cleanliness, process state, branch provenance and
disposability. A fresh branch is disposable when its current tip is an ancestor
of the exact reset target, covering merge commits, or when the authoritative PR
record says merged, covering squash and rebase merges. An external PR branch
requires authoritative merged evidence; open, closed-unmerged, and unknown all
preserve it. A safely merged external checkout may be recycled, but its branch
is never deleted. A proved-disposable fresh local branch is deleted with an
atomic expected-tip fence after the checkout leaves it.

`remove` is explicitly authorised
disposal — a user deleting the loop — so committed work no longer blocks the
checkout's removal; the branch itself still survives unless the caller asked
for its deletion, and a pull-request branch is never deleted at all.

## Cache-preserving reset

Before a recycling transition is persisted, the host resolves and records the
preferred base ref and its exact commit. It then confirms owned shutdown and
foreign-process absence, switches the checkout to that exact commit in detached
mode, resets tracked content, and runs `git clean -fd`. It never runs
`git clean -x`, so ignored dependencies, compiler output, and local caches stay
on disk. The host verifies registration, detached branch state, exact HEAD,
clean tracked and non-ignored-untracked state, and continued existence of every
ignored path observed before reset. Only then can the slot become `available`.
Any failed command or verification leaves the checkout and its lease evidence
in `recovery-required`; a partly reset checkout is never allocatable.

**A preserved checkout keeps its lease.** Clearing it would leave work on disk
that no consumer names and no pool record owns, at exactly the moment the
consumer moves on to its next run. The slot stays `leased` to the same holder
— the issue's "preserve lease and checkout" outcome — with the reason
recorded, so no later acquisition can take it. Only a completed removal ends
ownership. On the consumer's side, a Workflow run that is re-armed carries a
`preservedWorktrees` record naming the slot, lease, path, branch and the
host's own reason, so the loop keeps a reference to work it is no longer
using. Live references are not capped. Deleting the Workflow releases the
current lease and every preserved lease, and keeps the Workflow record when
any release is refused so the remaining checkout stays recoverable.

## State file

`pool.json` is versioned (`POOL_SCHEMA_VERSION`) and every field is validated
on read — a truncated write can still parse as JSON, and `{"slots":[]}` is a
valid document and a catastrophic lie. An unknown version, an unreadable file,
or one failed field makes the repository unavailable; the bytes are copied
aside as `pool.json.corrupt-<digest>` and the unreadable file is left in place,
so later reads reach the same fail-closed answer instead of finding a
conveniently empty directory.

Field shapes alone are not enough. A slot and the lease inside it each carry
an id, a path and a branch, and a file where those disagree is syntactically
perfect and semantically a lie: reattachment hands back a path, while
reconciliation proved a different one. Validation therefore also enforces the
relationships — `lease.slotId` and `lease.worktreePath` match the slot's, the
slot and its lease agree about branch and branch kind, a `leased` slot holds a
lease, an operation record and a last-release record belong to the enclosing
slot, and no two slots share a path or a live lease id. One disagreement
rejects the whole file.

Writes go to a unique temporary file in the same directory, are flushed, and
replace the target by rename.

PR 2 uses schema version 3. It records pull-request identity on the immutable
lease, the exact reset target on a recycling operation, and the verified
prepared HEAD on an available slot. Version 2 migrates only by adding null
fields and never promotes a checkout to available. A shape that cannot satisfy
the version 3 invariants, or any unknown version, remains unavailable.

## Reattachment

A persisted path is a memory, not a proof. Before a run or a member is allowed
back into a checkout, the host proves repository identity, slot, lease, holder,
path containment, Git registration and branch. Anything unproved returns
`recovery-required`, which blocks execution: the Workflow run reports a
blocked reason, and Room start fails rather than placing the member somewhere
else.

HEAD is deliberately **not** a fence for a live lease. Work advances HEAD, and
amends and rebases move it without losing anything, so demanding the
acquisition HEAD would reject exactly the healthy case reattachment exists to
serve. `acquiredHead` and `baseCommit` stay immutable evidence for judging
disposability at release, where they are the right question.

## Legacy `card-*` checkouts

A pre-pool checkout is never imported as `available` on the strength of its
name. It is adopted only through a `legacy` reattach request, and only when Git
registration and branch agree with what the consumer persisted. The adopted
lease is labelled `external-pr`, because a pre-pool checkout's provenance is
unknown and that label is the one that makes cleanup refuse. Unmatched
directories stay `recovery-required`; no upgrade deletes or reassigns them.

## Removal

`git worktree remove` failing is Git reporting that it cannot prove the
checkout disposable. The old code answered that with
`fs.rm(path, { recursive: true, force: true })`, destroying the work the
refusal was protecting. That fallback is gone. A failed removal preserves the
directory, its contents and its branch, and classifies the slot `damaged`.

The lease path never passes `--force`: cleanliness is proved first with
`git status --porcelain --untracked-files=all` (which ignores `node_modules`
and build output, as Git's own check does), so a refusal after that is new
information and must be respected rather than overridden.

An `external-pr` branch is never deleted, whatever the caller asked for.

## Cleanup planning and confirmation

Cleanup is a two-step host operation. `getWorktreePoolStatus` and
`createWorktreeCleanupPlan` inspect validated pool state, exact Git worktree
registration, the filesystem, branch and HEAD evidence, checkout cleanliness,
and process evidence. Planning does not call `openPool`, because opening may
reconcile state. It uses a read-only state-file mode and only read-only Git
commands (`worktree list`, `rev-parse`, and `status`). Git has no exact-path
dry-run for worktree removal, so planning never approximates one with a real
remove, repair, prune, reset, clean, or branch command.

Every slot receives one typed action and a reason:

- `remove`: a canonical, pool-owned, unleased `available` slot whose exact
  detached registration, prepared HEAD, filesystem, cleanliness, and clear
  process evidence agree;
- `repair/remove-missing-checkout-registration`: an unleased `orphaned` slot
  whose directory is absent and whose exact Git registration remains;
- `repair/drop-absent-slot-record`: an unleased `orphaned` slot for which both
  Git registration and the directory are absent;
- `preserve`: every leased, dirty, unmerged, in-use, damaged, transitional,
  recovery-required, conflicting, or unverifiable case.

Repairs are deliberately narrow. Registration recovery runs
`git worktree remove --force <exact-host-path>` only when the checkout is
already absent; it does not touch a branch or directory. Record recovery drops
only the exact pool record after proving no registration or directory exists.
There is no broad `git worktree prune`, automatic repair during acquisition,
filesystem deletion fallback, or branch deletion in cleanup execution.

### Plan identity and lifetime

A plan contains a random `planId`, repository identity, pool revision,
creation and expiry times, and the complete status shown to the caller. It is
kept only in Electron main-process memory for five minutes. A new plan for one
repository invalidates its older plan; at most 32 plans are held. Confirmation
is one-shot: the host consumes the token before validation or execution, so a
failed, stale, or successful confirmation cannot be replayed. Fabricated,
expired, already-used, and restart-lost identifiers all fail closed and require
a fresh plan.

The renderer submits only a workspace identity and a host-issued `planId`. A
plugin runtime is already bound by main to its registered workspace and submits
only the token. Main resolves the canonical workspace and every slot path from
host state. No caller supplies a filesystem path, replacement fingerprint, Git
command, recovery kind, or branch deletion authority.

### Fingerprint and TOCTOU fence

Each slot fingerprint compares all of these fields exactly:

- repository, slot, and lease identity;
- slot state, canonical slot path, and owning canonical workspace path;
- branch name and kind, checkout HEAD, prepared HEAD, and any recorded reset
  target;
- registration classification, HEAD, branch, detached and bare flags, and the
  exact locked and prunable flags and reasons;
- filesystem, cleanliness, process, and final cleanup classification.

The plan revision proves which complete pool snapshot was reviewed. The slot
fingerprint catches external Git, filesystem, process, HEAD, branch, path, and
classification drift that can happen without a pool write. Execution first
checks both. It then takes the state lock and atomically reserves an accepted
slot with a new operation id before releasing the lock. No Git or process
command runs under that lock. After owned-process shutdown, the host re-reads
all external evidence and checks the reservation again immediately before the
exact-path operation. Registration changes run through the Git-mutation gate.

Each successful slot is committed before the next slot begins. The executor
tracks revision increments caused by its own reservations and final commits;
an unrelated revision change makes remaining actions stale. Results report one
of `removed`, `repaired`, `skipped-stale`, `preserved`, `failed`, or
`recovery-required` for every planned slot when execution completes.

### Crash behaviour

A crash after plan creation loses the in-memory token and changes nothing. A
crash after confirmation but before reservation consumes the token and changes
no slot. After reservation, process shutdown, or during Git work, the persisted
`removing` operation prevents allocation. Reconciliation never turns an
interrupted removal into `available`.

If physical removal succeeds but the final pool write does not, the slot stays
transitional and restart reconciliation marks it `recovery-required`; the host
does not infer success from a missing directory alone. Manual recovery is
acceptable for this ambiguous case. Earlier slots in a multi-slot plan remain
committed even when a later action fails or the process crashes.

### UI and schema decision

PR 3 does not add an Admin/Git screen. Current evidence does not show cleanup
or recovery occurring often enough to justify a permanent operational surface,
and Admin is profile-global while the existing Git app is a concise
workspace Git client. Adding UI now would enlarge both without proving the
workflow. The typed app-runtime and renderer IPC boundary remains available
for a later contribution-based surface if operational evidence changes.

Plans are transient and cleanup uses existing slot states and operation
records, so the persisted shape does not change. Schema version 3 remains
current. Version 2 migration and unknown-version rejection keep their existing
fail-closed behaviour.
