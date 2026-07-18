# Agent Board — cross-workspace task board (design plan)

Status: **proposed**. A high-level, profile-wide board that shows all agent work
across workspaces in three columns — **Active · Needs Attention · Finished** —
with drilldown into the owning workspace and inline resolution of the things
that need the user (approvals, questions, failed steps).

Reference visual: agent-fleet kanban with per-card model, branch, token ↑/↓,
cost, files/commits, +adds −dels, live activity line, and attention badges
("Approval needed", "Contract test failed").

## 1. Why this is mostly assembly, not new infrastructure

Research across the shell, the orchestrator plugin, and the git/VCS layer shows
almost every card field and column already has a durable data source:

| Board element | Existing source |
| --- | --- |
| Columns (Active / Attention / Finished) | `LoopStatus` (`active/blocked/complete/…`) + `LoopSummary.progress` + `LoopSummary.attention` in each workspace's watched orchestrator `index.json` |
| "Approval needed", questions | `LoopAttentionInput` (incl. `kind:'approval'` gates) — resolved via `answer_input` |
| Suggestions (✦) | `LoopAttentionSuggestion[]` — resolved via `choose_suggestion` |
| Failed / blocked card state | `StepStatus` `failed/blocked/needs-revision`, `loop.runtime.block` — `retry_step`, `run_again`, `revise` |
| Tokens ↑/↓, cost | `UsageSummary` per attempt/run + lifetime aggregation (`ui/lib/usage-summary.ts`, RR-6) |
| Model chip | `StepAttempt.model` (+ planner target model) |
| Branch | `loop.runtime.workspace.resolved.branchName` |
| PR chips / links | `loop.runtime.pullRequests` (`AppRuntimePullRequestSummary`), host `sero:vcs:pr-state` |
| Files changed, ahead/behind, worktree | host VCS layer + git app state (`.sero/apps/git/state.json`, `sero:vcs:status`) |
| +adds −dels (aggregate) | `AppRuntimeGitApi.getDiffSummary` / `sero:vcs:file-diff-summary` (only field needing new aggregation) |
| Live activity line | running step titles from `runtime.stepStates` (the `LiveActivityStrip` pattern — push, no polling) |
| Live interactive sessions | shell stores are already cross-workspace: `useSessionStore`, `useAgentStore` pool, `useStreamingSessionIds()`, `window.sero.agent.onEvent` |

Per-workspace precedents already exist: the orchestrator's Home view is a
within-workspace version of exactly this board (AttentionQueue + LoopsOverview,
spec `09-ui-redesign.md`), and its `LoopsWidget`/`AttentionWidget` render fleet
status from the watched `index.json` alone.

## 2. The one real architectural gap: cross-workspace

- Orchestrator state is strictly per-workspace (`<workspace>/.sero/apps/orchestrator/`),
  one coordinator per workspace, with a main-process registry
  (`runtime/registry.ts`) as the only all-coordinators seam.
- Every federated plugin surface is handed a single `workspaceId` (the active
  one) by `useAppRuntimeMount` — `scope: "global"` only relocates the state
  file, it does not make a plugin UI cross-workspace.
- The shell's Zustand stores, by contrast, already hold all sessions/agents for
  the whole profile.

**Decision: build the board as a built-in shell app**, not a plugin — a third
entry alongside `dashboard`/`explorer` in `BUILTIN_APPS`
(`src/stores/app/shared.ts`) with a branch in `ActiveAppPanel.tsx`. It reads
global stores directly and needs no new plugin plumbing. (The alternative —
extending `AppContextValue`/`window.sero` with a cross-workspace data API so a
plugin could do it — is more plumbing for no user-visible gain; revisit only if
the board must ship outside the shell.)

Profile boundary: one profile per process is a hard platform constraint
(profile switch restarts the app). The board is **profile-wide**, not
machine-wide. Fine — that matches "everything I'm working on here".

## 3. Data flow (push-only, no polling)

```
per open workspace                            shell (renderer)
─────────────────────                         ──────────────────────────────
.sero/apps/orchestrator/index.json  ──watch──▶ useAgentBoardStore
  (LoopSummary: status, progress,              │  merge + sort into columns
   attention, usage, updatedAt)                │
.sero/apps/git/state.json           ──watch──▶ │  branch, ahead/behind,
                                               │  files, worktrees
window.sero.agent.onEvent  ───────────push───▶ │  live session cards +
useSessionStore / useAgentStore                │  streaming state
sero:vcs:* invoke (on demand per card) ──────▶ │  PR state, diff summary
```

- Workspace enumeration comes from `useWorkspaceStore`; for each open workspace
  the board watches `<workspacePath>/.sero/apps/orchestrator/index.json` via the
  existing `window.sero.appState.watch` bridge (it accepts arbitrary paths).
