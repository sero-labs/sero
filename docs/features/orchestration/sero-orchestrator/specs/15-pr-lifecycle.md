# 15 — PR Lifecycle Loops

Status: **draft — direction approved 2026-07-03**.

The killer-features analysis frames the Autonomous PR Lifecycle Manager as "a
specialised bundle built on Living Loops, Graduated Autonomy, Verified
Delivery, Pluggable Delivery" — and two of those four now exist (specs 12 and
13). The GitHub adapter already emits `pr-opened`, `ci-failed`, `ci-passed`,
`issue-labelled`, `review-requested`, and `review-comment` with payloads that
name the branch, PR number, sha, and author; a fired event starts a fresh
iteration and its payload reaches every step prompt; `pr` delivery has
verified receipts; the Catalog (spec 14) is the packaging.

So this spec is **not a new subsystem**. It closes four mechanical gaps and
then authors three catalog loops on top of the existing machinery.

Example loops this enables:

```text
When CI fails on a PR I opened, diagnose the failure, fix it on the PR's own
branch, rerun validation, and push.

When a reviewer comments on one of my PRs, classify the comments, apply the
requested fixes, push, and reply.

When main moves, rebase my open Sero PRs onto it, resolve what's resolvable,
run validation, and push the updated branches.
```

## Current state and gaps

1. **Worktrees always mint a fresh branch.** `workspace.ts` keys a worktree
   per run and `WorktreeManager.create` (desktop-core,
   `electron/features/vcs/worktree/manager.ts`) always does
   `git worktree add -b <new-branch> <baseRef>`. A lifecycle loop must check
   out the PR's **own head branch**, commit, and push to it so the PR
   updates. No seam for that exists anywhere.
2. **Discrete events get dropped while a run is in flight.** Delivery is
   single-flight per loop with a *latest-wins* stash
   (`event-delivery.ts` — a busy loop overwrites `runtime.pendingEvent`).
   That was the right coalescing rule for debounced file batches (spec 12
   decision 4); it is a data-loss bug for per-PR events: CI fails on PR #12
   and #14 during one run → #12 silently vanishes.
3. **Missing event kinds.** No `pr-approved` and no `main-updated`. (Stale
   PRs and merge conflicts are handled without new kinds — see decisions 4
   and 5.)
4. **`pr` receipt verify-back assumes a *created* PR.** The reconcile matches
   PRs whose branch embeds the loop id; a lifecycle loop updates a PR it did
   not create, on a branch it did not name.

## Decisions (confirmed)

1. **Work happens on the PR's own head branch inside a managed worktree** —
   never the workspace root, never a fresh branch. A new loop workspace
   setting (`worktreeBranchSource: 'event-pr'`) makes workspace resolution
   read the target branch from the firing event. If the branch cannot be
   determined or fetched, the run **blocks visibly** — falling back to a
   fresh branch would be hollow success (the push would never reach the PR).
2. **Latest-wins becomes a small bounded FIFO queue.** `runtime.pendingEvent`
   is replaced by `runtime.pendingEvents` (cap 10, oldest dropped with a
   visible `event-queue-overflow` warning, dedupe by `source#dedupeKey`).
   Drained oldest-first, one fresh pass per event, through the existing
   `drainPendingEvent` chain. Uniform for all sources — debounce already
   coalesces the batchy ones upstream, so no per-source policy.
3. **Two new GitHub kinds via one new coarse endpoint.** `pr-approved` and
   `main-updated` both map onto the repo activity feed
   (`repos/{owner}/{repo}/events`), keeping the spec-12 anti-abuse shape: no
   per-PR fan-out, demand-driven, cursor + dedupe ring, 120s cadence floor.
   The feed can lag a few minutes; with polling that is already the latency
   class, and the adapter interface stays push-shaped for a future webhook
   transport.
4. **Stale PRs need no event kind.** Hybrid triggers (cron + event) already
   exist; a stale-PR loop is a scheduled loop whose step asks `gh` which PRs
   went quiet. Documented, zero engine change.
5. **Merge conflicts are derived, not polled.** Polling mergeable state is a
   per-PR call per poll (exactly what the anti-abuse design forbids), and
   "what to do about a conflict" is model judgement anyway. The
   rebase-on-main loop discovers conflicts when it attempts the rebase after
   a `main-updated` fire.
