# VCS / Git Unification

Status: **Phase 2 — Target design (complete, awaiting approval)**. Phase 1
audit signed off. No code changes until the design below is approved.

This document maps every place the Sero desktop app touches git or GitHub, where
the same job is done twice (or six times), and what the product model implicitly
is today. It is descriptive only — no fixes are proposed here.

---

## 1. Inventory of subsystems

Seven distinct subsystems execute git or talk to GitHub. They fall into two
fundamentally different execution styles:

- **Runtime-routed**: git runs through the workspace runtime backend
  (host/container/apple), with Sero's GitHub OAuth token injected into the
  environment and SSH availability probed per workspace. Only the core layer
  does this.
- **Direct**: git/gh is spawned with `execFile` against a raw host filesystem
  path. No auth injection, no container awareness. Everything else does this.

### 1.1 Core VCS layer — `apps/desktop/electron/features/vcs/core/` (+ `support/`)

The only runtime-routed layer, and the only one with GitHub auth injection.

| Piece | What it owns |
|---|---|
| `git-runner.ts` (157) | The shared executor. Keyed by **workspaceId** → runtime backend → `runtime.execFile`. Builds git/gh auth env from `githubAuth` (SSH probe with 60s cache; falls back to `GH_TOKEN` + HTTPS extraheader). Owns `ensureRepoInitialized` (auto `git init -b main`). |
| `vcs-manager.ts` (344) | Checkpoint facade. "Checkpoints" are real commits on the current branch (`checkpoint:` message prefix); restore is a forward "restore:" commit (no history rewrite). Routes hidden turn-undo snapshots to the snapshot manager. Emits events consumed by IPC. |
| `internal-snapshot-manager.ts` (345) | Turn-undo engine. Captures the working tree via a temp index (`GIT_INDEX_FILE`) + `commit-tree` into hidden refs `refs/sero/turn-undo/*` (+ a parallel index ref). Never touches HEAD, branch, or the real index. Capped at 40 refs / 7 days. |
| `vcs-ops.ts` (374) + `vcs-ops/*` | General op surface in **jj vocabulary**: log, status, file diff, describe (amend), bookmarks (= branches), remotes, fetch/push, undo/abandon/squash (= soft/hard reset + amend), op log (= reflog), `checkoutRemote` (import a remote into an empty workspace). |
| `pr-ops.ts` (109) + `pr-ops/*` | PR state, preview (three-dot diff + existing-PR lookup), draft context, and create — all via `gh` **through GitRunner**, so authenticated with Sero's OAuth token. |
| `support/parsers.ts` (296) etc. | Centralised git stdout parsers, branch-name heuristics, bootstrap `.gitignore`. |

Instantiated once in `shared/infra/singletons.ts`. Consumers: `ipc/integrations/vcs.ts`
(~35 handlers), `ipc/agent/core/agent-checkpoint.ts` (turn undo / restore),
the checkpoint extensions (§1.3), the `sero vcs` CLI, and `GitHubRepoOps` (shares the runner).

### 1.2 Worktree layer — `apps/desktop/electron/features/vcs/worktree/` (1,722 LOC)

Plain-git helpers for **background agent worktrees** (orchestrator / kanban
loops). Direct `execFile` per file — bypasses GitRunner entirely, so no auth
injection and no container awareness, and it operates on raw paths rather than
workspaceIds.

Owns: worktree lifecycle (`manager.ts`, incl. its own auto-init with initial
commit), checkpoint commits and diffs vs base (`git.ts`), push with
force-with-lease fallback, rebase-sync with conflict-resolution callbacks
(`sync.ts`), workspace-root fast-forward sync (`workspace-sync.ts`), dirty
preflight + stash (`workspace-preflight.ts`), and all `gh`-CLI PR/issue work
(`pull-request.ts`, `merge-status.ts`): PR create/merge/list/view, issue list,
and remote default-branch mutation (`ensureRemoteDefaultBranch` can force-push
`main` and run `gh repo edit --default-branch`).

Essentially single-consumer: `features/apps/runtime/capabilities/create-host.ts`
binds the whole layer into the `git:` capability every plugin runtime receives
(this is how orchestrator loops create and merge PRs). Three IPC handlers
(`vcs:issues`, `vcs:open-prs`, `vcs:diff-stat`) also reach it for the Agent Board.

Quirks: `sync.ts` and `workspace-sync.ts` each declare their own **interface
named `GitRunner`** that is unrelated to the core `GitRunner` class (test
injection only). Default-branch detection is duplicated ~4× inside this layer
alone.

