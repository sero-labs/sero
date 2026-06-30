# Sero Orchestrator analysis

> **Next:** this analysis has been turned into a formal technical spec and
> phased implementation plan — see [../specs/index.md](../specs/index.md). The
> spec corrects a few assumptions here against the live codebase (subagents have
> no output-schema validation, VCS restore is not on the host surface, worktree
> naming is card-specific, `parentSessionId` is required for worker runs).

## Purpose

This document maps the clean-room `pi-loop`, `pi-tasks`, and `pi-subagents`
specification onto existing Sero systems. The goal is to implement loop-based
orchestration without duplicating scheduler, git, subagent, verification, or
CLI infrastructure that Sero already has.

The target behavior is a durable workflow loop:

```text
goal -> plan -> change -> check -> learn -> fix -> stop
```

The loop should make Sero iterate safely by combining:

- A goal and task plan.
- Required checks, tests, or evals.
- Attempt logs and learning summaries.
- Git checkpoints or isolated worktrees.
- A clear stopping rule.
- Safe re-wake behavior when the active session is idle.

## Source material

Primary clean-room spec:

- [pi-loop index](../../pi-loop/index.md)
- [pi-loop clean-room guide](../../pi-loop/pi-loop.md)
- [pi-tasks clean-room guide](../../pi-loop/pi-tasks.md)
- [pi-subagents clean-room guide](../../pi-loop/pi-subagents.md)
- [Cross-extension integration contracts](../../pi-loop/integration-contracts.md)
- [Replication blueprint](../../pi-loop/replication-blueprint.md)

Existing Sero systems reviewed:

- `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
- `packages/common/src/app-runtime-background.ts`
- `apps/desktop/electron/features/subagent/`
- `apps/desktop/electron/features/workspace/runtime/verification.ts`
- `apps/desktop/electron/features/vcs/`
- `apps/desktop/electron/cli/`
- `plugins/sero-cron-plugin/`
- `plugins/sero-git-plugin/`
- `packages/templates/agents/`

## Main conclusion

Sero should implement Orchestrator as a new workspace-scoped built-in
app/plugin with a durable coordinator and two execution modes:

- **Background-worker mode**: Orchestrator owns the loop and runs each attempt
  through generated subagent workers, verification, VCS checkpoints, and retry
  logic.
- **Active-session mode**: Orchestrator safely steers the user's current chat
  session when that session is idle and has no pending user messages.

The reference stack should not be copied as three separate systems. Sero already
has strong versions of the low-level primitives:

- Subagents.
- Git and VCS checkpoints.
- Verification command detection and execution.
- Plugin runtime state.
- CLI tool bridging.
- Scheduling patterns through the cron plugin.

The missing layer is a coordinator that binds those primitives into durable
goal loops with checks, generated worker instructions, attempt logs, scheduling,
session targeting, and stop rules.

Background-worker mode can use existing app runtime host capabilities today.
Active-session mode needs a stable session targeting and re-wake capability so
background runtime code can safely find and steer the right live session. The
proper Orchestrator architecture should include both modes rather than treating
one as a permanent substitute for the other.

## Reference behaviors to preserve

The clean-room spec has several important behaviors that should survive in the
Sero implementation:

- Loops persist intent instead of relying on shell polling loops.
- A loop can fire later and steer a session only when it is safe.
- Loop state records what was attempted, what changed, what failed, and what was
  learned.
- Checks and stopping rules are first-class, not informal prompt text.
- Subagents can be used for isolated work, review, and planning.
- Cron and event triggers are useful, but they should feed durable loop triggers
  rather than execute detached prompts.
- Task backlogs are useful, but Sero does not need a generic clone of
  `pi-tasks` unless durable task management becomes a shared Sero product
  surface.

## Existing Sero systems to reuse

### App runtime host

The app runtime host already exposes the core capabilities an Orchestrator
runtime needs:

- Subagent structured execution.
- Workspace command execution.
- Verification detection and execution.
- Git status, worktree, checkpoint, and PR helpers.
- Notifications.
- Shared toolchain paths.

Relevant files:

- `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
- `packages/common/src/app-runtime-background.ts`

This strongly favors implementing Orchestrator as a built-in app/plugin runtime
instead of a core-only desktop feature.

The main loop steps already map to app runtime host namespaces:

