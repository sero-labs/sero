// @vitest-environment jsdom

/**
 * The Room header's clock holds while the Room is paused.
 *
 * The captured defect read `229h 28m of 1h` on a Room paused nine days earlier,
 * because the header recomputed `Date.now() - startedAt` on every render.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedRoom } from '../../shared/room-types';
import { RoomTopBar } from '../components/RoomTopBar';

const T0 = Date.parse('2026-09-01T10:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A Room that ran for twelve minutes and was then paused. */
function pausedRoom(): PersistedRoom {
  return {
    definition: {
      title: 'CSV Summariser Adversarial Validation',
      envelope: { maxWallClockMs: HOUR, maxCostUsd: 2, maxActiveTurns: 3, maxTokens: 1e9, maxRosterRevisions: 5 },
    },
    runtime: {
      status: 'paused',
      startedAt: new Date(T0).toISOString(),
      endedAt: null,
      activeMs: 12 * MINUTE,
      activeSince: null,
      activeMemberIds: [],
      usage: { costUsd: 0.31 },
      stopReason: null,
      messageSequence: 0,
      timelineSequence: 0,
      appliedCommandIds: [],
      lastProgressAt: null,
    },
    members: [],
  } as unknown as PersistedRoom;
}

describe('RoomTopBar clock', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  const render = async (room: PersistedRoom, onDelete: () => void = () => undefined) => act(async () => root.render(
    <RoomTopBar
      room={room}
      view="timeline"
      busy={false}
      panelOpen={false}
      holding={false}
      onTogglePanel={() => undefined}
      onBack={() => undefined}
      onView={() => undefined}
      onMessage={() => undefined}
      onPause={() => undefined}
      onResume={() => undefined}
      onStop={() => undefined}
      onDelete={onDelete}
    />,
  ));

  it('does not grow while the Room is paused', async () => {
    const room = pausedRoom();
    vi.useFakeTimers();

    vi.setSystemTime(T0 + 20 * MINUTE);
    await render(room);
    const first = container.querySelector('[aria-label^="Time used:"]')?.getAttribute('aria-label');

    // Nine days later, with the record unchanged.
    vi.setSystemTime(T0 + 9 * 24 * HOUR);
    await render({ ...room });
    const later = container.querySelector('[aria-label^="Time used:"]')?.getAttribute('aria-label');

    expect(first).toBe(later);
    expect(first).not.toContain('229h');
  });

  it('counts the time the Room actually ran', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 9 * 24 * HOUR);
    await render(pausedRoom());
    expect(container.querySelector('[aria-label^="Time used:"]')?.getAttribute('aria-label')).toBe('Time used: 12m');
  });

  it('offers Delete Room from the ⋯ menu, not beside the view controls, and still asks', async () => {
    const room = pausedRoom();
    const finished = { ...room, runtime: { ...room.runtime, status: 'completed' } } as PersistedRoom;
    const onDelete = vi.fn();
    await render(finished, onDelete);

    // Deleting is not a peer of Timeline, Watch and Stop: it takes opening the
    // menu, which is what keeps a destructive control from being clicked by
    // accident. The menu portals, so it is not clipped by this bar's own
    // 50px `overflow-hidden` either.
    expect(container.querySelector('button[aria-label="Delete Room"]')).toBeNull();
    const more = container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
    expect(more).not.toBeNull();

    act(() => { more?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); });
    const item = [...document.querySelectorAll('[role="menuitem"]')]
      .find((node) => node.textContent?.includes('Delete Room'));
    expect(item).toBeDefined();

    act(() => { (item as HTMLElement).click(); });
    // It still asks, with the copy that says what is preserved.
    expect(document.body.textContent).toContain('Delete this Room?');
    expect(document.body.textContent).toContain('worktree cannot be preserved');
    expect(onDelete).not.toHaveBeenCalled();

    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')]
      .find((button) => button.textContent === 'Delete Room');
    await act(async () => { confirm?.click(); });
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