### 1.3 Agent checkpoints / turn-undo — `features/apps/extensions/git-checkpoint*`, `git-turn-undo-capture.ts`

Thin wiring over the core `VcsManager` — these files own **no git execution**.

- `git-turn-undo-capture.ts` (308): pi session hooks. On the first mutating tool
  call of a turn it captures one hidden pre-turn snapshot; at turn end, if the
  tree changed, it appends a turn-undo session entry and invalidates the git-app
  state. It also **blocks mutating git commands in agent bash** (via
  `platform/security/git-command-filter.ts`) and redirects the agent to the
  `sero vcs` CLI — so in the primary workspace, agent git is funnelled through
  the core layer.
- `git-checkpoint-commands.ts` (144): manual `/checkpoint`, `/checkpoints`,
  `/restore`, `/diffcp` commands.
- Undo is driven from `ipc/agent/core/agent-checkpoint.ts`: navigate the session
  tree, then `vcsManager.restoreCheckpoint(snapshotId)`.

### 1.4 GitHub access — two credential worlds

There are no GitHub libraries anywhere (no octokit); everything is REST `fetch`
(auth only) or the `gh` CLI. The critical split is **which credentials** a call
uses:

**World A — Sero's OAuth token.** `features/auth/github/auth-manager.ts` runs
GitHub Device Flow (scopes `repo read:org`), stores the token encrypted via
Electron `safeStorage` at `SERO_AGENT_DIR/github-auth.json`. The token reaches
git/gh **only** through `GitRunner.buildGitEnv` (and container extra-env). Users
of World A: `repo-ops.ts` (repo create, default-branch edit, repo view), core
`pr-ops` (titlebar/explorer PR state/preview/create).

**World B — the user's ambient `gh auth login`.** Direct `execFile('gh', …)`
with no env injection: the worktree layer's `pull-request.ts`/`merge-status.ts`
(Agent Board, orchestrator PR create/merge), `sero-web-plugin`'s
`github-api.ts`/`github-extract.ts` (repo metadata + shallow clone for URL
extraction), and the orchestrator's `gh api` event polling.

**World C — unauthenticated.** `features/plugins/discovery.ts` hits
`api.github.com/search` with no token (60 req/hr anonymous limit), even when a
token is available.

Consequence: a user signed into Sero's GitHub panel who never ran
`gh auth login` gets a working "Publish to GitHub" and titlebar PR composer, but
the Agent Board silently shows no PRs/issues (World B fails soft to `[]`) and
orchestrator PR ops fail. The reverse mismatch also exists, and the two worlds
can hold different scopes.

### 1.5 Renderer surfaces, IPC, CLI

The renderer sits on **three independent backends with no shared source of truth**:

1. **`vcs` IPC** (`sero:vcs:*` → core layer): Explorer "Source Control" panel
   (`src/components/apps/explorer/vcs/` — changes, bookmarks, remotes, working
   copy, PR section), the Zustand `stores/vcs.ts`, and the PR composers.
2. **`gitApp` state file**: the title-bar "Ship deck"
   (`titlebar/git/GitTitleBarControls.tsx`, `GitShipPanel.tsx`) reads branch /
   ahead-behind / staged state from the **watched JSON file**
   `.sero/apps/git/state.json` written by the git plugin's code, and dispatches
   commit/fetch/pull/push via `sero:git-app:run`.
3. **`github` IPC** (`sero:github:*` → auth manager + repo-ops): login state and
   repo creation.

Renderer-side business logic in `layout/git-remote/workflow.ts` (246):

- **Add-or-update origin**: calls `addRemote`; on failure **string-matches the
  error for `'already exists'`** and then calls `setRemoteUrl`. The
  overwrite-vs-fail decision lives in the renderer and hinges on an error-message
  substring.
- **Import policy**: decides whether connecting a remote should import its files
  by asking the editor for a file listing and filtering a hardcoded scaffold
  allowlist (`.git`, `.sero-workspace.json`, `.DS_Store`) to determine "workspace
  is empty", then composing `checkoutRemote`. Three renderer-driven IPC hops
  implementing one policy.
- **Publish**: composes `github.status()` + `github.createRepo()` and
  reconstructs the repo URL client-side when the API result lacks one.

Consumers: `ConnectExistingView.tsx` (paste URL → auto-import if empty →
"Just link / Import files" reconcile step) and `GitRemotePublishSection.tsx`.

