# 02 — Integration seams

What Orchestrator reuses, the exact contracts, what must be newly built, and
where the analysis was wrong. Every signature below was checked against the
current codebase. File paths are clickable.

## Plugin shell

A workspace-scoped built-in plugin, registered automatically because it lives in
`plugins/sero-orchestrator-plugin/` and declares `sero.app`.

```jsonc
// package.json
{
  "sero": {
    "app": {
      "id": "orchestrator",
      "name": "Sero Orchestrator",
      "scope": "workspace",                          // goals/checks/attempts are workspace data
      "stateFile": ".sero/apps/orchestrator/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "OrchestratorApp",
      "runtime": "./runtime/index.ts"                // background coordinator entry
    },
    "plugin": { "category": "developer-tools", "tags": ["orchestration"] }
  },
  "pi": { "extensions": ["./extension/index.ts"] }
}
```

The runtime entry exports `createAppRuntime(ctx)`; `ctx` provides `appId`,
`workspaceId`, `workspacePath`, `stateFilePath`, and `host` (the full capability
surface). `start()`, `handleStateChange(state)`, and `dispose()` are the
lifecycle hooks — see [package-build.ts](../../../../../apps/desktop/electron/features/plugins/package-build.ts).

## Loop step → existing capability

| Loop step | Capability | Source |
| --- | --- | --- |
| Change (worker) | `host.subagents.runStructured` | [app-runtime-background.ts](../../../../../packages/common/src/app-runtime-background.ts) |
| Stream progress | `host.subagents.onLiveOutput` | same |
| Check | `host.verification.detectVerificationCommands`, `runCommands`, `summarizeFailure` | [verification.ts](../../../../../apps/desktop/electron/features/workspace/runtime/verification.ts) |
| Diff / learn | `host.git.getDiff`, `getDiffSummary` | [vcs/worktree](../../../../../apps/desktop/electron/features/vcs/worktree/) |
| Checkpoint | `host.git.createCheckpoint` | same |
| Isolate | `host.git.createWorktree`, `removeWorktree` | same |
| Persist state | `host.appState.read`, `update`, `watch` | [apps/state/manager.ts](../../../../../apps/desktop/electron/features/apps/state/manager.ts) |
| Notify | `host.notifications.notify` | [create-host.ts](../../../../../apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts) |
| Run command check | `host.workspace.runCommand` | [run-workspace-command.ts](../../../../../apps/desktop/electron/features/workspace/runtime/run-workspace-command.ts) |
| Steer session | **new** `host.session` seam | see below |

## Subagents

Real entry point — `host.subagents.runStructured` (internally
`runSingleStructured`, [single-run.ts](../../../../../apps/desktop/electron/features/subagent/core/single-run.ts)):

```ts
interface AppRuntimeSubagentRunParams {
  agent?: string;
  task: string;                  // NOTE: the field is `task`, not `taskPrompt`
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  systemPrompt?: string;         // inline ad-hoc agent — supported
  parentSessionId: string;       // REQUIRED
  workspaceId: string;
  cwd?: string;                  // worktree override, mapped to container cwd
  isolated?: boolean;            // workspace-only mounts
  customTools?: unknown[];
  onUpdate?: (text: string) => void;
  platformTools?: "all" | "readOnly" | "none";
  signal?: AbortSignal;          // abort resolves with error "Aborted"
}

interface AppRuntimeSubagentResult {
  response: string;              // PLAIN TEXT — no schema validation
  error?: string;
  modelId?: string;
  providerId?: string;
  durationMs?: number;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

onLiveOutput(workspaceId, parentSessionId, cb: (agentName, text) => void): () => void;
```

**Corrections to the analysis:**

- **No `outputSchema`.** `runStructured` returns plain text plus metadata. The
  "structured" in the name refers to the result *object*, not schema-validated
  output. `WorkerInstruction.outputSchema` is enforced by the **coordinator**:
  the system prompt asks for a fenced JSON block; the coordinator parses and
  validates it. Parse failure → soft attempt failure, raw text retained (D-08).
