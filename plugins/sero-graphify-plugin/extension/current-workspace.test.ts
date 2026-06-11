import { describe, expect, it } from 'vitest';
import { resolveCurrentWorkspace } from './current-workspace';
import { DEFAULT_STATE, type GraphifyState } from '../shared/types';

const state: GraphifyState = {
  ...structuredClone(DEFAULT_STATE),
  workspaces: {
    ws1: { workspaceId: 'ws1', name: 'One', path: '/home/me/projects/one', enabled: true, status: 'idle' },
    ws2: { workspaceId: 'ws2', name: 'Two', path: '/home/me/projects/two', enabled: true, status: 'idle' },
  },
};

describe('resolveCurrentWorkspace', () => {
  it('prefers SERO_WORKSPACE_ID env', () => {
    expect(resolveCurrentWorkspace(state, '/anything', { SERO_WORKSPACE_ID: 'ws2' })?.workspaceId).toBe('ws2');
  });
  it('matches by host path prefix', () => {
    expect(resolveCurrentWorkspace(state, '/home/me/projects/one/src', {})?.workspaceId).toBe('ws1');
  });
  it('falls back to basename match (container /workspace cwd)', () => {
    expect(resolveCurrentWorkspace(state, '/workspace', {})).toBeNull(); // ambiguous basename → null
    expect(resolveCurrentWorkspace(state, '/two', {})?.workspaceId).toBe('ws2');
  });
});