**Two PR-creation UIs** — `titlebar/git/GitPullRequestComposer.tsx` (315) and
`explorer/vcs/PullRequestSection.tsx` (378) — call the identical
`sero:vcs:pr-*` channels but are near-complete copies with drift: gated on
different conditions (gitApp `hasRemote` vs a non-default vcs bookmark), seeded
from **different backends** (gitApp current branch vs vcs `activePushBookmark`),
different target-branch inputs, different refresh and draft-feedback behaviour.

**CLI** `sero vcs` (`electron/cli/commands/vcs/vcs.ts`): status / log / diff /
checkpoint / push / fetch / remote / bookmarks over the core (jj-vocabulary)
layer. It is exposed to agents via the `sero-cli` tool — so agents see **two git
surfaces with different vocabularies**: jj-style `sero vcs` (where mutating bash
git is blocked and redirected) and the real-git `git_manager` tool from the
plugin.

### 1.6 sero-git-plugin — a third full git stack

`plugins/sero-git-plugin/` implements a complete, self-contained git layer:

- **Execution**: own spawn helper `extension/git-exec.ts` (`execFileSync` /
  `execFile('git', …, {cwd})`), plus two more private inline wrappers
  (`git-default-branch.ts`, `git-command-support.ts`). Runs **directly on the
  host path** — never through the runtime backend, so container/remote
  workspaces and GitHub token injection are bypassed (push/pull/fetch rely on
  ambient credentials).
- **Operations**: 21 actions behind the single `git_manager` Pi tool — refresh,
  status, log, branches, diff, stage/unstage, commit, checkout, branch
  create/delete, stash (+pop/apply), fetch/pull/push, merge, cherry-pick,
  remove_worktree, show_commit. Own parsers, including a 257-line hand-rolled
  unified-diff parser.
- **State contract**: writes `GitAppState` to `.sero/apps/git/state.json`
  (types canonical in `@sero-ai/common/git-app.ts`); the renderer reads it
  reactively via the app-state file-watch IPC.
- **UI**: the full Git app (branch panel, SVG commit graph, staging area, diff
  viewer, commit detail with cherry-pick) plus two dashboard widgets.
- **The plugin boundary is porous**: `features/apps/git-app/manager.ts` (332)
  in electron main **imports the plugin's extension modules directly** and runs
  `runGit` / `runGitAction` / `refreshGitState` in-process. The same code
  executes in the Pi extension host and in main. `manager.ts` +
  `refresh-invalidation.ts` implement live `fs.watch` on the worktree and `.git`
  internals with a 200 ms debounced, single-flight refresh; the rest of the host
  pushes invalidations into it (agent mutating turns, checkpoint restores, vcs
  events, editor saves).
- No GitHub access from the plugin at all.

### 1.7 Other contact points (sweep findings)

| Where | What | Exec style |
|---|---|---|
| `features/apps/runtime/capabilities/create-host.ts:157-180` | Binds the worktree layer + `WorktreeManager` into the plugin `git:` capability; the seam that hands git to all plugin runtimes | shared (worktree layer) |
| `plugins/sero-orchestrator-plugin/runtime/catalog-store.ts`, `host.ts` | Shallow-clones / pulls loop-catalog repos into a cache | own `execFile('git', …)` |
| `plugins/sero-orchestrator-plugin/runtime/events/github-http.ts` | `gh api --include` ETag polling for Living Loops github events | `host.runCommand` (ambient gh) |
| `features/container/core/lifecycle.ts`, `workspace/runtime/backends/docker/docker-lifecycle.ts` | `git init` in new containers, propagate host `user.name`/`user.email`, `safe.directory`, `push.autoSetupRemote` — explicitly so checkpoint commits work | own exec (container/docker) |
| `apps/desktop/images/Dockerfile.sero-node:57-59` | Bakes git identity + `init.defaultBranch` into the image | image build |
| `features/plugins/manager.ts:423` | `installFromGit`: `git clone --depth 1` for `git:` plugin sources | own spawn |
| `plugins/sero-web-plugin/extension/github-extract.ts` | `gh repo clone` (fallback anonymous `git clone`) for URL content extraction | own `execFile` |
| `platform/security/git-command-filter.ts` | Classifies agent bash strings read-only vs mutating git (with subshell-bypass guard); the policy behind the checkpoint layer's bash blocking | none (classifier) |
| `workspace/runtime/toolchains/*`, `backends/host/host-doctor.ts` | `git` and `gh` are managed toolchain binaries (system → shared install → download) — but runtime paths don't gate on that resolution before spawning | provisioning |
| `packages/common/src/{app-runtime-git,git-app,vcs,github-url}.ts` | The shared type contracts | types only |

