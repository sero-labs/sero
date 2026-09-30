// @vitest-environment jsdom

/**
 * Several one-answer calls can run at once, and each view keeps its own.
 *
 * The channel used to hold one call in a single slot with an unscoped clear, so
 * with two Workflows reflecting at once the second call overwrote the first and
 * whichever finished first cleared the other's view. Calls are held in a map by
 * identity, and an `ended` update names only its own call.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ handler: null as ((update: unknown) => void) | null }));

vi.mock('@sero-ai/app-runtime', () => ({
  useAppRuntimeEvents: (_topic: string, handler: (update: unknown) => void) => {
    bridge.handler = handler;
  },
}));

import { useLiveCall } from '../lib/use-live-call';
import type { LiveCallNotice } from '../../shared/types';

let container: HTMLDivElement;
let root: Root;
let seen: LiveCallNotice | undefined;

function Probe({ loopId, kind = 'reflect' }: { loopId: string; kind?: 'reflect' | 'stop' }) {
  seen = useLiveCall({ kind, loopId });
  return <span>{seen?.runId ?? 'none'}</span>;
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  bridge.handler = null;
  seen = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function deliver(update: unknown) {
  act(() => bridge.handler?.(update));
}

describe('a running one-answer call, by identity', () => {
  it('keeps its own call when another Workflow’s call ends', async () => {
    await act(async () => root.render(<Probe loopId="loop-a" />));

    deliver({ status: 'running', call: { kind: 'reflect', runId: 'run-a', loopId: 'loop-a' } });
    deliver({ status: 'running', call: { kind: 'reflect', runId: 'run-b', loopId: 'loop-b' } });
    // Two calls of the same kind are both held; this view takes only its own.
    expect(seen?.runId).toBe('run-a');

    // The other Workflow's call finishing must not clear this view.
    deliver({ status: 'ended', identity: { kind: 'reflect', loopId: 'loop-b' } });
    expect(seen?.runId).toBe('run-a');

    // Its own call ending does clear it. An ended update names its kind too, so
    // it can only ever remove the call it belongs to.
    deliver({ status: 'ended', identity: { kind: 'reflect', loopId: 'loop-a' } });
    expect(seen).toBeUndefined();
  });

  it('keeps a reflection and a stop check apart in the same Workflow', async () => {
    // One Workflow can be reflecting while its stop condition is checked. They
    // are two calls: the second must not overwrite the first, and the first
    // ending must not clear the second.
    await act(async () => root.render(<Probe loopId="loop-a" kind="reflect" />));

    deliver({ status: 'running', call: { kind: 'reflect', runId: 'run-reflect', loopId: 'loop-a' } });
    deliver({ status: 'running', call: { kind: 'stop', runId: 'run-stop', loopId: 'loop-a' } });
    expect(seen?.runId).toBe('run-reflect');

    // The stop check ending names its own kind, so the reflection survives.
    deliver({ status: 'ended', identity: { kind: 'stop', loopId: 'loop-a' } });
    expect(seen?.runId).toBe('run-reflect');
  });

  it('ignores a call of another kind for the same Workflow', async () => {
    await act(async () => root.render(<Probe loopId="loop-a" kind="stop" />));

    deliver({ status: 'running', call: { kind: 'reflect', runId: 'run-a', loopId: 'loop-a' } });
    expect(seen).toBeUndefined();

    deliver({ status: 'running', call: { kind: 'stop', runId: 'run-stop', loopId: 'loop-a' } });
    expect(seen?.runId).toBe('run-stop');
  });

  it('accepts any call of a kind when the view has no record to match on yet', async () => {
    // Planning a brand-new Workflow: there is no loop record for the view to name.
    await act(async () => root.render(<Probe loopId="ignored" kind="reflect" />));
    deliver({ status: 'running', call: { kind: 'reflect', runId: 'run-new', loopId: 'loop-new' } });

    // The probe names loopId, so it does not take another loop's call...
    expect(seen).toBeUndefined();
  });
});
