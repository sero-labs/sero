import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, type GraphifyState, type WorkspaceIndexEntry } from '../shared/types';
import { authorizeCommunityNaming } from './community-naming';

const NOW = new Date('2026-08-20T10:00:00Z');
const WORKSPACE: WorkspaceIndexEntry = {
  workspaceId: 'ws1',
  name: 'One',
  path: '/p/one',
  enabled: true,
  status: 'idle',
  stats: { nodes: 10, edges: 20, communities: 12, inputTokens: 100, outputTokens: 50 },
};

function state(): GraphifyState {
  const value = structuredClone(DEFAULT_STATE);
  value.settings.model = { backend: 'openai', modelId: 'gpt-4.1-mini', chosenAt: 'now' };
  return value;
}

describe('authorizeCommunityNaming', () => {
  it('prices from the measured community count and always asks', async () => {
    const host = { confirm: vi.fn().mockResolvedValue(true) };
    const decision = await authorizeCommunityNaming(host, state(), WORKSPACE, NOW);
    expect(decision.allowed).toBe(true);
    expect(host.confirm).toHaveBeenCalledOnce();
    expect(host.confirm.mock.calls[0][0].body).toContain('12 communities');
    expect(host.confirm.mock.calls[0][0].body).toContain('gpt-4.1-mini');
  });

  it('refuses when there is no built community count', async () => {
    const host = { confirm: vi.fn() };
    const decision = await authorizeCommunityNaming(host, state(), { ...WORKSPACE, stats: undefined }, NOW);
    expect(decision).toMatchObject({ allowed: false, kind: 'refused' });
    expect(host.confirm).not.toHaveBeenCalled();
  });

  it('applies the daily cost cap before asking', async () => {
    const value = state();
    value.settings.caps.maxCostPerDayUsd = 0;
    const host = { confirm: vi.fn() };
    const decision = await authorizeCommunityNaming(host, value, WORKSPACE, NOW);
    expect(decision).toMatchObject({ allowed: false, kind: 'cap' });
    expect(host.confirm).not.toHaveBeenCalled();
  });

  it('explains that an unpriced model has no enforceable total-token cap', async () => {
    const value = state();
    value.settings.model = { backend: 'openai', modelId: 'unknown-model', chosenAt: 'now' };
    const host = { confirm: vi.fn().mockResolvedValue(true) };
    await authorizeCommunityNaming(host, value, WORKSPACE, NOW);
    expect(host.confirm.mock.calls[0][0].body).toMatch(/no total-token stop/i);
  });
});