- **`parentSessionId` is required.** The coordinator supplies the loop's bound
  session id, or a synthetic `orchestrator:<loopId>` when there is none (D-15).
  `onLiveOutput` is keyed by `(workspaceId, parentSessionId)`, so this id is
  also how the UI subscribes to live output.
- **Tracker is in-memory only** ([tracker.ts](../../../../../apps/desktop/electron/features/subagent/core/tracker.ts)).
  Run handles and results die on process restart. Durable attempt history lives
  in Orchestrator state; `workerRunId` is a live-UI correlation only.

**Confirmed:** inline `systemPrompt`, per-run `platformTools` policy, external
`AbortSignal`, `cwd` override for worktrees (mapped to container cwd via
[resolveSubagentPaths](../../../../../apps/desktop/electron/features/subagent/runtime/runner.ts)),
and per-run abort (`abortOne`) / session abort (`abortAll`).

## Verification

[verification.ts](../../../../../apps/desktop/electron/features/workspace/runtime/verification.ts):

```ts
detectVerificationCommands(workspacePath, options?: { testingEnabled?: boolean }): Promise<string[]>;
runCommands(workspaceId, cwd, commands, timeoutMs?, options?): Promise<AppRuntimeVerificationResult>;
summarizeFailure(result: AppRuntimeVerificationCommandResult): string;
```

`runCommands` runs sequentially and stops on first failure; each result carries
`{ command, success, stdout (last 4000 chars), stderr (last 2000 chars),
durationMs }`. The detector orders typecheck before tests and understands pnpm /
npm / yarn / cargo / pytest. `summarizeFailure` also detects native-dependency
mismatches. The host method is literally named `summarizeFailure`; the
underlying export is `summarizeVerificationFailure` — there is **no** generic
"summarizeFailure" beyond verification.

These map directly to `LoopCheck` types `verification` and `command`, normalized
into `CheckResult`.

## VCS, checkpoints, worktrees

Host git surface ([app-runtime-background.ts](../../../../../packages/common/src/app-runtime-background.ts)):

```ts
createWorktree(workspacePath, cardId, cardTitle): Promise<{ worktreePath; branchName; greenfield }>;
removeWorktree(workspacePath, cardId, options?: { deleteBranch?; force? }): Promise<void>;
createCheckpoint(worktreePath, message): Promise<string | null>;   // git add -A && commit; short SHA or null
getDiff(worktreePath): Promise<string>;
getDiffSummary(worktreePath): Promise<string>;
pushBranch / createPr / mergePr / getPrMergeState ...               // Phase 6 PR workflow
```

**Corrections / constraints:**

- **No host restore; restore via a pre-attempt `baseRef`.**
  `VcsManager.restoreCheckpoint`
  ([vcs-manager.ts](../../../../../apps/desktop/electron/features/vcs/core/vcs-manager.ts))
  is desktop-core, not on the host. `createCheckpoint` returns **null on a clean
  tree** and otherwise commits *current* changes, so it is not a pre-attempt
  rollback target. Each attempt records `baseRef = git rev-parse HEAD` before
  mutation; restore = `host.workspace.runCommand(.., cwd, "git reset --hard
  <baseRef>")` against the attempt cwd. On a **dirty workspace root** the
  coordinator first commits the user's dirty work as the baseline so nothing is
  lost (D-07). Optional dedicated host capability is Phase 6.
- **Worktree naming is card-specific.** `createWorktree` makes
  `.sero/worktrees/card-<cardId>` with branch `<type>/<slug>-<cardId>`, and
  `list()` only matches `card-*`
  ([worktree/manager.ts](../../../../../apps/desktop/electron/features/vcs/worktree/manager.ts)).
  The host signature is fixed, so Phase 6 **wraps it cleanly** plugin-side in
  `runtime/worktree.ts` (`ensureLoopWorktree`): Orchestrator maps a neutral
  `workItemId` (the loop id) onto the `cardId` slot and never speaks "card". The
  physical `card-<id>` dir is desktop core's concern; the coordinator only sees a
  `LoopWorktree { workItemId, path, branch }`, created once per loop and reused.
