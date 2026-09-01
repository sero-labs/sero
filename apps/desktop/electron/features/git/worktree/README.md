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
| Retry of L1 before reassignment | `already-released` | No change |
| Delayed L1 after the slot took L2 | `stale-lease` | No change; L2 untouched |

The last completed releases are retained in `pool.json` (`released`, capped at
64) so the first two can be told apart. An identity older than that history
fails closed as `stale-lease`.

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
- detached HEAD → `recovery-required` (not a Sero work mode)
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
so an unknown-option failure falls back to the newline format; any other
failure is unavailability.

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
| branch holds work the base lacks | keep | dispose | keep |
| pull-request branch | keep | dispose | keep |
| clean, nothing added to the base | dispose | dispose | keep |

`recycle` is the routine end-of-run return. `remove` is explicitly authorised
disposal — a user deleting the loop — so committed work no longer blocks the
checkout's removal; the branch itself still survives unless the caller asked
for its deletion, and a pull-request branch is never deleted at all.

**A preserved checkout keeps its lease.** Clearing it would leave work on disk
that no consumer names and no pool record owns, at exactly the moment the
consumer moves on to its next run. The slot stays `leased` to the same holder
— the issue's "preserve lease and checkout" outcome — with the reason
recorded, so no later acquisition can take it. Only a completed removal ends
ownership. On the consumer's side, a Workflow run that is re-armed carries a
`preservedWorktrees` record naming the slot, lease, path, branch and the
host's own reason, so the loop keeps a reference to work it is no longer
using.

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

## What PR 1 does not do

Slot **reuse** is disabled. `chooseSlot` in `pool/acquire.ts` always allocates
a new slot, and is the single place PR 2 changes. Reuse needs every
precondition proved first — no live process in the checkout, clean including
untracked files, valid registration, and disposability against the exact reset
target — and none of that exists yet. Until it does, no checkout is reset under
work that is still on disk.
