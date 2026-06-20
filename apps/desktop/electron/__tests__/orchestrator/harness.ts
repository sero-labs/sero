// Shared test harness for the durable coordinator core (Phase 2). It wires a
// real WorkspaceCoordinator to an in-memory `host.*` so the state machine,
// locks, stop rules, budgets, baseRef/dirty-root gate, checks, and artifacts run
// end to end. appState is JSON-backed per file (mirroring the atomic tmp+rename
// host), git/verification are scriptable, and artifacts write to a real temp dir.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
  AppRuntimeHost,
  AppRuntimeNotificationOptions,
  AppRuntimeVerificationCommandResult,
} from '@sero-ai/common';

import {
  WorkspaceCoordinator,
  type CoordinatorContext,
} from '@plugins/sero-orchestrator-plugin/runtime/coordinator';
import { MapAdapterRegistry, type AttemptAdapter } from '@plugins/sero-orchestrator-plugin/runtime/adapter';
import type { Clock } from '@plugins/sero-orchestrator-plugin/runtime/clock';
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

export type VerifyFn = (command: string) => AppRuntimeVerificationCommandResult;

const okVerify: VerifyFn = (command) => ({
  command,
  success: true,
  stdout: '',
  stderr: '',
  durationMs: 5,
});

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
}

export interface Harness {
  coordinator: WorkspaceCoordinator;
  host: AppRuntimeHost;
  stateFilePath: string;
  artifactRoot: string;
  notifications: AppRuntimeNotificationOptions[];
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
}

function makeHost(opts: HarnessOptions, fake: FakeState): AppRuntimeHost {
  const verify = opts.verify ?? okVerify;
  const head = opts.head ?? 'HEAD0000';
  const dirty = opts.dirty ?? false;
  const checkpoint = opts.checkpoint === undefined ? 'SAVED111' : opts.checkpoint;

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
        if (command === 'git rev-parse HEAD') {
          return { stdout: `${head}\n`, stderr: '', exitCode: 0 };
        }
        if (command === 'git status --porcelain') {
          return { stdout: dirty ? ' M src/file.ts\n' : '', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    },
    git: {
      async createCheckpoint(_cwd: string, _message: string) {
        return checkpoint;
      },
    },
    notifications: {
      notify(options: AppRuntimeNotificationOptions) {
        fake.notifications.push(options);
      },
    },
  };

  return host as unknown as AppRuntimeHost;
}

export function createHarness(opts: HarnessOptions = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'orch-core-'));
  const stateFilePath = join(dir, '.sero', 'apps', 'orchestrator', 'state.json');
  const artifactRoot = join(dirname(stateFilePath), 'artifacts');
  const fake: FakeState = { files: new Map(), notifications: [] };
  const host = makeHost(opts, fake);

  const ctx: CoordinatorContext = {
    host,
    workspaceId: WORKSPACE_ID,
    workspacePath: dir,
    stateFilePath,
    adapters: opts.adapter ? new MapAdapterRegistry([opts.adapter]) : new MapAdapterRegistry(),
    dirtyRootGate: opts.gate,
    clock: opts.clock,
    maxConcurrentAttempts: opts.maxConcurrentAttempts,
    schedulerLog: opts.schedulerLog,
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
    artifactRoot,
    notifications: fake.notifications,
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
