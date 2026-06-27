# 02 — Integration Seams

This file lists the host APIs Orchestrator reuses and the runtime boundaries
implementors must preserve.

Orchestrator stores and schedules loops. Work inside a step runs through standard
Sero background-agent, active-session, or model execution.

## Plugin Shell

Orchestrator is a workspace-scoped built-in plugin.

```jsonc
{
  "sero": {
    "app": {
      "id": "orchestrator",
      "name": "Sero Orchestrator",
      "scope": "workspace",
      "stateFile": ".sero/apps/orchestrator/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "OrchestratorApp",
      "runtime": "./runtime/index.ts"
    },
    "plugin": { "category": "developer-tools", "tags": ["orchestration"] }
  },
  "pi": { "extensions": ["./extension/index.ts"] }
}
```

The runtime entry exports `createAppRuntime(ctx)`. `ctx` provides `appId`,
`workspaceId`, `workspacePath`, `stateFilePath`, and `host`.

Source: [package-build.ts](../../../../../apps/desktop/electron/features/plugins/package-build.ts).

## Orchestrator Need to Host Capability

| Need | Capability | Notes |
| --- | --- | --- |
| Persist loop state | `host.appState.read`, `update`, `watch` | Authoritative state file |
| Create step plan | `host.subagents.runStructured` | Model call with plan schema instructions |
| Resolve loop workspace isolation | `host.git.createWorktree`, `removeWorktree` | User-selected workflow placement |
| Check dirty workspace-root mode before start | new `host.git.getWorkspaceStatus` or equivalent | Workspace-root preflight only |
| Stash dirty workspace after user choice | new `host.git.stashWorkspaceChanges` or equivalent | User-directed preflight only |
| Run background step | `host.subagents.runStructured` | Normal Sero background agent execution |
| Resolve a step's model / detect a missing pinned model | `host.models.list` | Per-step tier or pinned model; unavailable pin falls back to MED |
| Stream background output | `host.subagents.onLiveOutput` | UI subscribes by `(workspaceId, parentSessionId)` |
| Evaluate step outcome | `host.subagents.runStructured` | Model call when execution output is not structured |
| Decide recovery | `host.subagents.runStructured` | Model call after failed step |
| Ask user how to handle dirty workspace | new `host.notifications.requestChoice` or equivalent | Visible notification with timeout |
| Notify user of loop status | `host.notifications.notify` | Status notification only |
| Run active-session step | new `host.session` seam | Defined below |

Commands, verification commands, git operations, PR work, browser work, and
external integrations are performed by the Sero agent/session when the normal
Sero runtime exposes those tools. Orchestrator does not call those host APIs as
workflow-specific steps.

Orchestrator may call git host APIs before workflow work starts to check whether
the workspace root is dirty in workspace-root mode, create or remove a managed
worktree, or stash current changes after the user chooses that option. These are
workspace preflight and placement operations. They are not generated workflow
steps.

## Subagents and Model Calls

Current host API:

```ts
interface AppRuntimeSubagentRunParams {
  agent?: string;
  task: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  parentSessionId: string;
  workspaceId: string;
  cwd?: string;
  isolated?: boolean;
  customTools?: unknown[];
  onUpdate?: (text: string) => void;
  platformTools?: "all" | "readOnly" | "none";
  signal?: AbortSignal;
}

interface AppRuntimeSubagentResult {
  response: string;
  error?: string;
  modelId?: string;
  providerId?: string;
  durationMs?: number;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

interface AppRuntimeSubagentsApi {
  runStructured(params: AppRuntimeSubagentRunParams): Promise<AppRuntimeSubagentResult>;
  onLiveOutput(
    workspaceId: string,
    parentSessionId: string,
    cb: (agentName: string, text: string) => void,
  ): () => void;
}
```

Source: [app-runtime-background.ts](../../../../../packages/common/src/app-runtime-background.ts).

Important host facts:

- `runStructured` returns plain text plus metadata. It does not validate output
  schema.
- Orchestrator parses and validates generated `PlanningResponse`,
  `StepOutcome`, `RecoveryDecision`, and `CompletionSignal` JSON.
- `parentSessionId` is required.
- Subagent tracker state is in-memory. Durable history must be stored in
  Orchestrator state and artifacts.

### Parent Session Ids for Autonomous Runs

Background app runtimes may run loops without a visible user session. For every
loop, Orchestrator creates a stable synthetic parent session id, for example:

```text
orchestrator:<workspaceId>:<loopId>
```

The id is stored at `runtime.parentSessionId` and copied onto every
`StepAttempt`. Orchestrator passes it to `runStructured.parentSessionId`.

The UI uses the attempt's `parentSessionId` with
`host.subagents.onLiveOutput(workspaceId, parentSessionId, cb)`.

### Background Step Execution

For `execution.type = "background-agent"`, Orchestrator calls
`host.subagents.runStructured` with generated step instructions, loop context,
and relevant observations.

The background agent receives normal Sero runtime behavior. Orchestrator must
not add its own tool allowlist, command layer, or approval layer.

If the loop resolves to a managed worktree, Orchestrator passes that worktree
cwd through `runStructured.cwd`. If the loop resolves to the workspace root,
Orchestrator passes the workspace root cwd. The same loop-scoped
`parentSessionId` is used for background-agent and model calls.

## Workflow Workspace Isolation

Current host API:

```ts
createWorktree(
  workspacePath: string,
  cardId: string,
  cardTitle: string,
): Promise<{ worktreePath: string; branchName: string; greenfield: boolean }>;

removeWorktree(
  workspacePath: string,
  cardId: string,
  options?: { deleteBranch?: boolean; force?: boolean },
): Promise<void>;
```

Source: [app-runtime-background.ts](../../../../../packages/common/src/app-runtime-background.ts).

Constraints:

- Worktrees are created under `.sero/worktrees/`, inside the registered
  workspace root.
- Existing worktree naming is card-flavored. Orchestrator should wrap that with
  loop ids rather than exposing card terminology in its state.
- Background agents can run with a worktree cwd because `runStructured` accepts
  `cwd`.
- Active sessions cannot be repointed to a worktree. Active-session steps always
  use the active session's workspace-root context.
- Orchestrator uses worktree APIs only for user-selected workspace isolation.
  Git commits, diffs, PRs, and other workflow-level git work remain normal Sero
  agent/session work.

### Dirty Workspace Preflight

Dirty preflight applies only when the user chose workspace-root execution and
Orchestrator is about to start background filesystem work in the registered
workspace root. Managed-worktree loops do not prompt for dirty workspace-root
changes.

Needed host shape:

```ts
interface WorkspaceStatusResult {
  isGitRepository: boolean;
  hasUncommittedChanges: boolean;
  summary: string;
}

interface DirtyWorkspaceStashResult {
  stashRef: string | null;
}

interface AppRuntimeGitPreflightApi {
  getWorkspaceStatus(workspacePath: string): Promise<WorkspaceStatusResult>;
  stashWorkspaceChanges(
    workspacePath: string,
    message: string,
  ): Promise<DirtyWorkspaceStashResult>;
}
```

If `hasUncommittedChanges` is true in workspace-root mode, Orchestrator shows a
visible choice notification:

```ts
interface NotificationChoice {
  id: string;
  label: string;
}

interface NotificationChoiceResult {
  choiceId: string | null;
  timedOut: boolean;
}

interface AppRuntimeNotificationChoiceApi {
  requestChoice(options: {
    title: string;
    body: string;
    choices: NotificationChoice[];
    timeoutMs: number;
  }): Promise<NotificationChoiceResult>;
}
```

Choices:

- `stash-current-changes`: stash current changes and run in the workspace root;
- `create-managed-worktree`: create an isolated worktree and run there;
- `defer-workflow`: leave the loop waiting without starting steps.

The timeout is 30 seconds. On timeout, Orchestrator treats the result as
`create-managed-worktree`.

### Model Decisions

Planning, outcome evaluation, failure recovery, and plan revisions are model
calls. Until a direct model host API exists, Orchestrator can use
`host.subagents.runStructured` for these calls and parse the response.

If a model step declares `outputSchema`, Orchestrator includes that schema in
the prompt text. The current host API does not enforce schemas.

## App State

Current host API:

```ts
read<T>(filePath): Promise<T | null>;
update<T>(filePath, updater: (current: T | null) => T): Promise<void>;
watch(filePath): void;
unwatch(filePath): void;
```

Source: [apps/state/manager.ts](../../../../../apps/desktop/electron/features/apps/state/manager.ts).

`update` serializes writes per file. It does not provide an execution lock. The
coordinator still owns per-loop locking so two coordinator runs do not corrupt
loop state.

## Cron Patterns