Negatives worth recording: no git libraries in any `package.json`; no octokit;
no git usage in cron/factory/session-lifecycle; web-remote/homepage/docs-site
clean.

---

## 2. Duplication and conflict table

### 2.1 The same job, done independently

| Job | Core layer | Worktree layer | Git plugin | Elsewhere |
|---|---|---|---|---|
| Spawn git | `git-runner.ts` (runtime-routed, auth-injected) | per-file `execFileAsync` | `git-exec.ts` + 2 inline wrappers | orchestrator catalog-store, plugin installFromGit, container lifecycle, web-plugin extract |
| Status / dirty check | `vcs-ops.ts:64`, `vcs-manager.ts:80` | `git.ts:52`, `workspace-preflight.ts:32`, `workspace-sync.ts:170` | `git-status-queries.ts:22` | — |
| Log / history | `vcs-ops.ts:47` | — | `git-log-queries.ts:20` | — |
| Diff | `vcs-manager.ts:304`, `vcs-ops.ts:70` | `git.ts:124/238` | `git-diff-queries.ts` (own parser) | — |
| Push | `vcs-ops.ts:259` | `git.ts:90` (force-with-lease) | `git-service-core.ts:170` (upstream fallback) | — |
| Fetch | `vcs-ops.ts:216` | `sync.ts:223`, `workspace-sync.ts:124`, `pull-request.ts:25` | `mutation-actions:88` | — |
| Commit ("checkpoint") | `vcs-manager.ts:163` | `git.ts:33` | `mutation-actions:38` | — |
| Remotes | `vcs-ops/remote-ops.ts` | — | `git-status-queries.ts:4` | — |
| Repo auto-init | `git-runner.ts:136` (no initial commit) | `manager.ts:34` (with initial commit) | — | container/docker lifecycle |
| Default-branch detection | `pr-ops/state.ts`, `remote-ops.ts:54` | 4 copies (`sync.ts:231`, `workspace-sync.ts:132`, `git.ts:205`, `pull-request.ts:169`) | `git-default-branch.ts:19` | — |
| PR create | `pr-ops/create.ts:50` (`--head --base`, World A auth) | `pull-request.ts:282` (`--base` only, World B auth) | — | — |
| PR list / view | `pr-ops/preview.ts:50/56` (World A) | `pull-request.ts:222/352`, `merge-status.ts:13` (World B) | — | orchestrator `gh api …/pulls` |
| Default-branch set on GitHub | `repo-ops.ts:228` | `pull-request.ts:70` | — | — |
| Extract PR URL from gh output | `pr-ops/create.ts:26` | `pull-request.ts:366` | — | `@sero-ai/common` `extractGitHubUrl` (3 near-identical regexes) |
| "gh missing" error handling | `pr-ops/create.ts:13` (friendly message) | fail-soft to `[]` (missing gh looks like "no PRs") | — | web-plugin probes `gh --version` and degrades |
| Git stdout parsers | `support/parsers.ts` (centralised) | inline | inline per module | — |

### 2.2 Structural conflicts (not just duplication)

1. **Auth split-brain.** World A (Sero OAuth via GitRunner) vs World B (ambient
   `gh`). The same product action — "create a PR" — authenticates differently
   depending on whether it came from the titlebar or from an orchestrator loop.
2. **Vocabulary split.** Core/explorer/CLI speak jj (`changeId`, bookmark,
   checkpoint, op log, abandon, squash); worktree layer, plugin, and Ship deck
   speak git (branch, commit, stash). The jj layer is pure renaming: `changeId`
   is a mutable short SHA, a bookmark is a `git branch`, the op log is the
   reflog. A branch has three names depending on which panel you're in;
   "commit" means a real commit in the Ship deck but a checkpoint in the
   working-copy section.
3. **State-source split.** The title bar reads repo state from the watched
   `state.json` while the Explorer reads the same repo via `vcs` IPC — two
   caches over one repo, refreshed by different triggers.
4. **Two PR UIs** drifting apart while calling the same channels, seeded from
   different backends (§1.5).
5. **Two agent git surfaces.** Agents get the jj-style `sero vcs` CLI (with
   mutating bash git blocked and redirected to it) *and* the real-git
   `git_manager` tool. Two tools, two vocabularies, two execution paths for the
   same repo.