| Loop step | Existing Sero capability |
| --- | --- |
| Change | `host.subagents.runStructured` |
| Stream progress | `host.subagents.onLiveOutput` |
| Check | `host.verification.detect*`, `runCommands`, `summarizeFailure` |
| Learn from diff | `host.git.getDiff`, checkpoint metadata, changed files |
| Isolate work | `host.git.createWorktree`, `host.git.removeWorktree` |
| Persist state | `host.appState.read`, `update`, `watch` |
| Notify | `host.notifications.notify` |
| Run command checks | `host.workspace.runCommand` |

This means background-worker loops should not need to reach into desktop
internals directly. Use the host APIs first and add new host capability only
where the app runtime surface is missing a real Orchestrator need.

## Execution modes

Orchestrator should support both execution modes as first-class architecture,
not as competing designs.

### Background-worker mode

In background-worker mode, the Orchestrator runtime owns the loop. Each attempt
creates generated worker instructions, runs a subagent, checks the result,
records learning, and starts the next attempt when allowed by the stop rule.

Use this mode for:

- Autonomous long-running work.
- Worktree-based isolation.
- Tasks that should continue without the user watching every turn.
- Review/fix loops driven mainly by tests, evals, or command checks.

This mode can be built mostly from existing `host.*` capabilities. It still
needs Orchestrator-owned durable state because subagent tracker state is not the
source of truth for loop history.

### Active-session mode

In active-session mode, the active Sero chat session remains the actor.
Orchestrator tracks the loop, checks readiness, then sends a steer or follow-up
message into the target session with the goal, current task, failed checks,
learned context, and next action.

Use this mode for:

- Work where the user expects the main conversation to stay in control.
- Interactive loops where the user may intervene between attempts.
- Cases where the main session's conversational context is more important than
  isolated worker execution.

This mode requires stable session targeting and safe re-wake behavior:

- Find the intended session for a workspace.
- Confirm it is idle.
- Confirm there are no pending user messages.
- Inject a steer or follow-up.
- Decide whether the message should trigger a turn.

The two modes should compose. A loop can use background workers for review or
test repair while still reporting, asking, or steering through the active
session when appropriate.

### Subagents

Sero already has in-process subagent execution with structured results,
parallel runs, chained runs, aborts, snapshots, live output, and ad hoc agents.

Relevant files:

- `apps/desktop/electron/features/subagent/index.ts`
- `apps/desktop/electron/features/subagent/runtime/runner.ts`
- `apps/desktop/electron/features/subagent/core/tracker.ts`
- `apps/desktop/electron/features/subagent/extensions/tool.ts`

This is enough for background-worker execution. The richer reference features
such as durable background subagent result retrieval, scheduled subagents,
custom memory, and event-bus RPC do not need to be copied wholesale, but the
Orchestrator spec should account for the product behavior they enabled.

Recommended reuse:

- Use the existing planner, implementer, quality reviewer, and spec reviewer
  templates from `packages/templates/agents/` as defaults or examples only.
- Use `host.subagents.runStructured` for planning, implementation summaries,
  quality review, and spec review.
- Add durable Orchestrator attempt state around subagent runs instead of
  changing subagents into a full task system first.

Important gap:

The current subagent system is instruction-flexible but not
orchestration-complete. `runStructured` already accepts an inline
`systemPrompt`, so Orchestrator can generate per-attempt subagent instructions
instead of relying on static templates. The static agent templates are too
coarse for loop execution because each attempt needs instructions built from
the goal, active task, prior failures, check output, changed files, stop rule,
tool policy, and expected output schema.

For a proper Orchestrator spec, define a first-class worker instruction model
rather than treating `agent` as only a template name:

```ts
interface WorkerInstruction {
  role: "planner" | "implementer" | "reviewer" | "summarizer" | "custom";
  systemPrompt: string;
  taskPrompt: string;
  outputSchema?: unknown;
  platformTools: "all" | "readOnly" | "none";
  isolated?: boolean;
  timeoutMs?: number;
  model?: string;
  thinking?: string;
}
```

Do not treat worker instructions as the source of truth for the working
directory. The coordinator should derive the worker `cwd` from
`LoopAttempt.workdir.cwd` when dispatching a worker.

The generated instruction, model settings, tool policy, and output schema should
be recorded on the attempt for replayability and debugging. Store enough
metadata to understand why a worker acted, while avoiding long unbounded logs in
the main state file.

Subagent gaps that Orchestrator must cover:

- A subagent is a single run, not a resumable long-lived worker. That is fine:
  each run can perform a full internal tool-use loop, and Orchestrator supplies
  continuity by generating the next run from accumulated context.