- Loops in workspaces that are on disk but not open can still be **listed**
  (their `index.json` is readable) but not acted on (no coordinator loaded) —
  cards render with an "open workspace to act" affordance.
- No timers. Column membership recomputes on watched-file change and agent
  events, same rule as `LiveActivityStrip`.

## 4. Column + card mapping

- **Active** — loops with `status:'active'` and a running/waiting run
  (`progress.running > 0` or recent `lastRunAt`), plus interactive sessions
  currently streaming (`useStreamingSessionIds`). Card: title, model, branch,
  ↑input/↓output tokens, cost, files/PR chips, live activity line, age.
- **Needs Attention** — any loop with an `attention` payload (questions,
  approval gates, suggestions), `status:'blocked'`, or a step in
  `failed/needs-revision`. Card adds the reason line ("Approval needed",
  "Step X failed — <reason>") and inline actions.
- **Finished** — `status:'complete'` (and per-iteration completed runs of
  recurring loops), most recent first, bounded (e.g. last 24 h / last N) with
  the usage roll-up. Click-through to run history.

Drilldown: clicking a card activates the owning workspace and opens the
orchestrator app on that loop (or focuses the session in ChatPanel for plain
session cards). The deep-link metadata pattern already exists on orchestrator
notifications ("source, workspace, and open-target metadata so the shell can
deep-link", spec `02-integration-seams.md`).

## 5. Inline actions (the "user action should be simple" part)

Reads are file-watch; writes must reach the per-workspace coordinator. The
bridged `orchestrator` tool resolves the coordinator by cwd and is
plugin-context-bound, so the shell needs one small host seam:

- New IPC `sero:orchestrator:action` → main-process handler → orchestrator
  registry (`getCoordinator(workspaceId).requestAction(action)`), exposed to
  the renderer as `window.sero.orchestrator.requestAction(workspaceId, action)`.
- Contract types go through the existing cross-plugin seam
  `packages/common/src/orchestrator-contract.ts` (already consumed by the
  Scheduler app), so the shell never imports plugin internals.
- Phase-1 board can ship click-through-only; inline `answer_input`,
  `choose_suggestion`, `retry_step`, `run_again` land with this seam.

The board adds **no second approval/permission layer** — it renders and routes
the orchestrator's existing durable actions (a non-goal of the orchestrator is
preserved).

## 6. Git enrichment details

- Branch + worktree come free from loop state; ahead/behind + files-changed
  from the git app state file / `sero:vcs:status`.
- PR chip: `loop.runtime.pullRequests` (branch-name attribution, reconciled at
  run start) + `sero:vcs:pr-state` for merge state. Non-loop sessions fall back
  to the workspace's current branch PR.
- **Aggregate +adds −dels** is the only field with no ready-made value: fetch
  on-demand per visible card via `sero:vcs:file-diff-summary` /
  `AppRuntimeGitApi.getDiffSummary` against the loop's worktree/branch, cached
  per `headHash` so it refreshes only when the ref moves (VCS fs-watchers
  already invalidate on ref change). No new git engine.

## 7. Phased implementation

1. **Board shell + orchestrator aggregation (renderer-only, no new IPC).**
   `BUILTIN_APPS` entry + `ActiveAppPanel` branch; `src/components/apps/board/`
   (each file ≤500 LOC); `useAgentBoardStore` (Zustand) watching per-workspace
   `index.json`s; three columns; click-through drilldown. Board prefs (column
   collapse, filters) persist via `layout.json` (`persistLayout`), never
   localStorage.
2. **Git enrichment.** Branch/PR/ahead-behind chips from existing state + VCS
   IPC; on-demand cached diffstat.
3. **Live sessions.** Fold in non-orchestrator agent sessions from the global
   stores + `agent.onEvent`; live activity line on active cards.
4. **Inline actions.** `sero:orchestrator:action` registry seam +
   contract-type extension; inline answer/approve/retry/run-again on attention
   cards (reusing the orchestrator UI's AttentionQueue interaction patterns and
   `@sero-ai/ui` status styling so states look identical everywhere).
5. **Remote parity (the "1 remote" header).** New gateway request/broadcast
   (`electron/features/gateway/`) serving the merged board model to
   `apps/web-remote` with a read-only board + deep links; follow-up, desktop
   first.

## 8. Constraints honored

- Push via watched files and events — no polling, no timers.
- Activity/status text is derived from durable state, not heuristics or extra
  LLM calls.
- Status visual language reuses the orchestrator's single status→style map and
  `@sero-ai/ui` tokens (one source of truth across board, widgets, loop UI).
- Shell imports plugin **contract types** only (`orchestrator-contract.ts`),
  never plugin internals.
- Files ≤500 LOC; state in Zustand; layout persistence via `layout.json`.