- **Checkpoint id** is a 12-char short SHA (or a `turn-undo:<ts>-<uuid>` internal
  snapshot from the desktop VCS path, which Orchestrator does not produce).

## App state

[apps/state/manager.ts](../../../../../apps/desktop/electron/features/apps/state/manager.ts):

```ts
read<T>(filePath): Promise<T | null>;
update<T>(filePath, updater: (current: T | null) => T): Promise<void>;  // serialized per file, atomic tmp+rename
watch(filePath): void;   // broadcasts sero:app-state:change to renderer
unwatch(filePath): void;
```

`update` serializes writes per file (safe for concurrent updaters) but does
**not** provide execution mutual exclusion — the coordinator still holds an
in-process per-loop lock so two attempts cannot advance one loop (D-11).
Workspace-scope state resolves under the workspace at
`.sero/apps/orchestrator/state.json`.

## Cron patterns

Reuse the shapes, don't depend on the system.
[scheduler.ts](../../../../../plugins/sero-cron-plugin/extension/scheduler.ts),
[state-io.ts](../../../../../plugins/sero-cron-plugin/extension/state-io.ts):

- 30s tick, per-minute debounce via `lastTickMinute`, carry-over on restart so a
  job doesn't re-run within the same minute. Orchestrator's scheduler copies
  this debounce/missed-run shape behind an adapter (D-02).
- Mutex-protected JSON state with atomic tmp+rename writes — same pattern
  Orchestrator state uses via `host.appState`.
- **Do not** reuse `session-runner.ts`'s transient session
  ([session-runner.ts](../../../../../plugins/sero-cron-plugin/extension/session-runner.ts)):
  it runs an in-memory session with tools `['read','bash','edit','write']` and
  sets `SERO_CRON_SUBPROCESS=1`. That is the wrong execution model for loops,
  which need durable attempt state and (for active-session mode) safe steering.
- Cron tools/commands run with **no `host.*`** — same boundary as Orchestrator's
  bridged tools.

## CLI bridge boundary

[cli/index.ts](../../../../../apps/desktop/electron/cli/index.ts),
[invocation-context.ts](../../../../../apps/desktop/electron/cli/core/invocation-context.ts):

- Orchestrator's `orchestrator.*` tools and `/orchestrator` command are bridged
  through the CLI registry (AD-020). Bridged contexts receive session context
  and an optional `sessionRuntime`, but **not** `host.*`. They must call the
  coordinator registry (D-01).
- `sessionRuntime` targets the *current* (invoking) session only. Active-session
  mode needs to target a possibly-different session, which is why the new host
  seam (below) is required rather than reusing `sessionRuntime`.

## New seam: active-session host

This is the one genuinely new desktop-core capability. The building blocks
already exist in the CLI session bridge
([session-bridge.ts](../../../../../apps/desktop/electron/cli/bridges/session-bridge.ts),
[session-runtime.ts](../../../../../packages/common/src/session-runtime.ts)) —
they are simply not exposed to background runtime code:

| Need | Exists today | Where |
| --- | --- | --- |
| Find active session for workspace | yes | `getCliSessionBridge().getActiveSessionForWorkspace(workspaceId)` |
| Idle / busy | yes | `entry.session.isStreaming` |
| Pending user messages | yes | `entry.session.pendingMessageCount` |
| Steer vs follow-up | yes | `entry.session.sendUserMessage(content, { deliverAs })` |
| Trigger a turn | partial | `sendMessage(message, { triggerTurn })` |
| Observe turn completion from background | **missing** | needs an event off `noteTurnStart` / `noteTurnEnd` |