6. **Runtime blindness.** Only GitRunner routes through the workspace runtime.
   The plugin and worktree layers run on raw host paths — for container/remote
   workspaces they hit the bind-mount from outside, and pushes miss token
   injection where the core path would succeed.
7. **Fake plugin boundary.** Electron main imports and executes
   sero-git-plugin's extension code in-process; the "plugin" is effectively a
   shared library that also ships a UI.

---

## 3. The implicit product model today

**What a "workspace repo" is.** Nothing declares a workspace to be a git repo —
it becomes one as a side effect. `GitRunner.ensureRepoInitialized` runs at the
top of essentially every core operation, and since the turn-undo capture takes a
snapshot at the start of every mutating agent turn, *any workspace an agent
writes to is silently `git init`-ed on `main`*. Containers are additionally
initialised at provisioning time (with the host's git identity propagated so
checkpoint commits attribute correctly). Background worktrees have a third init
path that also creates an initial empty commit. So "is this a repo?" has no
single owner and no user-visible moment.

**Checkpoints vs user commits.** Two mechanisms, both owned by the core layer:

- *Checkpoints* are ordinary commits on the current branch, marked only by a
  `checkpoint:` / `restore:` message prefix. They interleave with user commits
  in `git log`; restoring creates a new forward commit rather than rewriting
  history.
- *Turn-undo snapshots* are invisible: working-tree captures stored under
  `refs/sero/turn-undo/*` via a temporary index, never touching HEAD or the real
  index, capped at 40 refs / 7 days. Undo = tree navigation in the session +
  `read-tree` restore.

In the primary workspace, agents are prevented from committing directly via
bash (mutating git is blocked) — agent history flows through
checkpoints/snapshots — while the human can commit "for real" through the Ship
deck / git plugin. In background worktrees, agent commits *are* real commits
(`createCheckpointInWorktree`), pushed and turned into PRs.

**Remotes and publishing.** Connecting an existing remote is a renderer-driven
flow (`workflow.ts` policy: add-or-overwrite origin, import files only into an
"empty" workspace, else offer link-vs-force-import). Publishing creates the
GitHub repo through Sero's OAuth (World A). Day-to-day sync (fetch/pull/push)
happens through whichever of the three stacks the user's current panel uses.

**PRs.** Foreground PRs (titlebar/explorer composers) go through core `pr-ops`
with Sero's token, with an in-main LLM drafting title/body. Background PRs
(orchestrator loops, Agent Board) go through the worktree layer's `gh` with the
user's ambient login. PR *merge* exists only in the background path — there is
no renderer IPC for it.

---

## 4. Defects observed during the audit (recorded, not fixed)

1. **"Squash" button abandons.** `explorer/vcs/ChangeDetail.tsx` wires its
   Squash action to `abandon(workspaceId, changeId)` — identical to the
   adjacent Abandon button. `vcs.squash` is never called from the renderer.
   Potential data loss behind a mislabeled button.
2. **`VcsOps.squash` ignores its `from`/`into` parameters** (`void from; void
   into`) and only ever folds HEAD into HEAD~1.
3. **`HEAD~10` fallback.** `worktree/git.ts` `resolveBaseBranch` falls back to
   the literal `'HEAD~10'` as a base ref — looks like a typo for `HEAD~1`.
4. **Missing `gh` is invisible.** Worktree PR/issue reads fail soft to `[]` /
   `'unknown'`, so a missing or logged-out `gh` renders as "no PRs/issues".
5. **Unauthenticated plugin discovery** hits the GitHub search API anonymously
   (60 req/hr) even when a token exists.
6. **`ensureRemoteDefaultBranch` is heavyweight**: during background PR setup it
   can `update-ref` local `main`, force-push it, and edit the GitHub default
   branch.
7. **Dead surface**: `pushDryRun`, `squash`, `opLog`, `fileContent` exist as IPC
   bridge methods with no renderer caller; `VcsManager.watchWorkspace` and
   friends are no-ops left from a removed fs-watch checkpoint mode.
8. **`sero:vcs:diff-stat`** is the only channel accepting a renderer-supplied
   raw path (guarded against registered workspace roots — worth a look in any
   security pass).
9. **Error-string coupling**: the renderer's remote-connect flow depends on the
   substring `'already exists'` in a main-process error message.

---

## 5. Rough size of the problem

~11,200 LOC across the host VCS layers and the git plugin (excluding renderer
stores/UI), containing at least:

