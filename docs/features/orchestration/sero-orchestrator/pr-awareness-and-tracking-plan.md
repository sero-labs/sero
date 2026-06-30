# Plan: PR Awareness & Tracking for Orchestrator Loops

**Branch:** `feat/sero-orchestrator-2` (continue here; do **not** push/PR unless asked)
**Status:** Ready to implement in a fresh session.
**Derives from:** [analysis/agent-issue-loops-worktrees-jujutsu.md](analysis/agent-issue-loops-worktrees-jujutsu.md)

---

## 1. Why this, and why only this

The analysis doc argues that an agent implementing GitHub issues must not do "10 issues → 10
branches → 10 PRs from main" — it should classify, batch, stack, isolate, validate, and publish
*fewer, cleaner* PRs, optionally with Jujutsu as a local change-graph layer.

We reviewed that against what the orchestrator does **today** and concluded:

- **The conservative serial loop is already ours for free.** A recurring worktree loop creates **one
  worktree → one branch → one PR per iteration** from a fresh base, then re-arms. The doc's headline
  danger (many PRs from stale main) cannot happen in the serial shape, because recurrence processes
  one coherent unit per tick.
- **The one real gap for the issue-loop use case is awareness + tracking.** A loop cannot currently
  *see its own open PRs* before working, and the orchestrator never *records* the PRs a loop opens
  (the agent shells out `gh pr create` and the runtime never learns about it). So a recurring loop
  can redo work an open PR already covers, and the UI can't report what the loop has published.
- **Bigger ideas are deliberately deferred** (see §7): per-step worktree isolation, stacked PRs,
  runtime-mediated delivery, and Jujutsu. They solve problems we don't have yet (parallel/dependent
  multi-item work per tick) at real cost. Jujutsu in particular is a machine-wide VCS install whose
  value only appears once we manage many interdependent local changes per iteration — which we
  intentionally don't.

**This plan implements exactly the minimal high-value step:** make a loop's PRs *tracked* and make
each iteration *aware* of its own open PRs. Classification ("is this issue already covered?",
"batch vs. stack") stays in the model — we only feed it the inventory and validate format.

### Refinement vs. the original verbal recommendation

The original phrasing was "promote the push/PR/merge helpers to the orchestrator seam + add
`listOpenAgentPullRequests`." On inspection, `createPr`/`mergePr`/`pushBranch` already exist on the
desktop `AppRuntimeGitApi` and are only *consumed by the agent via shell today*. Promoting them onto
the **orchestrator** seam is only useful under **runtime-mediated delivery**, which is out of scope
here. So this plan adds exactly **one** new method to each layer — `listPullRequests` — and leaves
delivery agent-authored. That is the truly minimal set; the createPr/mergePr promotion is folded into
the deferred runtime-mediated-delivery work in §7.

---

## 2. Hard constraints (do not violate)

- **No heuristics for LLM-shaped tasks.** No code that computes file/area "overlap maps" or decides
  batching/stacking. The model classifies, given injected context; we only format-validate. The
  *only* mechanical bookkeeping allowed is "which open PRs have a branch name matching this loop" —
  that is attribution, not judgment.
- **Push model, no polling.** Reconcile PRs **when the loop runs** (cron/event-triggered), never on a
  standalone timer. Where the issue source supports it, prefer an **event/hybrid trigger** over a
  time-cron poll (the orchestrator already supports `event`/`hybrid` triggers).
- **500 LOC max per source file.** `packages/common/src/app-runtime-background.ts` is **already 566
  LOC (over budget)** — it must be split **before** adding to it (see §3 WS-0).
- Conventional Commits. Top-level imports only. Don't duplicate Pi/`@sero-ai/common` types — import
  the canonical one. Validate with `pnpm typecheck` (must stay green) + affected suites + a real run.

---

## 3. Current state (verified, with refs)

