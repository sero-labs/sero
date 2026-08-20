import { describe, expect, it, vi } from 'vitest';
import { authorizePaidBuild, type SpendHost } from './spend-guard';
import { ledgerForDay, recordRun, settleRun, utcDay } from '../shared/ledger';
import { DEFAULT_STATE, type BuildEstimate, type GraphifyState, type ModelChoice } from '../shared/types';

const NOW = new Date('2026-08-20T10:00:00Z');
const MODEL: ModelChoice = { backend: 'openai', modelId: 'gpt-4.1-mini', chosenAt: 'now' };
const WORKSPACE = { workspaceId: 'ws1', name: 'One', path: '/p/one' };

function estimate(overrides: Partial<BuildEstimate> = {}): BuildEstimate {
  return {
    files: 10,
    bytes: 40_000,
    truncated: false,
    estimatedInputTokens: 10_000,
    estimatedOutputTokens: 2_000,
    estimatedCostUsd: 0.01,
    ...overrides,
  };
}

function makeHost(value: BuildEstimate, confirmed = true): SpendHost & { confirm: ReturnType<typeof vi.fn> } {
  return {
    estimateBuild: vi.fn().mockResolvedValue(value),
    confirm: vi.fn().mockResolvedValue(confirmed),
  };
}

function stateWith(patch: (state: GraphifyState) => void): GraphifyState {
  const state = structuredClone(DEFAULT_STATE);
  state.settings.model = MODEL;
  patch(state);
  return state;
}

describe('authorizePaidBuild', () => {
  it('refuses before scanning when no model is chosen', async () => {
    const host = makeHost(estimate());
    const state = stateWith((s) => { s.settings.model = null; });
    const decision = await authorizePaidBuild(host, state, WORKSPACE, { alwaysConfirm: false, now: NOW });
    expect(decision.allowed).toBe(false);
    expect(host.estimateBuild).not.toHaveBeenCalled();
  });

  it('refuses while paused', async () => {
    const state = stateWith((s) => { s.settings.paused = true; });
    const decision = await authorizePaidBuild(makeHost(estimate()), state, WORKSPACE, { alwaysConfirm: false, now: NOW });
    expect(decision).toMatchObject({ allowed: false, kind: 'paused' });
  });

  it('refuses a build over the per-build cap', async () => {
    const state = stateWith((s) => { s.settings.caps = { ...s.settings.caps, maxCostPerBuildUsd: 1 }; });
    const decision = await authorizePaidBuild(makeHost(estimate({ estimatedCostUsd: 5 })), state, WORKSPACE, { alwaysConfirm: false, now: NOW });
    expect(decision).toMatchObject({ allowed: false, kind: 'cap' });
  });

  it('refuses when today plus this build would pass the daily cap', async () => {
    const state = stateWith((s) => {
      s.settings.caps = { ...s.settings.caps, maxCostPerDayUsd: 2 };
      s.spend = { day: utcDay(NOW), usd: 1.95, runs: [] };
    });
    const decision = await authorizePaidBuild(makeHost(estimate({ estimatedCostUsd: 0.5 })), state, WORKSPACE, { alwaysConfirm: false, now: NOW });
    expect(decision).toMatchObject({ allowed: false, kind: 'cap' });
  });

  it('refuses a tree bigger than the file cap', async () => {
    const state = stateWith(() => {});
    const decision = await authorizePaidBuild(makeHost(estimate({ truncated: true })), state, WORKSPACE, { alwaysConfirm: false, now: NOW });
    expect(decision).toMatchObject({ allowed: false, kind: 'cap' });
  });

  it('always asks when the model has no known price', async () => {
    // An unpriced model cannot be checked against a cap. Proceeding silently
    // would turn "unknown price" into "no limit".
    const host = makeHost(estimate({ estimatedCostUsd: null }));
    const decision = await authorizePaidBuild(host, stateWith(() => {}), WORKSPACE, { alwaysConfirm: false, now: NOW });
    expect(host.confirm).toHaveBeenCalled();
    expect(decision.allowed).toBe(true);
  });

  it('treats a declined dialog as a no', async () => {
    const host = makeHost(estimate(), false);
    const decision = await authorizePaidBuild(host, stateWith(() => {}), WORKSPACE, { alwaysConfirm: true, now: NOW });
    expect(decision).toMatchObject({ allowed: false, kind: 'declined' });
  });

  it('names the model and the estimate in what it asks', async () => {
    const host = makeHost(estimate());
    await authorizePaidBuild(host, stateWith(() => {}), WORKSPACE, { alwaysConfirm: true, now: NOW });
    const body = host.confirm.mock.calls[0][0].body as string;
    expect(body).toContain('gpt-4.1-mini');
    expect(body).toContain('10 files');
  });
});

describe('the spend ledger', () => {
  it('clears yesterday total when the day rolls over', () => {
    const ledger = ledgerForDay({ day: '2026-08-19', usd: 9, runs: [] }, '2026-08-20');
    expect(ledger).toEqual({ day: '2026-08-20', usd: 0, runs: [] });
  });

  it('accumulates within a day', () => {
    const run = { id: 'ws1:t1', workspaceId: 'ws1', job: 'build' as const, backend: 'openai' as const, model: 'm', inputTokens: 1, outputTokens: 1, usd: 0.5, at: 'now' };
    const first = recordRun({ day: '2026-08-20', usd: 0, runs: [] }, run, '2026-08-20');
    const second = recordRun(first, { ...run, id: 'ws1:t2' }, '2026-08-20');
    expect(second.usd).toBe(1);
    expect(second.runs).toHaveLength(2);
  });

  it('settles a reservation against measured usage', () => {
    const reserved = recordRun({ day: '2026-08-20', usd: 0, runs: [] }, {
      id: 'ws1:t1', workspaceId: 'ws1', job: 'build', backend: 'openai', model: 'm',
      inputTokens: 10_000, outputTokens: 0, usd: 2, at: 'now', estimated: true,
    }, '2026-08-20');
    expect(reserved.usd).toBe(2);

    const settled = settleRun(reserved, 'ws1:t1', { inputTokens: 4000, outputTokens: 800, usd: 0.8 });
    expect(settled.usd).toBeCloseTo(0.8);
    expect(settled.runs[0].estimated).toBe(false);
  });

  it('keeps the reservation when a build never settles', () => {
    // A build that consumed tokens and then failed reports nothing. Dropping
    // its debit would let the same workspace be retried all day against a cap
    // that still reads $0.
    const reserved = recordRun({ day: '2026-08-20', usd: 0, runs: [] }, {
      id: 'ws1:t1', workspaceId: 'ws1', job: 'build', backend: 'openai', model: 'm',
      inputTokens: 10_000, outputTokens: 0, usd: 2, at: 'now', estimated: true,
    }, '2026-08-20');
    expect(settleRun(reserved, 'ws1:other', { inputTokens: 1, outputTokens: 1, usd: 9 })).toEqual(reserved);
    expect(reserved.usd).toBe(2);
  });
});