- **4 independent git spawn stacks** (core runner, worktree layer, plugin,
  assorted one-offs) — only one of which is container- and auth-aware;
- **3 GitHub credential postures** (Sero OAuth, ambient `gh`, anonymous);
- **2 renderer state sources** for the same repo plus a third (github) for auth;
- **2 PR composers**, **2 agent git tools**, **2 vocabularies**, **3 repo
  auto-init paths**, and **~6 copies** of default-branch detection.

---

---

# Phase 2 — Target design

## 6. Target architecture

One main-process module owns everything git and GitHub. Everything else —
renderer, plugins, CLI, agent tools, background loops — is a consumer.

```
apps/desktop/electron/features/git/
├── exec/git-executor.ts     One spawn seam for git AND gh. Two addressing
│                            modes: workspaceId (routed through the workspace
│                            runtime backend, as GitRunner does today) or an
│                            explicit repo path (for worktrees and caches).
│                            BOTH modes get the same auth env injection and
│                            SSH probing. Nothing else in the app may spawn
│                            git or gh.
├── core/git-service.ts      All local repo operations in plain git terms:
│   (+ focused submodules)   status, log, diff, branches, remotes, stage,
│                            commit, stash, checkout, merge, cherry-pick,
│                            push/pull/fetch. Absorbs vcs-ops, the worktree
│                            git helpers, and the git plugin's service stack.
│                            One parser module (grown from support/parsers.ts).
├── checkpoints/             CheckpointService + SnapshotService — the current
│                            VcsManager / InternalSnapshotManager mechanics,
│                            renamed, otherwise untouched. Checkpoints stay
│                            commits with a message prefix; turn-undo stays
│                            hidden refs under refs/sero/turn-undo/*.
├── worktrees/               WorktreeService — lifecycle, sync/rebase,
│                            preflight/stash. Same behaviour as today's
│                            worktree layer, but executing via git-executor.
├── github/                  GitHubService — device-flow auth (unchanged
│                            mechanics) + every GitHub operation: PR
│                            create/list/view/merge, issues, repo
│                            create/edit/view, default-branch read/set.
│                            One PR-URL extractor, one "gh missing/auth"
│                            error mapper, one default-branch resolver.
└── state/                   GitStateService — the single per-workspace repo
                             state (today's GitAppState, extended with what
                             the explorer panel needs). Keeps the push model:
                             invalidation coordinator + state.json file-watch
                             delivery. The ONLY repo-state cache.
```

Consumers after unification:

- `ipc/integrations/git.ts` — one IPC surface (replaces vcs.ts + github.ts +
  git-app.ts handlers).
- `create-host.ts` — the plugin `git:` capability binds GitService /
  WorktreeService / GitHubService methods instead of the worktree free
  functions.
- `sero git` CLI (renamed from `sero vcs`) — plain git vocabulary, same
  service.
- Checkpoint extensions and `agent-checkpoint.ts` IPC — unchanged wiring, now
  against CheckpointService.
- sero-git-plugin — UI + widgets + `/git` command + `git_manager` tool
  registration only; the tool's execute delegates to the host service.

What deliberately does NOT change: checkpoint/turn-undo semantics, the
state.json push-delivery mechanism (no polling), the bash git blocker, the
container identity provisioning, and the plugin's UI.

Out of the unified layer (acceptable one-offs, documented here): plugin
`installFromGit` clone, orchestrator catalog-store clone (management-plane
cache, not a workspace repo), container/docker `git init` provisioning, and
`plugins/discovery.ts` repo search. Each is a single self-contained call site;
dragging them through GitExecutor buys nothing today. Revisit only if they grow.

## 7. DECISIONS

### D1 — Vocabulary: plain git everywhere. **Recommended: yes.**

The jj-style layer is renaming, not abstraction (§2.2): `changeId` is a mutable
short SHA, a bookmark is a branch, the op log is the reflog. jj support was
removed; keeping its vocabulary costs a permanent translation layer and gives
agents/users two names for everything.

Converge on: `sha`/`commit`, `branch`, `reflog`, `amend`. Kill the jj verbs:
`describeChange` → amend message, `undo` → undo last commit (soft reset),
`abandon` → discard last commit (hard reset), `squash` → deleted (broken and
unused, §4.2). **"Checkpoint" and "snapshot" survive** — they are Sero product
concepts, not jj terms. UI labels follow ("Branches", "Commits"). The shared
types in `@sero-ai/common` rename with the code.

