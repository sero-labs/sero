/**
 * Tests for extension-level scheduler lifecycle behavior.
 *
 * Validates that lastTickMinute is persisted to state on shutdown/stop,
 * replayed on restart, and isolated per state file.
 */

import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CRON_STATE } from '../../shared/types';
import type { CronJob, CronState } from '../../shared/types';

type SessionCtx = {
  cwd: string;
  ui?: { notify: ReturnType<typeof vi.fn> };
};

type FakePi = {
  events: { emit: ReturnType<typeof vi.fn> };
  on: (event: string, handler: (...args: unknown[]) => Promise<void>) => void;
  registerCommand: (name: string, command: { handler: (args?: string, ctx?: SessionCtx) => Promise<void> }) => void;
  registerTool: ReturnType<typeof vi.fn>;
};

const LIFECYCLE_TEST_TIMEOUT_MS = 15_000;

const stateStore = new Map<string, CronState>();
const schedulerInstances: MockCronScheduler[] = [];

function cloneState(state: CronState): CronState {
  return JSON.parse(JSON.stringify(state)) as CronState;
}

function defaultState(overrides?: Partial<CronState>): CronState {
  return {
    ...DEFAULT_CRON_STATE,
    jobs: [],
    reminders: [],
    lastRunResults: [],
    ...overrides,
  };
}

function statePathFor(cwd: string): string {
  return path.join(cwd, '.sero', 'apps', 'cron', 'state.json');
}

function makeJob(overrides?: Partial<CronJob>): CronJob {
  return {
    name: 'daily-report',
    schedule: '0 9 * * *',
    prompt: 'Generate the report',
    channel: 'cron',
    disabled: false,
    ...overrides,
  };
}

class MockCronScheduler {
  public running = false;
  public lastTickMinute = '';
  public start = vi.fn((
    _jobs: CronJob[],
    _cwd?: string,
    _reminders?: CronState['reminders'],
    _opts?: { lastTickMinute?: string },
  ) => {
    this.running = true;
  });
  public stop = vi.fn(() => {
    this.running = false;
  });
  public updateJobs = vi.fn();
  public updateReminders = vi.fn();

  constructor() {
    schedulerInstances.push(this);
  }

  isRunning(): boolean {
    return this.running;
  }

  getLastTickMinute(): string {
    return this.lastTickMinute;
  }
}

const readStateMock = vi.fn(async (filePath: string) =>
  cloneState(stateStore.get(filePath) ?? defaultState()),
);
const writeStateMock = vi.fn(async (filePath: string, state: CronState) => {
  stateStore.set(filePath, cloneState(state));
});

vi.mock('../scheduler', () => ({
  CronScheduler: MockCronScheduler,
}));

vi.mock('../state-io', () => ({
  resolveStatePath: (cwd: string) => statePathFor(cwd),
  withStateLock: async <T>(_statePath: string, fn: () => Promise<T>) => fn(),
  readState: (filePath: string) => readStateMock(filePath),
  writeState: (filePath: string, state: CronState) => writeStateMock(filePath, state),
}));

vi.mock('../state-watcher', () => ({
  StateWatcher: class {
    start(): void {}
    stop(): void {}
    markOwnWrite(): void {}
  },
}));

vi.mock('../logger', () => ({
  initLogger: vi.fn(),
  setLogPath: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../notifier', () => ({
  initNotifier: vi.fn(),
  notifyReminder: vi.fn(),
  notifyJobComplete: vi.fn(),
}));

function createFakePi(): {
  pi: FakePi;
  handlers: Record<string, (...args: unknown[]) => Promise<void>>;
  commands: Map<string, { handler: (args?: string, ctx?: SessionCtx) => Promise<void> }>;
} {
  const handlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
  const commands = new Map<string, { handler: (args?: string, ctx?: SessionCtx) => Promise<void> }>();

  return {
    pi: {
      events: { emit: vi.fn() },
      on: (event, handler) => {
        handlers[event] = handler;
      },
      registerCommand: (name, command) => {
        commands.set(name, command);
      },
      registerTool: vi.fn(),
    },
    handlers,
    commands,
  };
}

async function loadExtension() {
  vi.resetModules();
  const mod = await import('../index');
  return mod.default;
}

beforeEach(() => {
  schedulerInstances.length = 0;
  stateStore.clear();
  readStateMock.mockClear();
  writeStateMock.mockClear();
  delete process.env.SERO_HOME;
  delete process.env.SERO_CRON_SUBPROCESS;
});

afterEach(() => {
  delete process.env.SERO_HOME;
  delete process.env.SERO_CRON_SUBPROCESS;
});

describe('cron extension lifecycle', () => {
  it('persists lastTickMinute on last session shutdown and reuses it on autostart', async () => {
    const cwd = '/workspace-a';
    const statePath = statePathFor(cwd);
    const minuteKey = '2025-6-15-9-0';

    stateStore.set(statePath, defaultState({
      autostart: true,
      jobs: [makeJob()],
    }));

    const registerExtension = await loadExtension();
    const { pi, handlers } = createFakePi();
    registerExtension(pi as never);

    await handlers.session_start({}, { cwd });
    expect(schedulerInstances).toHaveLength(1);

    schedulerInstances[0].lastTickMinute = minuteKey;
    await handlers.session_shutdown();

    expect(stateStore.get(statePath)?.lastTickMinute).toBe(minuteKey);
    expect(schedulerInstances[0].stop).toHaveBeenCalledTimes(1);

    await handlers.session_start({}, { cwd });
    expect(schedulerInstances).toHaveLength(2);
    expect(schedulerInstances[1].start.mock.calls[0]?.[3]).toEqual({
      lastTickMinute: minuteKey,
    });
  }, LIFECYCLE_TEST_TIMEOUT_MS);

  it('keeps lastTickMinute isolated per workspace state file', async () => {
    const cwdA = '/workspace-a';
    const cwdB = '/workspace-b';
    const statePathA = statePathFor(cwdA);
    const statePathB = statePathFor(cwdB);
    const notify = vi.fn();

    stateStore.set(statePathA, defaultState({ jobs: [makeJob()] }));
    stateStore.set(statePathB, defaultState({ jobs: [makeJob({ name: 'other-job' })] }));

    const registerExtension = await loadExtension();
    const { pi, handlers, commands } = createFakePi();
    registerExtension(pi as never);

    await handlers.session_start({}, { cwd: cwdA });
    await commands.get('cron')?.handler('on', { cwd: cwdA, ui: { notify } });
    expect(schedulerInstances).toHaveLength(1);

    schedulerInstances[0].lastTickMinute = 'minute-from-a';
    await commands.get('cron')?.handler('off', { cwd: cwdA, ui: { notify } });
    expect(stateStore.get(statePathA)?.lastTickMinute).toBe('minute-from-a');

    await handlers.session_shutdown();
    await handlers.session_start({}, { cwd: cwdB });
    await commands.get('cron')?.handler('on', { cwd: cwdB, ui: { notify } });

    expect(schedulerInstances).toHaveLength(2);
    expect(schedulerInstances[1].start.mock.calls[0]?.[3]).toBeUndefined();
    expect(stateStore.get(statePathB)?.lastTickMinute).toBe('');
  }, LIFECYCLE_TEST_TIMEOUT_MS);
});