- Durable run handles and results belong in Orchestrator attempt state.
- Cancellation, pause, and retry should operate at the loop/attempt level.
- The subagent tracker is useful for live UI, but it is not the durable source
  of truth for loop history.
- Generated workers need explicit tool policies. Reviewers should usually be
  read-only; implementers can receive write tools; summarizers may need no
  platform tools.
- The spec should decide whether Orchestrator workers can call `sero-cli`
  Orchestrator tools, to avoid recursive loop creation or accidental self-
  modification.

### Verification

Sero already detects and runs likely verification commands for a workspace.

Relevant file:

- `apps/desktop/electron/features/workspace/runtime/verification.ts`

Recommended reuse:

- Make verification commands the first built-in check type.
- Store command, exit code, output summary, start time, end time, and result on
  each loop attempt.
- Add explicit user-provided check commands for cases detection misses.
- Add eval or promptfoo check types later as command-backed checks.

Important gap:

Verification is the natural check/eval seam for Orchestrator. The clean-room
reference stack did not have a first-class verification host, but Sero does.
The spec should define checks as Orchestrator concepts that delegate to
verification, workspace commands, reviewer workers, or eval runners. Check
results should be normalized so stop rules and learning summaries do not depend
on which backend produced the result.

### Git and VCS checkpoints

Sero already has VCS snapshots, checkpoints, restore, diff, worktree helpers,
and git plugin tooling.

Relevant files:

- `apps/desktop/electron/features/vcs/core/vcs-manager.ts`
- `apps/desktop/electron/features/apps/extensions/git-turn-undo-capture.ts`
- `apps/desktop/electron/features/apps/extensions/git-checkpoint-commands.ts`
- `plugins/sero-git-plugin/`

Recommended reuse:

- Each Orchestrator attempt should create or link to a VCS checkpoint before
  mutating work starts.
- Attempt logs should record changed files through existing git/VCS APIs.
- Restore and diff should delegate to the VCS manager, not a new snapshot
  format.
- Worktree isolation can be added after the main loop path works.

### Cron plugin

The cron plugin already has state, tools, scheduling, reminders, and transient
session execution.

Relevant files:

- `plugins/sero-cron-plugin/extension/tools.ts`
- `plugins/sero-cron-plugin/extension/scheduler.ts`
- `plugins/sero-cron-plugin/extension/state-io.ts`
- `plugins/sero-cron-plugin/extension/session-runner.ts`

Recommended reuse:

- Reuse the scheduler and state design patterns.
- Extract shared cron parsing or validation only if Orchestrator needs scheduled
  loops soon.
- Do not use cron's transient session runner for Orchestrator loop attempts.
  Orchestrator needs durable loop state and safe active-session steering, not a
  detached reminder session.

Important gap:

The existing cron system is not sufficient as the Orchestrator scheduler or task
store. Its persisted job model is intentionally small: job name, schedule,
prompt, channel, disabled state, optional model, and missed-run behavior. It
does not carry the metadata Orchestrator needs:

- `workspaceId`.
- Stable `cwd`.
- Target `sessionId`.
- `loopId` or `taskId`.
- Trigger type and debounce state.
- Attempt count and max fires.
- Required checks or evals.
- Stop rule.
- VCS checkpoint or worktree metadata.
- Last check result and learned context.

Cron also executes jobs through transient sessions. That is correct for simple
scheduled prompts and reminders, but it is the wrong execution model for loops:
Orchestrator needs to resume a durable loop, update attempt state, and often
steer the active session only after idle checks pass.

For a proper Orchestrator spec, model scheduled firing separately:

```ts
interface LoopTrigger {
  id: string;
  loopId: string;
  workspaceId: string;
  sessionId?: string;
  type: "manual" | "cron" | "event" | "hybrid";
  schedule?: string;
  eventSource?: string;
  eventFilter?: unknown;
  debounceMs?: number;
  maxFires?: number;
  fireCount: number;
  lastFireAt?: string;
  nextFireAt?: string;
  disabled?: boolean;
}
```

The cron plugin can inspire the scheduler loop and missed-run handling. The
Orchestrator plugin should own loop triggers and should not store Orchestrator
tasks inside the cron state file.

Operational caveats:

- Do not copy cron's interval-polling model as the primary loop driver. Loop
  progress should advance from completion events and durable state transitions:
  worker complete, checks complete, active session idle, trigger due.
