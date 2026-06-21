// Shared test harness for the durable coordinator core (Phase 2). It wires a
// real WorkspaceCoordinator to an in-memory `host.*` so the state machine,
// locks, stop rules, budgets, baseRef/dirty-root gate, checks, and artifacts run
// end to end. appState is JSON-backed per file (mirroring the atomic tmp+rename
// host), git/verification are scriptable, and artifacts write to a real temp dir.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
  ActiveSession,
  AppRuntimeCreatePullRequestResult,
  AppRuntimeHost,
  AppRuntimeMergePullRequestResult,
  AppRuntimeNotificationOptions,
  AppRuntimePullRequestMergeState,
  AppRuntimeSessionHost,
  AppRuntimeSubagentRunParams,
  AppRuntimeSubagentResult,
  AppRuntimeVerificationCommandResult,
  ExtensionRuntimeContent,
  SessionState,
  TurnCompletionStatus,
} from '@sero-ai/common';

import { type GitControl, makeGitControl, makeWorktreePrGit } from './harness-git';
import {
  makeSessionHost,
  makeWorkspaceEvents,
  type WorkspaceEventControl,
  type WorkspaceEventFakes,
} from './harness-events';

import {
  WorkspaceCoordinator,
  type CoordinatorContext,
} from '@plugins/sero-orchestrator-plugin/runtime/coordinator';
import { MapAdapterRegistry, type AttemptAdapter } from '@plugins/sero-orchestrator-plugin/runtime/adapter';
import type { AlarmTimer } from '@plugins/sero-orchestrator-plugin/runtime/alarm';
import type { Clock } from '@plugins/sero-orchestrator-plugin/runtime/clock';
import type { PlannerRunner } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { Reflector } from '@plugins/sero-orchestrator-plugin/runtime/reflection';
import type { SchedulerLog } from '@plugins/sero-orchestrator-plugin/runtime/scheduler';
import type { DirtyRootGate } from '@plugins/sero-orchestrator-plugin/runtime/vcs';
import type {
  CreateLoopInput,
  LoopGoal,
  OrchestratorState,
} from '@plugins/sero-orchestrator-plugin/shared/types';

export const WORKSPACE_ID = 'ws-orch';
const DEFAULT_NOW = 1_700_000_000_000;

export interface ClockControl {
  clock: Clock;
  advance(ms: number): void;
  set(ms: number): void;
  nowMs(): number;
}

export function makeClock(startMs = DEFAULT_NOW): ClockControl {
  let now = startMs;
  return {
    clock: () => now,
    advance: (ms) => {
      now += ms;
    },
    set: (ms) => {
      now = ms;
    },
    nowMs: () => now,
  };
}

/** A controllable one-shot {@link AlarmTimer} for cron-alarm tests (Phase 5). */
export interface FakeAlarmTimer extends AlarmTimer {
  /** The currently-armed delay in ms, or null when disarmed. */
  armedDelay(): number | null;
  /** Invoke the armed callback (simulate the timer elapsing). */
  fire(): void;
}

export function makeFakeTimer(): FakeAlarmTimer {
  let delay: number | null = null;
  let cb: (() => void) | null = null;
  return {
    arm(d, c) {
      delay = d;
      cb = c;
    },
    disarm() {
      delay = null;
      cb = null;
    },
    armedDelay: () => delay,
    fire: () => cb?.(),
  };
}

/** Lets async work scheduled by a fired alarm/event settle (no real timers used). */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

export type VerifyFn = (command: string) => AppRuntimeVerificationCommandResult;

const okVerify: VerifyFn = (command) => ({
  command,
  success: true,
  stdout: '',
  stderr: '',
  durationMs: 5,
});

/**
 * A scriptable worker for the REAL background-worker adapter. It returns the
 * subagent reply and may declare the files/diff it produced; the harness applies
 * those to the stateful git world so post-attempt `git status`/`git diff`
 * reflect them (and a later `git reset --hard` clears them).
 */
export type WorkerScript = (
  params: AppRuntimeSubagentRunParams,
  world: FakeGitWorld,
) => Promise<WorkerScriptResult> | WorkerScriptResult;

export interface WorkerScriptResult {
  response?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; cost?: number };
  modelId?: string;
  /** Files the worker produced — become the post-attempt `git status` delta. */
  changedFiles?: string[];
  /** Diff text the worker produced — drives the diff fingerprint. */
  diff?: string;
}