Alternative (rejected): keep jj vocabulary as a future-proofing abstraction.
Rejected because no second backend is planned and the abstraction is already
leaky (three surfaces speak git today).

### D2 — GitHub gateway: `gh` CLI as the only transport, always through GitExecutor. **Recommended.**

Facts: there is no octokit anywhere; every GitHub operation except auth is
already `gh`; `gh` is a managed toolchain binary (doctor + shared install, no
manual step); and `gh` gives `GH_TOKEN` env precedence over its own stored
login.

So: **all** gh invocations go through GitExecutor, which injects Sero's OAuth
token as `GH_TOKEN` when the user is signed in. That single rule dissolves the
two credential worlds: signed into Sero → every feature (titlebar, Agent Board,
orchestrator loops, plugin capability) uses the Sero token; not signed in but
`gh auth login` exists → everything falls back to the ambient login uniformly.
No feature is ever half-authenticated again.

Auth acquisition stays exactly where it is: device flow + safeStorage in the
auth manager (the only REST fetch that remains, since token acquisition can't
use gh). One deliberate exception: `plugins/discovery.ts` keeps its direct
REST search because it must work for anonymous users; it should attach the
Sero token when present (fixes §4.5) — a two-line change, not a new gateway.

Alternatives (rejected): REST/octokit gateway — reimplements what gh already
does and adds a dependency; "both, case by case" — is the status quo that
produced the split-brain.

### D3 — sero-git-plugin becomes a pure consumer. **Recommended.**

The plugin boundary is already fake: electron main imports and runs the
plugin's extension code in-process (§1.6). Make the de-facto arrangement the
real one, in the correct direction:

- **Host owns**: git execution, the 21 operations, parsers, state.json writing,
  the invalidation coordinator. (It must own these anyway — checkpoints, the
  titlebar, editor-save invalidation, and container routing all live in the
  host.)
- **Plugin owns**: the Git app UI, the dashboard widgets, the `/git` command,
  and the `git_manager` tool *registration* — whose execute delegates to the
  host service via the host bridge instead of spawning git itself.

What the host still needs even with the plugin owning the UI: everything in
the module above — the service is host infrastructure that the plugin's UI
happens to render. The plugin's hand-rolled diff parser is retired in favour
of the host's (the explorer already moved to @pierre/diffs; the plugin UI can
consume the same structured diff payloads).

Alternative (rejected): plugin keeps its own stack behind a stable state.json
contract. Rejected because it permanently forfeits container routing and auth
injection for the plugin's push/pull/fetch, and keeps three git stacks alive.

### D4 — UI: consolidate implementations, keep the entry points. **Recommended.**

Users keep both homes — the titlebar Ship deck for quick actions and the
explorer panel for detail — but they become two mounts of the same parts:

- **One PR composer component** (extracted from the two near-copies), one
  gating rule, one seed source: the unified GitStateService state. Mounted in
  the titlebar popover and the explorer panel.
- **One remote-connect/publish flow** (ConnectExistingView + publish section
  stay as the homes), backed by the new main-side operations from D5.
- **One repo state** for every surface (GitStateService); the explorer's
  separate IPC-query path for status/log/branches is deleted.

Agent surfaces converge on the same service but both remain for now:
`git_manager` (bridged per AD-020) stays the structured tool; the CLI becomes
`sero git` (git vocabulary) and remains the redirect target for blocked bash
git plus checkpoint commands. Collapsing to a single agent surface is possible
later but is not required for unification and would churn agent prompts
mid-migration.

### D5 — Renderer policy moves to main. **Recommended.**

`git-remote/workflow.ts` is retired. Two new main-process operations replace
its three renderer-orchestrated IPC dances:

- `git:connectRemote({ url, importMode })` — atomically: upsert origin (add or
  set-url, no error-string matching), check workspace emptiness main-side
  (against the workspace scaffolding definition, not a renderer copy of it),
  import if policy allows, return a structured outcome for the
  link-vs-import reconcile UI.
- `git:publish({ name, visibility })` — create the GitHub repo, set origin,
  push, return the real URL from gh (no client-side URL reconstruction).

The renderer keeps only presentation state. This also removes the last
renderer dependency on main-process error message wording.

## 8. Migration plan

Ordered, PR-sized, each independently shippable with `pnpm typecheck` and
tests green. Riskiest assumptions first. Rule for every step: the
sero-git-plugin app and checkpoint/turn-undo keep working; if a step can't
preserve behaviour, stop and flag instead of improvising.

Progress tracking: tick the box + note the commit hash when each step lands.

