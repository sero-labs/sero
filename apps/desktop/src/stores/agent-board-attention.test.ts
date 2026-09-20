// @vitest-environment node
/**
 * The workspace tree's one sentence per workspace, derived from the watched
 * indexes alone.
 */

import { describe, expect, it } from 'vitest';
import type {
  ArchitectIndexView,
  OrchestratorBoardIndexView,
  OrchestratorBoardRoomIndexView,
  OrchestratorBoardRoomView,
} from '@sero-ai/common';
import { workspaceAttention } from './agent-board';
import type { WorkspaceBoardSlice } from '@/types/board';

function slice(partial: Partial<WorkspaceBoardSlice>): WorkspaceBoardSlice {
  return { index: null, rooms: null, issues: [], openPrs: [], ...partial };
}

function room(partial: Partial<OrchestratorBoardRoomView>): OrchestratorBoardRoomView {
  return {
    id: 'room-1',
    title: 'Release triage',
    status: 'running',
    memberCount: 3,
    activeMemberCount: 0,
    costUsd: 1,
    maxCostUsd: 10,
    startedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    attentionCount: 0,
    deliveredAt: null,
    deliveryRef: null,
    ...partial,
  };
}

const waitingRooms: OrchestratorBoardRoomIndexView = { rooms: [room({ attentionCount: 1 })] };

const stoppedWorkflows: OrchestratorBoardIndexView = {
  loops: [
    {
      id: 'loop-1',
      title: 'Nightly docs',
      status: 'blocked',
      updatedAt: '2026-09-10T00:00:00.000Z',
      block: { reason: 'The cap was reached', limit: 'maxCostUsd' },
    },
  ],
};

describe('workspaceAttention', () => {
  it('names a Room that waits on the user', () => {
    const state = { slices: { ws: slice({ rooms: waitingRooms }) }, architect: null };
    expect(workspaceAttention(state, 'ws')).toEqual({
      state: 'waiting-for-you',
      sentence: 'Release triage: Open the Room to answer.',
    });
  });

  it('names a stopped Workflow with what stopped it and what to do', () => {
    const state = { slices: { ws: slice({ index: stoppedWorkflows }) }, architect: null };
    expect(workspaceAttention(state, 'ws')).toEqual({
      state: 'stopped',
      sentence: 'Nightly docs: The cap was reached. Raise the cap.',
    });
  });

  it('gives one sentence when a Room and a Workflow both wait', () => {
    const state = {
      slices: { ws: slice({ index: stoppedWorkflows, rooms: waitingRooms }) },
      architect: null,
    };
    expect(workspaceAttention(state, 'ws')?.sentence).toBe('Nightly docs: The cap was reached. Raise the cap.');
  });

  it('says nothing when the records cannot be read', () => {
    const state = { slices: { ws: slice({}) }, architect: null };
    expect(workspaceAttention(state, 'ws')).toBeNull();
    expect(workspaceAttention({ slices: {}, architect: null }, 'ws')).toBeNull();
  });

  it('says nothing about work that needs nobody', () => {
    const state = {
      slices: {
        ws: slice({
          index: { loops: [{ id: 'l', title: 'Armed', status: 'active', updatedAt: '' }] },
          rooms: { rooms: [room({ status: 'completed' })] },
        }),
      },
      architect: null,
    };
    expect(workspaceAttention(state, 'ws')).toBeNull();
  });

  it('gives the Architect sentence for the project in that workspace', () => {
    const architect: ArchitectIndexView = {
      projects: [
        {
          id: 'p1',
          name: 'Sero docs',
          workspaceId: 'other',
          activity: { state: 'stopped', headline: 'Stopped by the spend cap', owner: '', action: 'Raise the cap' },
        },
        {
          id: 'p2',
          name: 'Ink and Bones',
          workspaceId: 'ws',
          activity: { state: 'waiting-for-you', headline: '2 decisions need you', owner: '', action: 'Answer 2 decisions' },
        },
      ],
    };
    expect(workspaceAttention({ slices: {}, architect }, 'ws')?.sentence).toBe(
      'Ink and Bones: 2 decisions need you. Answer 2 decisions.',
    );
    expect(workspaceAttention({ slices: {}, architect }, 'other')?.sentence).toBe(
      'Sero docs: Stopped by the spend cap. Raise the cap.',
    );
  });
});