So the seam **wraps** existing bridge primitives and adds turn-completion
observation. It lives in desktop core (where active-session state already lives)
and is exposed on the runtime host. **Two send methods**, not one — they map 1:1
onto the two existing `AgentSession` APIs, which have different payload shapes
and turn semantics and must not be collapsed into a single `string` method:

```ts
interface AppRuntimeSessionHost {
  getActiveForWorkspace(workspaceId: string): Promise<ActiveSession | null>;
  getState(sessionId: string): Promise<{
    idle: boolean;
    pendingMessages: number;
    activeTurnId: string | null;
  }>;

  // user-visible steer / follow-up; wraps session.sendUserMessage(content, { deliverAs }).
  // Triggers a turn. Returns the turn correlation id.
  sendUserSteer(
    sessionId: string,
    content: ExtensionRuntimeContent,
    options: { deliverAs: "steer" | "followUp"; source: "orchestrator" },
  ): Promise<{ turnId: string }>;

  // inject context; wraps session.sendCustomMessage(message, { triggerTurn, deliverAs }).
  // Triggers a turn only when triggerTurn is true.
  sendContextMessage(
    sessionId: string,
    message: ExtensionRuntimeMessage,
    options: { deliverAs: "steer" | "followUp" | "nextTurn"; triggerTurn: boolean; source: "orchestrator" },
  ): Promise<{ turnId: string | null }>;

  // NEW emitter — correlate by turnId.
  onTurnComplete(
    sessionId: string,
    cb: (result: { turnId: string; status: "completed" | "aborted" | "error" }) => void,
  ): () => void;
}
```

`ExtensionRuntimeContent` / `ExtensionRuntimeMessage` are the existing payload
types ([session-runtime.ts](../../../../../packages/common/src/session-runtime.ts)):
`sendUserMessage(content, { deliverAs: "steer" | "followUp" })` and
`sendMessage(message, { triggerTurn, deliverAs: "steer" | "followUp" | "nextTurn" })`
(the latter wired to `session.sendCustomMessage`). Each send returns the turn
correlation id (from `getActiveTurnId`) so the coordinator can match
`onTurnComplete`.

**`onTurnComplete` is genuinely new desktop-core work.** The bridge records
`noteTurnStart` / `noteTurnEnd` and exposes `getActiveTurnId`, but offers **no
subscription or correlation emitter**. Phase 1.5/4 must add an emitter that
fires on `noteTurnEnd` carrying the `turnId`. Idle and pending-message checks
stay centralized in desktop core; the coordinator calls `getState` before every
send and only proceeds when idle with no pending messages (D-05).

## Verified facts

Treat these as binding contracts:

- `sero-cli` commands execute through the Electron-side `CliRegistry`; agent-tool
  and host-bridge invocations both land in Electron main.
- App runtimes load in Electron main and receive `host.*` via
  `createAppRuntimeHost`. Bridged extension tools/commands do **not** receive
  `host.*` — hence the coordinator registry.
- `host.appState.update` serializes per-file writes; it is not an execution lock.
- `detectVerificationCommands(workspacePath)` reads the supplied path.
- `runCommands(workspaceId, cwd, ...)` delegates to `runWorkspaceCommand(...)`.
- `runWorkspaceCommand` maps `cwd` into the workspace runtime **only when `cwd`
  is inside the registered workspace root** (`toRuntimeWorkspacePath` returns
  null otherwise → command refused). `.sero/worktrees/...` is inside root and is
  accepted.
- `WorktreeManager` creates `.sero/worktrees/card-<id>` under the workspace root,
  so verification and workspace commands target Sero-managed worktrees with no
  host change.
- Subagent execution accepts a worktree `cwd` inside the workspace root and maps
  it to the container cwd.

**Boundary:** all of the above holds for Sero-managed *in-workspace* worktrees.
Sibling or external worktrees outside the registered root would break workspace
command execution, verification, and container mounts, and require host/runtime
changes before use (D-06).