- [x] **Step 0 — Approved bug fixes (small, isolated).** *(done)* Fix the Squash button
  calling `abandon` (data-loss mislabel — remove the button since `squash` is
  being deleted per D1), fix the `'HEAD~10'` base-ref fallback, make the
  worktree gh reads distinguish "gh missing/unauthenticated" from "no PRs".
  These are behaviour changes, called out here for explicit approval rather
  than smuggled into refactor steps.
  *Risk probed: none — hygiene.*

- [x] **Step 1 — GitExecutor learns path addressing; worktree layer executes
  through it.** *(done — worktree/exec.ts; auth env logic shared with
  GitRunner via buildGitHubAuthEnv; unit-tested; live loop/board check
  pending user verification)* Extend the core runner to accept an explicit repo path (with
  the same auth env build), then replace every raw `execFileAsync` in
  `features/vcs/worktree/` with it. Function signatures and callers unchanged.
  *Risk probed (the biggest one): auth-injected gh behaves correctly for the
  Agent Board and orchestrator loops that previously used ambient gh. Verify
  with a live loop + board refresh before merging.*

- [ ] **Step 2 — Single GitHubService.** Merge `pr-ops/*`, `auth/github/
  repo-ops.ts`, `worktree/pull-request.ts`, `merge-status.ts` into
  `features/git/github/`. One PR create, one PR list/view, one merge, one
  default-branch resolver/setter, one URL extractor, one error mapper. Rewire
  IPC, create-host capability, and both composers. Delete
  `ensureRemoteDefaultBranch`'s force-push behaviour only if verified
  unreachable; otherwise preserve and flag.
  *Risk probed: the two PR-create paths really are behaviourally equivalent
  (--head flag semantics, worktree vs workspace cwd).*

- [ ] **Step 3 — Host absorbs the plugin's git service.** Move
  `extension/git-{exec,service*,refresh,refs,log,status,diff}*.ts` +
  `state-io.ts` into host `features/git/core|state/`, executing via
  GitExecutor (this is what makes container workspaces and token-injected
  push/pull work in the Git app). `git-app/manager.ts` consumes host modules;
  the plugin's `git_manager` tool and `session_start` hook delegate through
  the host bridge. `GitAppState` contract and plugin UI untouched.
  *Risk probed: the Pi-session side of the plugin can reach the host service
  in all session topologies (in-process, container).*

- [ ] **Step 4 — Vocabulary conversion (D1).** Rename types/methods/IPC
  payload fields/store/UI labels from jj terms to git terms across core,
  `@sero-ai/common`, renderer, and CLI (`sero vcs` → `sero git`, old name kept
  as alias for one release; bash-blocker redirect text updated). Delete the
  dead surface: `squash`, `pushDryRun`, `opLog`, `fileContent` bridge methods,
  `watchWorkspace` no-op stubs. Mechanical but wide; no behaviour change.
  *Risk probed: none new — churn management (do it after the structural moves
  so renames don't conflict with them).*

- [ ] **Step 5 — One repo state.** Extend `GitAppState` with what the explorer
  panel needs (checkpoint list, remote details, PR-relevant branch info);
  point the explorer store and both composers at GitStateService; delete the
  renderer's duplicate status/log/branches query paths. Titlebar and explorer
  now render one cache with one invalidation pipeline.
  *Risk probed: the state file stays comfortably sized and fresh enough for
  the explorer's needs.*

- [ ] **Step 6 — Renderer policy to main (D5).** Implement
  `git:connectRemote` / `git:publish`; ConnectExistingView and the publish
  section become thin views; delete `git-remote/workflow.ts` and the
  hardcoded scaffold allowlist in the renderer.

- [ ] **Step 7 — One PR composer.** Extract the shared component, mount in
  titlebar + explorer, seed from unified state, delete the two originals.

- [ ] **Step 8 — Sweep and rename.** Fold the remaining worktree-layer
  duplicates into GitService (default-branch detection to one helper, shared
  execError), move `features/vcs/` → `features/git/`, retire the duplicate
  local `GitRunner` interfaces, route discovery search with token when
  available, update `docs/architecture.md`, `apps/docs-site`, and this
  document's inventory to the new layout.

Every step ends with: `pnpm typecheck` clean, tests green, checkboxes updated
here, conventional commit. IPC changes touch all four layers together
(`src/types/ipc.ts` in sync). `@sero-ai/common` type changes → remind to
republish packages.

See AD-024 in `docs/decisions.md` for the decision record.