6. **PR pushes and PR comments stay ungated**, riding the existing `pr`
   delivery posture (dev-tool parity; Graduated Autonomy is deselected).
   Safety lives in the **trigger filter**, not a gate: the catalog loops
   default to firing only on PRs authored by the user or on Sero-created
   branches. Loops in this spec never merge a PR — merging stays human.
7. **Verified Delivery stays out** (separate future spec). v1 relies on
   planner-authored validation steps plus the existing receipt machinery,
   like everything else shipped so far.
8. **Packaging is four catalog entries** — CI fixer, review responder,
   rebase-on-main, and the Issue Implementer — authored and e2e-verified
   with the spec-14 harness. No mega-loop: one loop per event family keeps
   plans flat and the queue semantics simple. The Issue Implementer is the
   *entry point* of the bundle (it creates the PRs the other three keep
   alive) and gets its own section below.
9. **Issue claiming is a soft-lock protocol, self-healing by expiry.**
   GitHub has no atomic locks, so duplicate-effort prevention cannot be a
   guarantee — it is claim → verify → back off, with stale claims expiring
   so a crashed run never wedges an issue forever. Mechanics in the Issue
   Implementer section.

## Data model

Loop workspace settings gain one field:

```ts
interface LoopWorkspaceSettings {
  // …existing fields…
  /**
   * Where a managed worktree's branch comes from. 'new' (default) mints a
   * fresh branch per run, exactly today's behavior. 'event-pr' checks out
   * the PR branch named by the firing event; requires useManagedWorktree.
   */
  worktreeBranchSource?: 'new' | 'event-pr';
}
```

Branch resolution for `'event-pr'` is deterministic code, never heuristic:

1. `event.payload.branch` if present (`pr-opened`, `ci-failed`, `ci-passed`
   carry it);
2. else `event.payload.prNumber ?? event.payload.number` looked up in
   `host.listPullRequests()` (already available; the open-PR summaries carry
   head branch names) — this covers `review-comment`, `review-requested`,
   and `pr-approved`, whose source endpoints don't expose the head ref;
3. else — or if the lookup finds no open PR — the run records a
   `runtime-error` block naming the event and the missing field. No
   fallback branch.

Pending events:

```ts
interface LoopRuntime {
  // pendingEvent?: OrchestratorEvent   ← replaced
  /** FIFO of stashed event fires, drained oldest-first when idle. Cap 10. */
  pendingEvents?: OrchestratorEvent[];
}
```

Migration: a persisted `pendingEvent` is read as a one-element queue.

## Host seam (desktop-core)

`createWorktree` gains an options bag:

```ts
createWorktree(
  key: string,
  title: string,
  options?: { existingBranch?: string },
): Promise<WorktreeHandle>;
```

With `existingBranch`, `WorktreeManager.create`:

- fetches the branch (`git fetch origin <branch>`) so a PR pushed from
  elsewhere is present locally;
- runs `git worktree add <path> <branch>` (no `-b`), creating a local
  tracking branch when only `origin/<branch>` exists;
- errors clearly when the branch exists nowhere (surfaces as the resolution
  block above).

Worktree removal for these runs **never deletes the branch** — it is the
PR's branch, not ours. The existing per-run worktree key (`<loopId>-r<seq>`)
is unchanged: each fire gets a fresh checkout of the *current* branch tip,
which is exactly the re-entrancy the per-run-key fix bought us.

## GitHub adapter changes

New kinds in `github-kinds.ts`, two new endpoints:

```ts
{
  id: 'repo-events',
  path: 'repos/{owner}/{repo}/events?per_page=30',
  kinds: ['pr-approved', 'main-updated'],
},
{
  id: 'issues',
  path: 'repos/{owner}/{repo}/issues?state=open&sort=created&direction=desc&per_page=30',
  kinds: ['issue-opened'],
},
```

- `pr-approved`: `PullRequestReviewEvent` with `review.state === 'approved'`.
  Payload: `prNumber, prTitle, reviewer, url`.
- `main-updated`: `PushEvent` whose ref is the repo default branch. Payload:
  `branch, beforeSha, afterSha, commitCount, pusher`. Consecutive pushes
  produce distinct occurrences; the pending-event queue plus trigger
  `debounceMs` handle bursts.