- Cron can be a safety net for scheduled triggers, not the main retry engine.
- Do not use cron's transient session runner for loop attempts. It uses a
  smaller tool surface than Orchestrator workers need and does not own durable
  loop attempt state.

### CLI bridge and session runtime

Sero already has a CLI bridge and session runtime primitives that can send
messages to active sessions.

Relevant files:

- `apps/desktop/electron/cli/index.ts`
- `apps/desktop/electron/cli/core/invocation-context.ts`
- `apps/desktop/electron/cli/bridges/agent-bridge.ts`
- `packages/common/src/session-runtime.ts`

Recommended reuse:

- Expose Orchestrator commands through normal plugin manifest bridging.
- Add a narrow app runtime host capability for safe session re-wake.
- Keep the idle and pending-message checks in desktop core, where active
  session state already exists.
- Use Pi extension events for lifecycle-driven coordination where that is the
  natural boundary. There is no need to clone the reference event-bus RPC
  system unless Orchestrator later needs generic cross-plugin RPC semantics.

## Session targeting and re-wake capability

The full Orchestrator architecture depends on safe delayed delivery for
active-session mode:

1. A loop becomes ready to fire.
2. Sero confirms the target session is idle.
3. Sero confirms there are no pending user messages.
4. Sero injects a steer or follow-up message.
5. The message can trigger the next turn.

Sero has lower-level pieces in the CLI invocation context and Pi extension APIs,
but app runtimes do not currently expose this as a stable host API for
background runtime code. Background-worker mode can operate through existing
`host.*` capabilities. Active-session mode needs this explicit capability so
session selection and idle checks remain centralized in desktop core.

Recommended new host capability:

```ts
interface AppRuntimeSessionHost {
  getActiveForWorkspace(workspaceId: string): Promise<ActiveSession | null>;
  getState(sessionId: string): Promise<SessionRuntimeState>;
  sendMessage(
    sessionId: string,
    message: string,
    options: {
      deliverAs: "steer" | "followUp";
      triggerTurn: boolean;
      source: "orchestrator";
    },
  ): Promise<void>;
}
```

This should wrap existing session runtime behavior instead of duplicating it in
the Orchestrator plugin.

## Verified implementation facts

These facts were checked against the current Sero codebase and should be treated
as source material for the technical spec:

- `sero-cli` commands execute through the Electron-side `CliRegistry`, which
  directly invokes registered command functions. Agent-tool `sero-cli` and host
  bridge invocations both land in Electron main.
- App runtimes are also loaded in Electron main and receive `host.*`
  capabilities through `createAppRuntimeHost`.
- Bridged extension tools and commands receive session context and
  `sessionRuntime`, but they do not automatically receive app runtime `host.*`.
  This is why tools should request work from the coordinator instead of
  executing attempts themselves.
- `host.appState.update` serializes individual file writes per state file. It
  does not replace coordinator-level execution locks.
- `host.verification.detectVerificationCommands(workspacePath)` reads from the
  supplied filesystem path.
- `host.verification.runCommands(workspaceId, cwd, ...)` delegates to
  `runWorkspaceCommand(workspaceId, cwd, ...)`.
- `runWorkspaceCommand` maps `cwd` into the workspace runtime only when `cwd` is
  inside the registered workspace root.
- Sero's current `WorktreeManager` creates worktrees inside the workspace root
  at `.sero/worktrees/card-<id>`, so existing verification and workspace command
  execution can target Sero-managed worktrees without a host change.
- Subagent execution already accepts a worktree `cwdOverride` inside the
  workspace root and maps it to the corresponding runtime/container cwd.

Important boundary:

The current reuse story holds for Sero-managed in-workspace worktrees. If
Orchestrator later uses sibling or external worktrees outside the registered
workspace root, workspace command execution, verification, and container mounts
will need host changes.

## Execution ownership

The Orchestrator coordinator should be the sole executor of loop attempts.
Tools and UI should mutate configuration or request actions; they should not
run attempts directly.

This matters because Orchestrator spans multiple surfaces:

- The background app runtime has access to `host.*` capabilities such as
  subagents, verification, git, notifications, and app state.
- Bridged `sero-cli` commands execute through the Electron-side CLI registry and
  can be wired to the same coordinator, but bridged extension tool contexts do
  not automatically receive app runtime `host.*`.
- The renderer UI can update state and request commands, but it should not own
  execution.

Recommended rule:

```text
UI / CLI / tools request -> coordinator decides -> coordinator executes -> state records result
```

The coordinator should run in Electron main as part of the app runtime. A small
main-process registry can expose the workspace coordinator to Orchestrator CLI
commands:

```ts
interface OrchestratorCoordinatorRegistry {
  get(workspaceId: string): OrchestratorCoordinator | null;
}

interface OrchestratorCoordinator {
  requestAction(action: OrchestratorAction): Promise<OrchestratorActionResult>;
}
```

This gives Sero one executor and one owner for attempt advancement. The
`host.appState.update` API serializes individual file writes, but it does not by
itself prevent two attempts from racing. The coordinator must also hold
workspace or loop-level execution locks so only one attempt advances a loop at a
time.

Coordinator control plane versus actor:

- The coordinator owns state transitions, locks, stop rules, checks, retries,
  and attempt advancement.
- In background-worker mode, the actor is a generated subagent worker called by
  the coordinator.
- In active-session mode, the actor is the live session agent. The coordinator
  sends a steer or follow-up, then waits on lifecycle events for an externally
  driven turn. The attempt lock remains held while that turn is pending.

### Coordinator lifecycle

Current app runtimes are started per open workspace. That creates an important
scheduling question: what happens when a loop is due for a workspace whose
runtime is not running?

The technical spec should choose one lifecycle policy:

- **Open-workspace only**: triggers for closed workspaces are recorded as due
  and executed when the workspace opens.
- **Always-on workspace coordinator**: any workspace with active loops gets a
  running coordinator even when the workspace is not open.
- **Global supervisor plus workspace executors**: a lightweight global
  Orchestrator supervisor tracks loop indexes and trigger due times; workspace
  coordinators remain the only executors and run only when the workspace/runtime
  is available.

Recommended direction: global supervisor plus workspace executors. This keeps
scheduled intent alive without making every workspace runtime always hot. It
also preserves the single-executor rule because the supervisor marks work due
but does not execute attempts.

## Recommended implementation shape

Create a new built-in workspace-scoped app/plugin:

```text
plugins/sero-orchestrator-plugin/
├── package.json
├── shared/
│   └── types.ts
├── extension/
│   ├── index.ts
│   ├── tools.ts
│   └── commands.ts
├── runtime/
│   ├── index.ts
│   ├── coordinator.ts
│   └── registry.ts
└── ui/
    └── ...
```

The plugin should declare `scope: "workspace"` because goals, checks, attempts,
and logs belong to a workspace. It should use the app runtime host for
subagents, verification, VCS, notifications, and later dev server or monitor
integration.

Core tools should cover the full loop lifecycle:

- `orchestrator.create`
- `orchestrator.list`
- `orchestrator.show`
- `orchestrator.pause`
- `orchestrator.resume`
- `orchestrator.stop`
- `orchestrator.run_next`

If Sero later needs a generic task queue, add task tools separately. For the
Orchestrator architecture, task state should stay scoped to each loop unless
another product surface needs durable cross-plugin tasks.

## Data model

The Orchestrator model should be specific enough to support both execution
modes, scheduled triggers, generated workers, checks, and attempt history
without becoming a generic clone of `pi-tasks`.

### Loop goal

```ts
interface LoopGoal {
  id: string;
  workspaceId: string;
  defaultCwd?: string;
  sessionId?: string;
  executionMode: "background-worker" | "active-session" | "hybrid";
  hybridPolicy?: HybridPolicy;
  title: string;
  goal: string;
  status: "draft" | "active" | "paused" | "blocked" | "complete" | "stopped";
  triggers: LoopTrigger[];
  checks: LoopCheck[];
  stopRule: StopRule;
  logPolicy: LogPolicy;
  tasks: LoopTask[];
  attempts: LoopAttempt[];
  createdAt: string;
  updatedAt: string;
}
```

`defaultCwd` is only a preference used when resolving a new attempt workdir.
Once an attempt starts, `LoopAttempt.workdir.cwd` is the single source of truth.

### Hybrid policy

```ts
type HybridPolicy =
  | "prefer-active-session"
  | "prefer-background-worker"
  | "active-if-session-idle"
  | "ask-user";
```

`executionMode: "hybrid"` needs a routing rule. Without one, the coordinator
cannot decide whether a given attempt should use a background worker or steer an
active session.

### Loop check

```ts
type LoopCheck =
  | {
      type: "verification";
      command: string;
      required: boolean;
    }
  | {
      type: "command";
      command: string;
      required: boolean;
    }
  | {
      type: "review";
      reviewer: "quality-reviewer" | "spec-reviewer";
      required: boolean;
    };
```

