// @vitest-environment jsdom

/**
 * The Room header names the Architect project that opened it (spec
 * orchestrator-ui). The name is a creation-time snapshot; the link uses the
 * project id, so a renamed project is still reached.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedRoom } from '../../shared/room-types';
import { RoomTopBar } from '../components/RoomTopBar';

const { openSeroApp } = vi.hoisted(() => ({ openSeroApp: vi.fn(async () => true) }));
vi.mock('@sero-ai/app-runtime', () => ({ openSeroApp }));

const T0 = Date.parse('2026-09-01T10:00:00.000Z');
const HOUR = 60 * 60_000;

function room(definition: Record<string, unknown> = {}): PersistedRoom {
  return {
    definition: {
      title: 'Items and combat',
      envelope: { maxWallClockMs: HOUR, maxCostUsd: 2, maxActiveTurns: 3, maxTokens: 1e9, maxRosterRevisions: 5 },
      ...definition,
    },
    runtime: {
      status: 'running',
      startedAt: new Date(T0).toISOString(),
      endedAt: null,
      activeMs: 0,
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

describe('the Room header project link', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openSeroApp.mockClear();
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  async function render(
    value: PersistedRoom,
    overrides: Partial<Parameters<typeof RoomTopBar>[0]> = {},
  ) {
    await act(async () => root.render(
      <RoomTopBar
        room={value}
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
        onDelete={() => undefined}
        {...overrides}
      />,
    ));
  }

  const projectLink = (label: string) => [...container.querySelectorAll('button')]
    .find((node) => node.textContent === label);

  it('names the project beside the state and opens it in Architect', async () => {
    await render(room({ projectContext: { projectId: 'proj_dungeon', runId: 'run-1', projectName: 'DungeonExplorer' } }));

    const link = projectLink('DungeonExplorer');
    expect(link).toBeDefined();
    act(() => { link?.click(); });
    expect(openSeroApp).toHaveBeenCalledWith('architect', { projectId: 'proj_dungeon' });
  });

  it('shows no project when the record has an id but no name', async () => {
    await render(room({ projectContext: { projectId: 'proj_dungeon', runId: 'run-1' } }));

    expect(projectLink('DungeonExplorer')).toBeUndefined();
    expect(container.textContent).not.toContain('DungeonExplorer');
  });

  it('shows no project when the Room was created directly', async () => {
    await render(room());

    expect(openSeroApp).not.toHaveBeenCalled();
    expect(container.querySelectorAll('button')).not.toHaveLength(0);
  });

  it('keeps the project name on hold without repeating the hold\'s actions', async () => {
    await render(
      room({ projectContext: { projectId: 'proj_dungeon', runId: 'run-1', projectName: 'DungeonExplorer' } }),
      {
        holding: true,
        waitingForYou: true,
        controls: { message: true, resume: true, stop: true },
      },
    );

    // The name is part of the header, not one of the hold's controls.
    expect(projectLink('DungeonExplorer')).toBeDefined();
    expect(container.textContent).toContain('waiting for you');
    // Message, Resume and Stop belong to the hold card on this page.
    expect(container.querySelector('button[aria-label="Message the team"]')).toBeNull();
    expect([...container.querySelectorAll('button')].some((node) => node.textContent === 'Resume')).toBe(false);
    expect([...container.querySelectorAll('button')].some((node) => node.textContent === 'Stop')).toBe(false);
  });
});