/** Mutable git state the scriptable worker drives across an attempt. */
export interface FakeGitWorld {
  head: string;
  changed: string[];
  diff: string;
}

/** What a steered active-session turn produces (active-session adapter, Phase 4). */
export interface SteerResult {
  /** How the turn ends; defaults to `completed`. */
  status?: TurnCompletionStatus;
  /** Files the steered turn produced — become the post-turn `git status` delta. */
  changedFiles?: string[];
  /** Diff text the steered turn produced — drives the diff fingerprint. */
  diff?: string;
}

/** Drives a steered active-session turn: mutates the git world, resolves the turn. */
export type SteerScript = (
  content: ExtensionRuntimeContent,
  world: FakeGitWorld,
) => Promise<SteerResult> | SteerResult;

/** Configures the fake `host.session` used by the active-session adapter (Phase 4). */
export interface SessionOptions {
  /** Resolved active session; `null` → none to steer. Defaults to a live session. */
  active?: ActiveSession | null;
  /** Idle/pending snapshot. Defaults to idle with no pending messages. */
  state?: SessionState;
  /** Steers a turn when one is triggered; absent → the turn completes as a no-op. */
  steer?: SteerScript;
}

export interface HarnessOptions {
  adapter?: AttemptAdapter;
  gate?: DirtyRootGate;
  clock?: Clock;
  verify?: VerifyFn;
  head?: string;
  dirty?: boolean;
  checkpoint?: string | null;
  maxConcurrentAttempts?: number;
  schedulerLog?: SchedulerLog;
  /** Drives `host.subagents.runStructured` for tests of the real adapter. */
  runWorker?: WorkerScript;
  /**
   * Verification planner seam (spec 05). Omitted → planning disabled, loops are
   * created `active` with no plan (the legacy default these suites rely on).
   * Provided → loops start `draft` and this derives the plan (settle to observe
   * the flip to `active`).
   */
  planner?: PlannerRunner;
  /**
   * Advisory reflector seam (the redefined P-E). Omitted → reflection disabled
   * (the default); provided → reflects on blocked/stopped transitions and the
   * health check (settle to observe).
   */
  reflector?: Reflector;
  /** Configures `host.session` for active-session / hybrid tests (Phase 4). */
  session?: SessionOptions;
  /** `host.git.pushBranch` result for PR tests (Phase 6); defaults to success. */
  pushBranch?: boolean;
  /** `host.git.createPr` result for PR tests (Phase 6); defaults to a success ref. */
  createPrResult?: AppRuntimeCreatePullRequestResult;
  /** `host.git.mergePr` result for PR tests (Phase 6); defaults to merged. */
  mergePrResult?: AppRuntimeMergePullRequestResult;
  /** `host.git.getPrMergeState` result for PR tests (Phase 6); defaults to 'open'. */
  prMergeState?: AppRuntimePullRequestMergeState;
  /** `git log …` output for `gitLog` evidence gathering (spec 05); defaults to ''. */
  gitLog?: string;
  /** File contents returned for `read` evidence (`cat -- <path>`), keyed by path. */
  files?: Record<string, string>;
}

/** Drives a session turn completion for event-router tests (Phase 5). */
export interface SessionControl {
  /** Fire `onTurnComplete` for every subscriber with this turn id/status. */
  emitTurn(turnId: string, status?: TurnCompletionStatus): void;
  /** How many live `onTurnComplete` subscribers there are. */
  listenerCount(): number;
}