### Loop attempt

```ts
interface LoopAttempt {
  id: string;
  attemptNumber: number;
  executionMode: "background-worker" | "active-session";
  status: "running" | "passed" | "failed" | "blocked" | "cancelled";
  workdir: AttemptWorkdir;
  checkpointId?: string;
  triggerId?: string;
  workerRunId?: string;
  sessionMessageId?: string;
  workerInstruction?: WorkerInstruction;
  changedFiles: string[];
  checkResults: CheckResult[];
  learned?: string;
  nextAction?: string;
  startedAt: string;
  endedAt?: string;
}
```

### Attempt workdir

```ts
interface AttemptWorkdir {
  mode: "workspace-root" | "worktree";
  workspaceRoot: string;
  cwd: string;
  worktreePath?: string;
  branchName?: string;
}
```

The attempt workdir is a correctness boundary. Worker execution, verification,
command checks, checkpoints, diffs, artifacts, and logs must all use the same
attempt `cwd`. Otherwise a worker can change a worktree while checks run against
the base workspace.

### Stop rule

```ts
interface StopRule {
  maxAttempts: number;
  requireAllChecks: boolean;
  stopOnNoProgressAttempts?: number;
  noProgressPolicy?: NoProgressPolicy;
}
```

```ts
interface NoProgressPolicy {
  compareFailedChecks: boolean;
  compareDiffFingerprint: boolean;
  compareChangedFiles: boolean;
}
```

Concrete no-progress signals should include equivalent failing checks,
empty or equivalent diffs, unchanged file sets, repeated error classes, or a
worker/reviewer result that reports no material path forward.

### Loop task

```ts
interface LoopTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "active" | "blocked" | "done" | "cancelled";
  blockedBy?: string[];
  acceptance?: string[];
  assignedRole?: WorkerInstruction["role"];
  createdAt: string;
  updatedAt: string;
}
```

Tasks should remain loop-scoped unless Sero later needs a reusable cross-plugin
task system.

### Check result

```ts
interface CheckResult {
  checkId: string;
  type: LoopCheck["type"];
  status: "passed" | "failed" | "skipped" | "cancelled";
  command?: string;
  summary: string;
  stdoutPath?: string;
  stderrPath?: string;
  exitCode?: number;
  durationMs?: number;
  startedAt: string;
  endedAt: string;
}
```

Store large command output in artifact files and reference it by path from the
attempt state. Stop rules should use normalized check status and summaries, not
backend-specific output shapes.

### Log policy

```ts
interface LogPolicy {
  retainAttempts: number;
  retainArtifacts: boolean;
  maxInlineOutputBytes: number;
}
```

### Session target

```ts
interface SessionTarget {
  workspaceId: string;
  sessionId?: string;
  strategy: "specific-session" | "most-recent-active" | "ask-user";
  deliverAs: "steer" | "followUp";
  triggerTurn: boolean;
}
```

This is intentionally smaller than the reference `pi-tasks` model. It should
expand only when reusable cross-plugin task management becomes a real Sero
product requirement.

## Runtime flow

Shared loop flow:

1. Create loop goal with checks and stop rule.
2. Detect default verification commands if the user did not provide checks.
3. Resolve the attempt workdir: workspace root or a worktree.
4. Create a VCS checkpoint for the attempt workdir.
5. Plan with a generated planner worker if no task plan exists.
6. Execute the attempt through the selected execution mode.
7. Run required checks against the attempt workdir.
8. If checks fail, summarize failure and create the next attempt input.
9. If checks pass, run optional reviewer workers.
10. Complete the loop when checks and stop rules are satisfied.
11. Block or stop when attempts are exhausted, no progress is detected, or the
    workspace becomes unsafe.

Background-worker attempt flow:

1. Build a `WorkerInstruction` from the goal, active task, prior failures,
   changed files, check output, and stop rule.
2. Run the worker through `host.subagents.runStructured` with the attempt
   workdir as `cwd`.
3. Stream live output to the UI through `host.subagents.onLiveOutput`.
4. Record worker metadata, output summary, model, duration, and token usage on
   the attempt.
5. Run checks, diff, and checkpoint operations against the same attempt workdir.
6. Compute the next attempt context.

Active-session attempt flow:

1. Resolve the `SessionTarget`.
2. Check that the target session is idle and has no pending user messages.
3. Build a session steer/follow-up message from the goal, active task, prior
   failures, check output, and stop rule.