- `issue-opened`: items from the issues list **excluding PRs** (the GitHub
  issues endpoint includes pull requests; entries carrying a `pull_request`
  key are dropped). Payload: `number, title, author, labels, url`.

Both entries join `EVENT_SOURCE_CATALOG` (source-catalog.ts) with their
filterable fields, so the trigger extractor and planner can author against
them — the model maps language to sources, as always.

## Receipt semantics

No new destination. `pr` delivery's verify-back is widened: a receipt is
also valid when its `ref` names an **open PR by number** in
`listPullRequests()` (an update to an existing PR), not only a PR on a
loop-named branch. The receipt `summary` states what changed ("pushed 2
commits fixing CI", "replied to 3 review comments").

## Catalog entries (the product surface)

Four entries in the official catalog, authored + verified with the spec-14
harness, each with `example-output.md`, cost band, and limitations:

| Slug | Trigger default | What it does |
| --- | --- | --- |
| `issue-implementer` | hybrid: cron sweep + `github:issue-opened` / `github:issue-labelled`, debounced | Scan open unassigned issues, claim the best candidate, classify the approach, plan when warranted, implement with tests and docs, raise a PR — full SDLC, one issue per fire (own section below) |
| `ci-fixer` | `github:ci-failed`, filtered to own/Sero branches | Fetch failing run logs via `gh`, diagnose, fix on the PR branch, run the repo's validation, push, comment the diagnosis on the PR |
| `review-responder` | `github:review-comment`, filtered to own PRs, debounced | Read the full review thread, classify comments (fix / answer / decline), apply fixes, push, reply per comment |
| `rebase-on-main` | `github:main-updated`, debounced ≥15min | List own open PRs, rebase each onto main, resolve trivial conflicts, run validation, push; report unresolvable conflicts instead of forcing them |

`ci-fixer` and `review-responder` set `worktreeBranchSource: 'event-pr'`;
`rebase-on-main` and `issue-implementer` iterate/create branches themselves
and use plain worktrees. Trigger filters scope to the user's or Sero's PRs
by default — the installer can widen them deliberately.

Together the four are the actual "autonomous PR lifecycle": the Issue
Implementer opens the PR, then CI fixer, review responder, and
rebase-on-main keep it alive until a human merges it.

## The Issue Implementer

The core entry. Its whole run is one funnel — scan → select → claim →
classify → (plan) → implement → validate → deliver — and every stage can
end the run *honestly* (explicit completion with a reason), never by
pretending success. One issue per fire, end-to-end; throughput is bounded
by the trigger cadence, which is the safety valve — no batch mode, no
parallel issues per run (that is the change-graph problem, out of scope).

**Trigger.** Hybrid: a cron sweep (default every 2 hours) works the
backlog, while `github:issue-opened` and `github:issue-labelled` fires give
instant pickup. Bursts queue in the pending-event FIFO and each drain is a
fresh pass, so a storm of new issues becomes a sequence of single-issue
runs, rate-shaped by debounce.

**Selection is model judgement, not label rails.** The scan step lists
open, unassigned issues and excludes only what is mechanically checkable:
already assigned, an open PR already linked, an active claim comment, or
already delivered by this loop (receipts from `runtime.deliveries` are in
the run context). The model then scores the remainder on clarity, size,
risk, and value, and picks one — or emits explicit completion "no suitable
issue" with the reasons. Suitability is the LLM's call (per the no-rails
rule); safety lives in the run mechanics around it.

**The claim protocol** (decision 9 — soft lock, verify, expire):

1. **Claim**: assign `@me` and post a structured claim comment (a fixed
   marker plus the loop id and timestamp). Two writes, because they serve
   different readers: assignment is what humans and other scanners filter
   on; the comment carries the identity and age that make verification and
   expiry possible.
2. **Verify**: re-read the issue *after* claiming. Proceed only if we are
   the sole assignee and ours is the only active claim comment; on a lost
   race (someone else claimed in the window), remove our assignment and
   complete the run as "skipped — claimed by someone else". GitHub allows
   multiple assignees, so claim-then-verify is the only honest protocol;
   the race window is seconds wide and a collision costs one skipped run,
   not duplicate code.