Reuse the pattern, not cron's execution model.

Sources:

- [scheduler.ts](../../../../../plugins/sero-cron-plugin/extension/scheduler.ts)
- [state-io.ts](../../../../../plugins/sero-cron-plugin/extension/state-io.ts)
- [session-runner.ts](../../../../../plugins/sero-cron-plugin/extension/session-runner.ts)

Useful pieces:

- coarse tick;
- per-minute debounce;
- persisted last-fire state;
- carry-over after restart.

Do not run Orchestrator through cron's transient session runner. Orchestrator
needs durable loop state, step attempt history, recovery history, completion
signals, and active-session correlation.

## CLI Bridge Boundary

Orchestrator tools and slash commands are bridged through the CLI registry.
Bridged contexts receive session context and an optional `sessionRuntime`. They
do not receive `host.*`.

Therefore extension commands must call:

```ts
registry.get(workspaceId)?.requestAction(action)
```

They must not start steps directly.

If `registry.get(workspaceId)` is empty, the workspace runtime is not loaded.
The command returns a clear error telling the caller to open the workspace before
running Orchestrator actions. It must not create an ad hoc coordinator outside
the workspace runtime.

Sources:

- [cli/index.ts](../../../../../apps/desktop/electron/cli/index.ts)
- [invocation-context.ts](../../../../../apps/desktop/electron/cli/core/invocation-context.ts)

## New Seam: Active-Session Host

Active-session steps require a new host seam. The needed primitives already
exist in the CLI session bridge, but background app runtimes cannot use them
today and there is no turn-completion subscription.

Existing building blocks:

| Need | Exists today | Where |
| --- | --- | --- |
| Find active session for workspace | yes | `getCliSessionBridge().getActiveSessionForWorkspace(workspaceId)` |
| Idle / busy | yes | `entry.session.isStreaming` |
| Pending user messages | yes | `entry.session.pendingMessageCount` |
| Steer vs follow-up | yes | `entry.session.sendUserMessage(content, { deliverAs })` |
| Trigger a custom turn | partial | `sendMessage(message, { triggerTurn })` |
| Observe turn completion from background | no | needs emitter from `noteTurnEnd` |

Required host API:

```ts
interface AppRuntimeSessionHost {
  getActiveForWorkspace(workspaceId: string): Promise<ActiveSession | null>;

  getState(sessionId: string): Promise<{
    idle: boolean;
    pendingMessages: number;
    activeTurnId: string | null;
  }>;

  sendUserSteer(
    sessionId: string,
    content: ExtensionRuntimeContent,
    options: { deliverAs: "steer" | "followUp"; source: "orchestrator" },
  ): Promise<{ turnId: string }>;

  sendContextMessage(
    sessionId: string,
    message: ExtensionRuntimeMessage,
    options: {
      deliverAs: "steer" | "followUp" | "nextTurn";
      triggerTurn: boolean;
      source: "orchestrator";
    },
  ): Promise<{ turnId: string | null }>;

  onTurnComplete(
    sessionId: string,
    cb: (result: { turnId: string; status: "completed" | "aborted" | "error" }) => void,
  ): () => void;
}
```

Sources:

- [session-bridge.ts](../../../../../apps/desktop/electron/cli/bridges/session-bridge.ts)
- [session-runtime.ts](../../../../../packages/common/src/session-runtime.ts)

`onTurnComplete` is new desktop-core work. It must fire once per completed turn
and include the `turnId` so Orchestrator can correlate the step attempt.

The active session itself continues to operate under normal Sero session rules.

## Verified Facts

Treat these as binding contracts:

- App runtimes load in Electron main and receive `host.*`.
- Bridged extension tools and commands do not receive `host.*`.
- `host.appState.update` serializes file writes but is not an execution lock.
- `host.subagents.runStructured` accepts inline `systemPrompt`, `cwd`,
  `platformTools`, `parentSessionId`, and `AbortSignal`.
- `host.subagents.runStructured` does not validate output schema.
- `host.subagents.onLiveOutput` is keyed by `(workspaceId, parentSessionId)`.
- Active-session control needs a new background-runtime host seam.
- Dirty workspace status, dirty-workspace stashing, and notification choice with
  timeout need new host seams.
- Orchestrator does not call verification, command, PR, or workflow-level git
  host APIs as workflow phases. Generated agents may use standard Sero tools for
  that work when those tools are available.