4. Send the message with the requested delivery mode.
5. Observe the turn result through lifecycle events and update the attempt.
6. Run checks, diff, and checkpoint operations against the attempt workdir.
7. Compute the next attempt context.

## Scheduling strategy

The full architecture should support manual, cron, event, and hybrid triggers.
Triggers should enqueue or mark loop work as due; they should not execute
detached prompts directly.

Trigger types:

- `manual`: user or tool explicitly runs the next eligible attempt.
- `cron`: schedule marks a loop due.
- `event`: workspace, VCS, check, task, or session lifecycle event marks a loop
  due.
- `hybrid`: event trigger with cron safety net.

Loop progress should be driven by durable state transitions instead of generic
polling:

- Trigger due.
- Worker complete.
- Check complete.
- Active session idle.
- User paused, resumed, or stopped loop.
- Workspace safety state changed.

Scheduler gaps to specify:

- Whether scheduling is handled only by workspace coordinators, or by a global
  supervisor that can notice due loops for closed workspaces.
- Whether a loop is targeted to a workspace only, a specific session, or the
  most recent active session in a workspace.
- How hybrid loops select background-worker or active-session execution for a
  given attempt.
- Whether triggers for closed workspaces are queued, skipped, or cause a
  workspace coordinator to start.
- What happens if the target session is busy for a long time.
- Whether missed cron fires should collapse into one run or queue multiple
  attempts.
- Whether event triggers can fire while an attempt is already running.
- How debounce state survives app restart.
- How scheduler state is locked so two runtimes do not execute the same loop.

## Worktree strategy

Start with VCS checkpoints in the current workspace. Add worktree isolation
after the first loop coordinator works.

When worktrees are added, use the existing app runtime git/worktree APIs. If the
current worktree manager is too card-specific, refactor the naming to a neutral
work-item concept before using it widely for Orchestrator attempts.

Current Sero-managed worktrees are created under the workspace root at
`.sero/worktrees/...`. That is important because `runWorkspaceCommand` only
accepts `cwd` values inside the registered workspace root. In-workspace
worktrees can use existing verification, command execution, subagent runtime
tools, and VCS helpers. External worktrees outside the workspace root require a
host/runtime mount change before they can be used safely.

## UI strategy

The UI should be functional and compact:

- Goal list.
- Goal detail.
- Checks and latest results.
- Attempt timeline.
- Pause, resume, stop, and run next controls.
- Current blocker or next action.

Avoid duplicating long explanatory copy in the UI. The concepts should be clear
from labels and state.

## Phased plan

These phases are implementation order, not a reduced target architecture.

### Phase 0: Full architecture spec

Record the full Orchestrator architecture, execution modes, host seams, state
model, generated worker contract, scheduling model, and reuse boundaries before
implementation.

### Phase 1: Plugin shell, state, and UI

Add `plugins/sero-orchestrator-plugin` with workspace state, shared types,
runtime registration, CLI tools, and UI for goals, checks, triggers, attempts,
and controls.

### Phase 1.5: Session seam spike

Add a thin vertical slice of the active-session host seam early:

- Resolve the active session for a workspace.
- Read idle and pending-message state.
- Send a controlled no-op or diagnostic follow-up.
- Prove the runtime coordinator can call this path safely.

This de-risks the hardest desktop-core integration before the rest of
active-session mode is implemented.

### Phase 2: Durable coordinator core

Implement the single-executor coordinator, loop state machine, attempt locking,
stop-rule enforcement, logging, check result normalization, and artifact
retention.

### Phase 2.5: Scheduling lifecycle decision

Implement or explicitly defer the global supervisor. The spec should decide
whether closed-workspace triggers are queued until open workspaces reconcile or
tracked by an always-on supervisor.

### Phase 3: Background-worker execution

Implement generated worker instructions, subagent execution, verification,
checkpointing, failure summaries, retries, and reviewer workers.

### Phase 4: Active-session execution

Build on the session seam to implement session-targeted steer/follow-up
attempts, lifecycle observation, and active-session retry behavior.

### Phase 5: Scheduling and events

Add manual, cron, event, and hybrid triggers using cron plugin patterns where
useful. Trigger loop state; do not use detached transient cron sessions for
attempt execution.

### Phase 6: Isolation and PR workflow

Add worktree isolation, branch naming, PR creation, monitor streaming, richer
eval checks, and any required cross-plugin coordination through events.

### Phase 7: Reusable task system, if needed

If loop-scoped tasks become useful outside Orchestrator, extract a generic Sero
task queue. Do not start there.