3. **Expire**: a claim with no linked open PR after 24 hours is stale, and
   later sweeps may reclaim the issue. This is the self-healing half:
   recovery prompts tell a failing run to release its claim (unassign +
   status comment), but a crashed run can't be trusted to clean up — expiry
   is the durable backstop, so no issue stays wedged.
4. **Resolve**: the PR body carries `Closes #N` and the run comments the PR
   link on the issue, closing the claim's lifecycle. From here the other
   three loops own the PR.

**Route shape** (spec-05 judge step): after claiming, a classify step
routes the work — *implement now* (small and clear; skips the planning
step), *plan first* (authors an implementation plan step before code),
*needs clarification* (posts concrete questions on the issue, releases the
claim, completes), or *decline* (product decision or too big; comments why
with a suggested breakdown, releases the claim, completes). Clarify and
decline are first-class outcomes, not failures — an issue tracker full of
good questions beats one full of wrong PRs.

**Implementation and delivery.** Managed worktree with a fresh branch
(`worktreeBranchSource: 'new'` — this loop creates PRs, it doesn't join
them). Tests and docs are part of the implement/plan routes where the
classify step deems them applicable, followed by the repo's validation
step. Delivery is `pr` with the existing verified receipt. Entry metadata
is honest: cost band high, model tier high, limitations state that it never
merges, handles one issue per fire, and declines issues needing product
decisions.

## UI

- Loop workspace settings: the existing worktree control gains the branch
  source choice, shown only for event/hybrid loops ("Work on the PR branch
  from the firing event").
- Loop detail: queued events surface as a small count with the next event's
  summary ("2 events queued — next: CI failed on PR #14").
- The overflow warning renders through the existing warning chip.

## Functional requirements

- **FR-P1** With `worktreeBranchSource: 'event-pr'`, workspace resolution
  checks out the firing event's PR branch in a managed worktree; an
  unresolvable branch blocks the run visibly — never a fresh-branch
  fallback, never workspace root.
- **FR-P2** `createWorktree` supports `existingBranch` (fetch, add without
  `-b`, track origin); removal of such worktrees never deletes the branch.
- **FR-P3** Stashed event fires queue FIFO (cap 10, dedupe by
  `source#dedupeKey`, drop-oldest records an `event-queue-overflow`
  warning) and drain oldest-first; a persisted `pendingEvent` migrates as a
  one-element queue.
- **FR-P4** `github:pr-approved`, `github:main-updated`, and
  `github:issue-opened` poll through the two new coarse endpoints under the
  existing cursor, dedupe-ring, rate-limit, and cadence-floor mechanics,
  and appear in the event source catalog with filter fields; `issue-opened`
  never emits for pull requests.
- **FR-P5** `pr` receipt verify-back accepts an update to an existing open
  PR (receipt names it by number), alongside today's created-PR match.
- **FR-P6** Stale-PR handling is documented as a hybrid-trigger pattern; no
  engine change, no `pr-stale` kind.
- **FR-P7** `issue-implementer`, `ci-fixer`, `review-responder`, and
  `rebase-on-main` ship in the official catalog, pass content validation,
  and are e2e-verified; default trigger filters scope to the user's/Sero's
  PRs; none of them merges a PR.
- **FR-P8** Docs-site orchestrator reference covers the branch source
  setting, the event queue, and the new sources in plain language.
- **FR-P9** The Issue Implementer never writes code for an issue it has not
  claimed and verified: it assigns + posts the marker claim comment,
  re-reads, and a lost race ends the run as "skipped" with the assignment
  released — e2e-verified (a pre-claimed issue produces no PR). Stale-claim
  expiry reclaims only issues carrying a Sero marker comment, never a plain
  human assignment.

## Out of scope (v1)

- Verified Delivery (independent adversarial verification) — separate spec.
- Graduated Autonomy — remains deselected; the fixed posture is decision 6.
- Merging PRs, closing PRs, or any terminal PR action.
- `merge-conflict` / `pr-stale` event kinds (decisions 4–5).
- A GitHub webhook push transport (the local `webhook:<name>` source already
  accepts one today for users who wire it; a hosted relay is future work).
- Cross-repo lifecycle management — the adapter stays scoped to the
  workspace repo's remote.
