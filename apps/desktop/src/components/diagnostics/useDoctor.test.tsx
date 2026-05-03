// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DoctorProgressEvent,
  DoctorReport,
  DoctorRunArgs,
} from '@/types/ipc';
import { useDoctor } from './useDoctor';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface DoctorBridgeMock {
  run: ReturnType<typeof vi.fn>;
  runQuick: ReturnType<typeof vi.fn>;
  exportReport: ReturnType<typeof vi.fn>;
  copyReport: ReturnType<typeof vi.fn>;
  invokeRepair: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  /** Test-only escape hatch: dispatch an event to all current listeners. */
  __emit(event: DoctorProgressEvent): void;
}

let bridge: DoctorBridgeMock;
let listeners: Array<(event: DoctorProgressEvent) => void>;

function makeReport(overrides: Partial<DoctorReport> = {}): DoctorReport {
  return {
    schemaVersion: 1,
    timestamp: '2026-05-03T00:00:00.000Z',
    mode: 'in-app',
    system: { os: 'darwin', version: '24.0.0', arch: 'arm64' },
    seroVersion: '0.0.0',
    runId: 'will-be-overridden',
    profilesScanned: [],
    results: [],
    envAudit: { present: [], missing: [], recommended: [] },
    durationMs: 0,
    ...overrides,
  };
}

beforeEach(() => {
  listeners = [];
  bridge = {
    run: vi.fn(),
    runQuick: vi.fn(),
    exportReport: vi.fn(),
    copyReport: vi.fn(),
    invokeRepair: vi.fn(),
    onEvent: vi.fn((handler: (event: DoctorProgressEvent) => void) => {
      listeners.push(handler);
      return () => {
        listeners = listeners.filter((h) => h !== handler);
      };
    }),
    __emit(event: DoctorProgressEvent) {
      for (const handler of listeners) handler(event);
    },
  };
  (globalThis as unknown as { window: { sero: { doctor: DoctorBridgeMock } } }).window = {
    sero: { doctor: bridge },
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

interface HookHandle {
  current: ReturnType<typeof useDoctor> | null;
}

function mountHook(): { handle: HookHandle; root: Root; container: HTMLElement } {
  const handle: HookHandle = { current: null };
  function HookHost(): null {
    handle.current = useDoctor();
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<HookHost />);
  });
  return { handle, root, container };
}

describe('useDoctor — runId-scoped progress', () => {
  it('only commits the report when the run is the most recent one', async () => {
    let resolveFirst!: (report: DoctorReport) => void;
    let resolveSecond!: (report: DoctorReport) => void;
    bridge.run
      .mockImplementationOnce(
        (args?: DoctorRunArgs) =>
          new Promise<DoctorReport>((resolve) => {
            resolveFirst = (report) =>
              resolve({ ...report, runId: args?.runId ?? '' });
          }),
      )
      .mockImplementationOnce(
        (args?: DoctorRunArgs) =>
          new Promise<DoctorReport>((resolve) => {
            resolveSecond = (report) =>
              resolve({ ...report, runId: args?.runId ?? '' });
          }),
      );

    const { handle } = mountHook();
    expect(handle.current).not.toBeNull();

    let firstRun: Promise<void>;
    let secondRun: Promise<void>;
    act(() => {
      firstRun = handle.current!.run();
    });
    act(() => {
      secondRun = handle.current!.run();
    });

    // Resolve the FIRST call last to simulate a stale finisher.
    act(() => {
      resolveSecond(makeReport({ seroVersion: 'second' }));
    });
    await act(async () => {
      await secondRun;
    });
    act(() => {
      resolveFirst(makeReport({ seroVersion: 'first-stale' }));
    });
    await act(async () => {
      await firstRun;
    });

    // The committed report must be from the second (latest) run.
    expect(handle.current!.report?.seroVersion).toBe('second');
  });

  it('ignores progress events whose runId does not match the active run', () => {
    bridge.run.mockResolvedValue(makeReport());
    const { handle } = mountHook();
    act(() => {
      void handle.current!.run({ runId: 'mine' });
    });

    // Stray event from a different run — must be ignored.
    act(() => {
      bridge.__emit({
        kind: 'check-done',
        runId: 'someone-else',
        result: {
          id: 'x',
          category: 'system',
          status: 'pass',
          message: 'noise',
          durationMs: 1,
        },
      });
    });
    expect(handle.current!.runState.inFlight).toBe(0);

    // Real event for the active run — must update the inflight count.
    act(() => {
      bridge.__emit({
        kind: 'check-done',
        runId: 'mine',
        result: {
          id: 'y',
          category: 'system',
          status: 'pass',
          message: 'real',
          durationMs: 1,
        },
      });
    });
    expect(handle.current!.runState.inFlight).toBe(1);
  });
});