export interface Harness {
  coordinator: WorkspaceCoordinator;
  host: AppRuntimeHost;
  stateFilePath: string;
  /** Absolute workspace root (worktrees resolve under `<workspacePath>/.sero/worktrees`). */
  workspacePath: string;
  artifactRoot: string;
  notifications: AppRuntimeNotificationOptions[];
  /** Controllable cron alarm timer (Phase 5); inspect/fire after `armSchedule()`. */
  timer: FakeAlarmTimer;
  /** Emit session turn completions for event-trigger tests (Phase 5). */
  session: SessionControl;
  /** Emit vcs commits / workspace changes for event-trigger tests (Phase 6). */
  events: WorkspaceEventControl;
  /** Worktree/PR host-call recorder for the Phase 6 isolation + PR flow. */
  git: GitControl;
  /** Every cwd passed to `host.workspace.runCommand` — proves checks/diff target the worktree. */
  commandCwds: string[];
  /** Every command string passed to `host.workspace.runCommand` (evidence gathering, VCS). */
  commands: string[];
  /** Every cwd passed to `host.subagents.runStructured` — proves the worker runs at the worktree. */
  subagentCwds: string[];
  /** Stateful git the real adapter reads/writes; inspect after a run. */
  world: FakeGitWorld;
  readState(): Promise<OrchestratorState>;
  loop(id: string): Promise<LoopGoal | undefined>;
  patchLoop(id: string, patch: (loop: LoopGoal) => void): Promise<void>;
  createLoop(input?: Partial<CreateLoopInput>): Promise<string>;
  readArtifact(relPath: string): string;
  cleanup(): void;
}

interface FakeState {
  files: Map<string, string>;
  notifications: AppRuntimeNotificationOptions[];
  world: FakeGitWorld;
  session: SessionControl;
  git: GitControl;
  commandCwds: string[];
  commands: string[];
  subagentCwds: string[];
  events: WorkspaceEventFakes;
}