**Worktree + branch naming**
- Worktree per loop at `.sero/worktrees/card-<id>/`, branch `${type}/${slug}-${cardId}`
  ([manager.ts:92-103](../../../../apps/desktop/electron/features/vcs/worktree/manager.ts#L92-L103)).
- Orchestrator passes the **loop id** as the card id
  ([host-adapter.ts:67-69](../../../../plugins/sero-orchestrator-plugin/runtime/host-adapter.ts#L67-L69)),
  so **every branch name contains the loop id** → PRs are attributable by `headRefName.includes(loop.id)`.
  (Recurring runs may append `-r<n>` to the key; the substring match still holds. Confirm the exact
  derivation in `workspace.ts`/`manager.ts` when implementing.)

**Git seams that already exist**
- `AppRuntimeGitApi` already has `createPr`, `mergePr`, `pushBranch`, `ensureRemoteDefaultBranch`,
  `getDiff`/`getDiffSummary`, `createCheckpoint`, sync, merge-state
  ([app-runtime-background.ts:325-373](../../../../packages/common/src/app-runtime-background.ts#L325-L373)),
  wired in [create-host.ts:142-161](../../../../apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts#L142-L161).
- The **orchestrator** seam (`OrchestratorHost`) only exposes worktree create/remove + workspace
  status/stash ([host.ts:154-161](../../../../plugins/sero-orchestrator-plugin/runtime/host.ts#L154-L161)).
- **No `listPullRequests` anywhere.** This is the one new git op.

**Delivery today**
- The planner *instructs* the agent to commit + `gh pr create` as shell work
  ([planner-prompt.ts:66](../../../../plugins/sero-orchestrator-plugin/runtime/planner-prompt.ts#L66)).
  The orchestrator does not see or record the PR.

**Run lifecycle hook points**
- Run start: `RunEngine.execute()` builds the run and commits
  ([run-engine.ts:73-92](../../../../plugins/sero-orchestrator-plugin/runtime/run-engine.ts#L73-L92)) —
  the place to **reconcile PR inventory** before steps run.
- Step context is assembled in `executors/prompt.ts` (`buildStepTask`) / `executors/common.ts` —
  the place to **inject the open-PR block**.

---

## 4. Design

**Keep delivery agent-authored. Add stateless tracking + awareness around it.**

1. **One new git op — `listPullRequests`** — runs `gh pr list --state open --json
   number,url,title,headRefName,updatedAt,body` from the workspace path. Fail-soft to `[]` (no `gh`,
   no remote, no PRs), exactly like the sibling helpers. Repo-scoped, so it works before any worktree
   exists.
2. **Stateless reconciliation at run start.** `RunEngine` lists open PRs, keeps those whose
   `headRefName` contains the loop id, and stores them on `loop.runtime.pullRequests`. No
   before/after snapshot, no agent self-report: the loop *discovers* its PRs by branch match each
   run, and stale (merged/closed) ones simply drop out because they're no longer open. This also
   reflects PRs merged externally between runs.
3. **Awareness injection.** When `runtime.pullRequests` is non-empty, the step task gets an "Open pull
   requests already raised by this loop" block. The model decides whether an issue is already covered
   — we never compute overlap. For the recurring issue-loop, the first step naturally becomes "fetch
   issues, check the listed open PRs, pick the next *uncovered* one."
4. **Reporting.** The loop UI can later render `runtime.pullRequests` (out of scope to build the panel
   here; the data will simply be present).

This is non-disruptive: the execution model, worktree handling, and agent-authored delivery are
unchanged. We add one seam method, one runtime reconcile, one context block, one state field.

---

## 5. Workstreams

### WS-0 — Split `app-runtime-background.ts` (prerequisite, unblocks WS-A)
The file is 566 LOC (over the 500 limit) and we must add a type + method to its `AppRuntimeGitApi`.
- Extract the git surface — `AppRuntimeWorktree*`, `AppRuntimeCreatePullRequest*`,
  `AppRuntimeMergePullRequest*`, `AppRuntimeWorkspaceStatusResult`, `AppRuntimeDirtyWorkspaceStashResult`,
  `AppRuntimeGitApi`, etc. — into a new `packages/common/src/app-runtime-git.ts`.
- Re-export from `app-runtime-background.ts` (and `packages/common/src/index.ts`) so no import paths
  break. Keep `AppRuntimeHost` where it is; it just imports `AppRuntimeGitApi` from the new module.
- Acceptance: `app-runtime-background.ts` < 500 LOC; `pnpm typecheck` green; no consumer churn.

### WS-A — `listPullRequests` git capability (the one new op)
- **vcs helper** in
  [pull-request.ts](../../../../apps/desktop/electron/features/vcs/worktree/pull-request.ts):
  ```ts
  export interface OpenPullRequestSummary {
    number: number; url: string; title: string;
    headRefName: string; updatedAt: string; body?: string;
  }
  export async function listOpenPullRequests(
    cwd: string, opts: { author?: string } = {},
  ): Promise<OpenPullRequestSummary[]> {
    const args = ['pr', 'list', '--state', 'open',
      '--json', 'number,url,title,headRefName,updatedAt,body'];
    if (opts.author) args.push('--author', opts.author);
    try {
      const r = await execFileAsync('gh', args, { cwd, timeout: 30_000 });
      const parsed = JSON.parse(r.stdout) as OpenPullRequestSummary[];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; } // fail-soft like createPrFromWorktree
  }
  ```
- **Contract type + method** in the new `app-runtime-git.ts` (WS-0):
  `AppRuntimePullRequestSummary` (same shape) and on `AppRuntimeGitApi`:
  `listPullRequests(worktreePath: string, options?: { author?: string }): Promise<AppRuntimePullRequestSummary[]>`.
- **Wire** in [create-host.ts](../../../../apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts)
  git block: `listPullRequests: (cwd, options) => listOpenPullRequests(cwd, options)` (+ import).

### WS-B — Orchestrator host seam
- In [host.ts](../../../../plugins/sero-orchestrator-plugin/runtime/host.ts): import
  `AppRuntimePullRequestSummary` from `@sero-ai/common` (do **not** redefine) and add to
  `OrchestratorHost`:
  `listPullRequests(): Promise<AppRuntimePullRequestSummary[]>` (lists open PRs in this workspace's repo).
- In [host-adapter.ts](../../../../plugins/sero-orchestrator-plugin/runtime/host-adapter.ts):
  `listPullRequests: () => ctx.host.git.listPullRequests(ctx.workspacePath)`.
  (List all open PRs; per-loop attribution happens in WS-C by branch match. An `author: '@me'` filter
  is optional noise-reduction, not required.)
- In [fake-host.ts](../../../../plugins/sero-orchestrator-plugin/runtime/__tests__/fake-host.ts):
  add a `pullRequests: AppRuntimePullRequestSummary[]` field (default `[]`) and
  `async listPullRequests() { return this.pullRequests; }`. The fake's worktree branch is already
  `orchestrator/${loopId}` (contains the loop id) — good for testing the WS-C filter.

### WS-C — Reconcile + store on loop state
- **State**: add `pullRequests?: AppRuntimePullRequestSummary[]` to `LoopRuntimeState` in
  [shared/types.ts](../../../../plugins/sero-orchestrator-plugin/shared/types.ts)
  ("Open PRs this loop has raised — branch matches the loop id; refreshed each run start.").
  Confirm `rearmLoop` does **not** need to clear it (the next run-start reconcile overwrites it, and
  keeping it across re-arm is what gives cross-iteration awareness).
- **Reconcile** in [run-engine.ts](../../../../plugins/sero-orchestrator-plugin/runtime/run-engine.ts)
  `execute()`, right after the initial `commit` (~line 92):
  ```ts
  const open = await this.host.listPullRequests().catch(() => []);
  const mine = open.filter((pr) => pr.headRefName.includes(loop.id));
  loop = await this.commit({ ...loop, runtime: { ...loop.runtime, pullRequests: mine } });
  ```
  Keep it a small private helper to stay readable; run-engine has headroom under 500 LOC.

### WS-D — Awareness injection (planner-trust, no heuristics)
- In `executors/prompt.ts` `buildStepTask` (and any caller in `executors/common.ts`), when
  `loop.runtime.pullRequests?.length`, append a block:
  ```
  Open pull requests already raised by this loop (do not duplicate work an open PR already
  covers — judge coverage yourself):
  - #<number> "<title>" (branch <headRefName>)
  ```
  Inject for background-agent steps only (the ones that touch the repo). The model decides coverage.
- In [planner-prompt.ts](../../../../plugins/sero-orchestrator-plugin/runtime/planner-prompt.ts):
  add one sentence to `WORKTREE_DELIVERY` (or the recurring task note) telling the planner that for a
  recurring worktree loop, the **first step should review any open PRs provided in its run context and
  skip work already covered** before implementing. Keep it light — it's guidance, not a schema change.

---

## 6. Tests & validation

**Add / update**
- `apps/desktop` vcs test for `listOpenPullRequests`: parses `gh` JSON; returns `[]` on non-zero exit
  / invalid JSON (mock `execFile`). Co-locate with existing pull-request tests.
- `fake-host.ts`: `pullRequests` field + `listPullRequests` (WS-B).
- run-engine test: given scripted `host.pullRequests` with mixed branches, `execute()` stores only the
  branch-matching subset on `runtime.pullRequests`; a step's task contains the awareness block.
- A planning/executor test asserting the awareness block renders when `runtime.pullRequests` is set,
  and is absent when empty.

**Run before commit**
- `pnpm typecheck` from repo root — **must stay green (currently 18/18)**.
- Orchestrator suite (`sero-orchestrator-plugin`) + desktop electron subagent/vcs suites.
- **Real run** (the constraint that catches integration gaps): a recurring **worktree** loop that
  opens a PR. Confirm via debug logs / `state.json`:
  1. after the first run, `runtime.pullRequests` lists the opened PR (branch contains the loop id);
  2. on the next run, the step task (in `model-messages.jsonl`) contains the "Open pull requests"
     block;
  3. a PR merged/closed between runs drops out of `runtime.pullRequests` automatically.

---

## 7. Out of scope (deferred — with rationale)

- **Runtime-mediated delivery** (orchestrator runs commit/push/PR itself via the seam, instead of the
  agent shelling out). This is where promoting `createPr`/`mergePr` onto the orchestrator seam pays
  off. Deferred: it re-architects delivery; revisit only if agent-authored delivery proves unreliable
  (the run-start reconcile already makes tracking robust without it).
- **Per-step worktree isolation** — required before *any* parallel/batch/stack strategy (today all
  steps share one worktree). Real value, medium cost; its own plan.
- **Stacked PRs** (worktree-from-branch + PR-target-parent) — only after per-step isolation.
- **Jujutsu** — **not now.** Its value (reshaping many interdependent local changes before publishing)
  only appears once we do intra-iteration multi-item stacking, which we don't. It's a machine-wide VCS
  install (toolchain rules) and adds large surface for a use case we haven't committed to. Revisit
  only alongside stacking, and even then first check whether worktrees + a model-authored
  branch/PR-targeting step gets ~90% of the value.
- **Any code-computed overlap/conflict/area map** — forbidden (heuristic). Classification is the
  model's job, fed by the injected inventory.

---

## 8. Doc updates (do as part of the change)
- `specs/01-data-model.md` — add `runtime.pullRequests`.
- `specs/02-integration-seams.md` — add `git.listPullRequests` (app-runtime) and
  `OrchestratorHost.listPullRequests`.
- Add a one-line footer to `analysis/agent-issue-loops-worktrees-jujutsu.md` pointing here as the
  decided scope (and recording "Jujutsu: deferred").

---

## 9. Suggested commit sequence
1. `refactor(common): split git surface out of app-runtime-background` (WS-0)
2. `feat(vcs): list open pull requests` (WS-A)
3. `feat(orchestrator): expose listPullRequests on the host seam` (WS-B)
4. `feat(orchestrator): track each loop's open PRs by branch match` (WS-C)
5. `feat(orchestrator): make steps aware of the loop's open PRs` (WS-D + planner note)
6. `docs(orchestrator): record PR-awareness scope and seams` (§8)

Each commit: `pnpm typecheck` green + relevant suite green before moving on.