## Key risks

- Treating background-worker mode and active-session mode as the same execution
  path would blur safety rules. They should share loop state, checks, and stop
  rules, but have separate execution adapters.
- Letting tools, UI, and the runtime all execute attempts would create race
  conditions. The coordinator must be the only attempt executor.
- Running workers, checks, and VCS operations against different directories
  would silently validate the wrong tree. Attempt workdir must be canonical.
- Assuming external worktrees work like Sero-managed in-workspace worktrees
  would break container/runtime path mapping.
- Scheduling loops without defining coordinator lifecycle would drop, skip, or
  duplicate due work for closed workspaces.
- Building only background-worker mode would miss the spec's safe active-session
  re-wake behavior.
- Building only active-session mode would miss autonomous worktree/subagent
  iteration.
- Reusing cron's transient session runner would create detached runs that do not
  preserve active loop context.
- Cloning `pi-tasks` up front would add a large generic task system before Sero
  needs it across product surfaces.
- Treating static agent templates as sufficient would make loop behavior too
  coarse. Orchestrator needs generated per-attempt worker instructions.
- Adding worktrees before checkpoint-based loops work will complicate execution,
  but the architecture should still include worktree isolation.
- State updates should use the app runtime state path and serializer patterns,
  not renderer storage.

## Spec gaps to resolve before implementation

The formal Orchestrator spec should answer these questions before code is
written:

- Executor ownership: confirm the runtime coordinator is the only executor;
  tools and UI only request actions.
- Scheduler ownership: Orchestrator should own loop triggers. Decide whether
  cron parsing moves to shared utilities or stays copied behind a small adapter.
- Coordinator lifecycle: decide how due loops are handled for closed workspaces
  whose runtime coordinator is not active.
- State scope: confirm workspace-scoped state as the source of truth, plus any
  global index needed for cross-workspace dashboards.
- Session targeting: define how a loop selects, remembers, and safely re-wakes
  a session.
- Attempt workdir: require workers, checks, VCS operations, and artifacts to use
  the same canonical attempt `cwd`; confirm only in-workspace worktrees are
  supported unless host/runtime mounts change.
- Hybrid routing: define how `executionMode: "hybrid"` selects an execution
  adapter for each attempt.
- Worker prompts: define how generated subagent instructions are built, stored,
  redacted, and replayed.
- Tool policies: define which phases can write files, run shell commands, call
  `sero-cli`, open browsers, or use custom tools.
- Concurrency: define whether multiple loops can run in one workspace, whether
  attempts can overlap, and how cancellation propagates to running subagents or
  commands.
- Checks and evals: define check types, result shape, timeout behavior, output
  truncation, and how failed checks become next-attempt context.
- Stop rules: define success, max attempts, no-progress detection, user pause,
  unsafe workspace state, and manual override behavior.
- VCS safety: define when checkpoints are created, when restore is offered, and
  when worktrees are mandatory.
- Logging: define attempt-log retention, output limits, and which data belongs
  in the main state file versus artifact files.
- Recursion guardrails: define whether Orchestrator-generated workers can create
  or modify Orchestrator loops.

## Recommendation

Implement Orchestrator as a thin durable coordinator over existing Sero
primitives:

- New workspace-scoped built-in plugin for goals, triggers, checks, attempts,
  task plans, logs, UI, and CLI tools.
- Shared loop coordinator with separate execution adapters for
  background-worker mode and active-session mode.
- Single-executor rule: tools and UI request actions; the coordinator executes
  and advances attempts.
- Existing subagent runtime for generated planner, implementer, reviewer, and
  summarizer workers.
- Existing verification runtime as the check/eval seam.
- Existing app runtime git/VCS APIs for checkpoints, diffs, restore, and
  worktrees.
- Existing cron plugin patterns for scheduled firing, but not its transient
  session runner.
- Existing Pi extension events and CLI bridge for lifecycle and tool
  integration.
- New desktop host seam for safe active-session targeting and re-wake.
- Canonical attempt workdir used consistently by workers, checks, VCS, and
  artifacts.
- Sero-managed in-workspace worktrees for isolated execution unless host/runtime
  support is expanded for external worktrees.
- Lightweight global supervisor for scheduled intent, with workspace
  coordinators remaining the only executors.

This gives Sero the loop-based workflow from the clean-room spec while keeping
the implementation aligned with the systems already present in the desktop app.
The architecture should target the full Orchestrator behavior first; phasing is
only the order in which the pieces are built.