function makeHost(opts: HarnessOptions, fake: FakeState, session: AppRuntimeSessionHost): AppRuntimeHost {
  const verify = opts.verify ?? okVerify;
  const checkpoint = opts.checkpoint === undefined ? 'SAVED111' : opts.checkpoint;
  const world = fake.world;
  const git = fake.git;

  const host = {
    appState: {
      async read<T>(path: string): Promise<T | null> {
        const raw = fake.files.get(path);
        return raw ? (JSON.parse(raw) as T) : null;
      },
      async update<T>(path: string, updater: (current: T | null) => T): Promise<void> {
        const raw = fake.files.get(path);
        const current = raw ? (JSON.parse(raw) as T) : null;
        fake.files.set(path, JSON.stringify(updater(current)));
      },
      watch() {},
      unwatch() {},
    },
    subagents: {
      async runStructured(params: AppRuntimeSubagentRunParams): Promise<AppRuntimeSubagentResult> {
        if (params.cwd) fake.subagentCwds.push(params.cwd);
        if (!opts.runWorker) return { response: '' };
        const result = await opts.runWorker(params, world);
        if (result.changedFiles) world.changed = [...result.changedFiles];
        if (result.diff !== undefined) world.diff = result.diff;
        return {
          response: result.response ?? '',
          error: result.error,
          usage: result.usage,
          modelId: result.modelId,
        };
      },
      onLiveOutput() {
        return () => {};
      },
    },
    verification: {
      async runCommands(_workspaceId: string, _cwd: string, commands: string[]) {
        const results = commands.map((command) => verify(command));
        return { success: results.every((result) => result.success), results };
      },
      summarizeFailure(result: AppRuntimeVerificationCommandResult) {
        return `Check failed: ${result.command}`;
      },
    },
    workspace: {
      async runCommand(_workspaceId: string, _cwd: string, command: string) {
        fake.commandCwds.push(_cwd);
        fake.commands.push(command);
        if (command === 'git rev-parse HEAD') {
          return { stdout: `${world.head}\n`, stderr: '', exitCode: 0 };
        }
        if (command === 'git status --porcelain') {
          const stdout = world.changed.map((file) => ` M ${file}`).join('\n');
          return { stdout: stdout ? `${stdout}\n` : '', stderr: '', exitCode: 0 };
        }
        if (command.startsWith('git diff')) {
          return { stdout: world.diff, stderr: '', exitCode: 0 };
        }
        if (command.startsWith('git reset --hard')) {
          world.changed = [];
          world.diff = '';
          return { stdout: '', stderr: '', exitCode: 0 };
        }
        // Evidence gathering (spec 05): `gitLog` and `read` evidence steps.
        if (command.startsWith('git log')) {
          return { stdout: opts.gitLog ?? '', stderr: '', exitCode: 0 };
        }
        if (command.startsWith('cat -- ')) {
          const path = command.slice('cat -- '.length).replace(/^"|"$/g, '');
          return { stdout: opts.files?.[path] ?? '', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
      onChange: fake.events.onChange,
    },
    git: {
      async createCheckpoint(_cwd: string, _message: string) {
        // Model a commit: the working-tree delta folds into a new HEAD.
        if (checkpoint) {
          world.changed = [];
          world.diff = '';
          world.head = checkpoint;
        }
        return checkpoint;
      },
      async getDiff(_cwd: string) {
        return world.diff;
      },
      async getDiffSummary(_cwd: string) {
        return world.diff;
      },
      onCommit: fake.events.onCommit,
      // Phase 6: worktree isolation + PR flow (split into harness-git.ts).
      ...makeWorktreePrGit(opts, git),
    },
    notifications: {
      notify(options: AppRuntimeNotificationOptions) {
        fake.notifications.push(options);
      },
    },
    session,
  };

  return host as unknown as AppRuntimeHost;
}

export function createHarness(opts: HarnessOptions = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'orch-core-'));
  const stateFilePath = join(dir, '.sero', 'apps', 'orchestrator', 'state.json');
  const artifactRoot = join(dirname(stateFilePath), 'artifacts');
  const world: FakeGitWorld = {
    head: opts.head ?? 'HEAD0000',
    changed: opts.dirty ? ['src/file.ts'] : [],
    diff: '',
  };
  const session = makeSessionHost(opts.session, world, WORKSPACE_ID);
  const events = makeWorkspaceEvents(WORKSPACE_ID);
  const fake: FakeState = {
    files: new Map(),
    notifications: [],
    world,
    session: session.control,
    git: makeGitControl(dir),
    commandCwds: [],
    commands: [],
    subagentCwds: [],
    events,
  };
  const host = makeHost(opts, fake, session.host);
  const timer = makeFakeTimer();

  const ctx: CoordinatorContext = {
    host,
    workspaceId: WORKSPACE_ID,
    workspacePath: dir,
    stateFilePath,
    // A fake adapter is injected directly; otherwise a `runWorker` or `session`
    // script means the test wants the REAL default adapters (omit `adapters` so
    // the coordinator builds them); with neither, an empty registry keeps
    // `run_next` at "not yet".
    adapters: opts.adapter
      ? new MapAdapterRegistry([opts.adapter])
      : opts.runWorker || opts.session
        ? undefined
        : new MapAdapterRegistry(),
    dirtyRootGate: opts.gate,
    clock: opts.clock,
    maxConcurrentAttempts: opts.maxConcurrentAttempts,
    schedulerLog: opts.schedulerLog,
    alarmTimer: timer,
    // null disables planning (legacy active-on-create) so existing suites are
    // untouched; a provided script opts into the spec-05 draft→derive→active flow.
    planner: opts.planner ?? null,
    // null disables reflection by default so existing suites are untouched.
    reflector: opts.reflector ?? null,
  };
  const coordinator = new WorkspaceCoordinator(ctx);

  const readState = async (): Promise<OrchestratorState> => {
    const raw = fake.files.get(stateFilePath);
    return raw ? (JSON.parse(raw) as OrchestratorState) : { version: 1, loops: [] };
  };

  return {
    coordinator,
    host,
    stateFilePath,
    workspacePath: dir,
    artifactRoot,
    notifications: fake.notifications,
    timer,
    session: fake.session,
    events: events.control,
    git: fake.git,
    commandCwds: fake.commandCwds,
    commands: fake.commands,
    subagentCwds: fake.subagentCwds,
    world: fake.world,
    readState,
    async loop(id) {
      const state = await readState();
      return state.loops.find((candidate) => candidate.id === id);
    },
    async patchLoop(id, patch) {
      const state = await readState();
      const loop = state.loops.find((candidate) => candidate.id === id);
      if (!loop) throw new Error(`no loop ${id}`);
      patch(loop);
      fake.files.set(stateFilePath, JSON.stringify(state));
    },
    async createLoop(input = {}) {
      const result = await coordinator.requestAction({
        kind: 'create',
        input: { title: 'Goal', goal: 'Do the thing', ...input },
      });
      if (!result.loop) throw new Error(result.error ?? 'create failed');
      return result.loop.id;
    },
    readArtifact(relPath) {
      return readFileSync(join(dirname(stateFilePath), relPath), 'utf8');
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A fake adapter returning a fixed (or computed) execution result. */
export function fakeAdapter(
  mode: AttemptAdapter['mode'],
  execute: AttemptAdapter['execute'],
): AttemptAdapter {
  return { mode, execute };
}

export const delay = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
